const { validateOwnership } = require('../uploadRegistryService');
const { extractDocumentText } = require('../extraction/documentExtractionService');
const { listKnowledgeSources } = require('../knowledgeService');
const { createReport, findReportByUploadId, getUserReportById } = require('../reportService');

const { segmentText } = require('../../algorithms/errorDetection/statementSegmenter');
const { preprocessText } = require('../../algorithms/errorDetection/textPreprocessor');
const { selectCandidateEvidence } = require('../../algorithms/errorDetection/candidateSelector');
const { vectorizeStatementAndCandidates } = require('../../algorithms/errorDetection/tfidf');
const { calculateCosineSimilarity } = require('../../algorithms/errorDetection/cosineSimilarity');
const { detectContradiction } = require('../../algorithms/errorDetection/contradictionDetector');
const { classifyFinding } = require('../../algorithms/errorDetection/classifier');

/**
 * Runs the deterministic Error Detection algorithm pipeline over a list of statement objects
 * @param {Array<Object|string>} rawStatements 
 * @param {Array<Object>} activeKnowledgeSources 
 * @returns {{resultsList: Array<Object>, summary: Object}}
 */
function analyzeStatementsAgainstSources(rawStatements, activeKnowledgeSources) {
  let statements = [];

  if (typeof rawStatements === 'string') {
    statements = segmentText(rawStatements);
  } else if (Array.isArray(rawStatements)) {
    statements = rawStatements.map((stmt, idx) => {
      if (typeof stmt === 'string') {
        const prep = preprocessText(stmt);
        return {
          statementId: `statement-${idx + 1}`,
          index: idx + 1,
          originalStatement: stmt.trim(),
          statement: stmt.trim(),
          normalizedStatement: prep.normalizedText,
        };
      }
      const prep = preprocessText(stmt.originalStatement || stmt.statement || '');
      return {
        statementId: stmt.statementId || `statement-${idx + 1}`,
        index: stmt.index || idx + 1,
        originalStatement: stmt.originalStatement || stmt.statement || '',
        statement: stmt.statement || stmt.originalStatement || '',
        normalizedStatement: stmt.normalizedStatement || prep.normalizedText,
      };
    });
  }

  const resultsList = [];
  let verifiedCount = 0;
  let contradictedCount = 0;
  let insufficientCount = 0;
  let notAnalyzedCount = 0;

  for (const stmt of statements) {
    const textToAnalyze = stmt.originalStatement || stmt.statement || '';
    const wordCount = textToAnalyze.trim().split(/\s+/).filter(Boolean).length;

    if (!textToAnalyze || textToAnalyze.trim().length < 10 || wordCount < 3) {
      notAnalyzedCount++;
      const result = classifyFinding(stmt, null, 0.0, { isContradiction: false }, 0);
      resultsList.push({
        statementId: stmt.statementId,
        index: stmt.index,
        ...result,
        classification: 'not_analyzed',
        status: 'not_analyzed',
        reason: 'Statement is below minimum length or word count required for factual analysis.',
      });
      continue;
    }

    const statementPrep = preprocessText(textToAnalyze);

    // Step 4: Candidate evidence selection via keyword overlap
    const candidates = selectCandidateEvidence(textToAnalyze, activeKnowledgeSources);

    if (!candidates || candidates.length === 0) {
      insufficientCount++;
      const result = classifyFinding(stmt, null, 0.0, { isContradiction: false }, 0);
      resultsList.push({
        statementId: stmt.statementId,
        index: stmt.index,
        ...result,
      });
      continue;
    }

    // Step 5: TF-IDF Vectorization over candidate comparison corpus
    const { statementVector, candidateVectors } = vectorizeStatementAndCandidates(statementPrep.tokens, candidates);

    // Step 6: Cosine Similarity calculation
    let bestSimilarityScore = 0.0;
    let bestCandidate = candidates[0];

    for (let i = 0; i < candidates.length; i++) {
      const candVector = candidateVectors[i];
      const similarity = calculateCosineSimilarity(statementVector, candVector);

      if (similarity > bestSimilarityScore) {
        bestSimilarityScore = similarity;
        bestCandidate = candidates[i];
      }
    }

    // Step 8: Contradiction heuristic check
    const contradictionResult = detectContradiction(
      textToAnalyze,
      bestCandidate.text,
      bestCandidate.matchingTokens,
      bestSimilarityScore
    );

    // Step 7: Classification & severity calculation
    const findingResult = classifyFinding(
      stmt,
      bestCandidate,
      bestSimilarityScore,
      contradictionResult,
      candidates.length
    );

    if (findingResult.classification === 'verified') {
      verifiedCount++;
    } else if (findingResult.classification === 'potential_contradiction') {
      contradictedCount++;
    } else if (findingResult.classification === 'not_analyzed') {
      notAnalyzedCount++;
    } else {
      insufficientCount++;
    }

    resultsList.push({
      statementId: stmt.statementId,
      index: stmt.index,
      ...findingResult,
    });
  }

  const summary = {
    totalStatements: statements.length,
    analyzedStatements: verifiedCount + contradictedCount + insufficientCount,
    verified: verifiedCount,
    contradictions: contradictedCount,
    contradicted: contradictedCount, // Backwards compatibility key
    insufficientEvidence: insufficientCount,
    notAnalyzed: notAnalyzedCount,
  };

  return {
    resultsList,
    summary,
  };
}

const { SUPPORTED_DOMAIN } = require('../../constants/domainConstants');
const { validateDomain } = require('./domainValidationService');
const { detectTopics } = require('./topicDetectionService');
const { retrieveRelevantKnowledge } = require('./knowledgeRetrievalService');
const { extractAndPrepareStatements } = require('./statementExtractionService');
const { compareStatementsToKnowledge } = require('./statementComparisonService');
const { classifyStatements } = require('./errorClassificationService');

/**
 * Executes Error Detection Analysis on uploaded document(s) against active trusted sources
 */
async function analyzeErrorDetectionDocument(user, temporaryUploadId, options = {}) {
  const { onProgress, abortSignal } = options;

  if (abortSignal?.aborted) {
    throw new Error('Analysis cancelled by user');
  }

  const userUid = typeof user === 'string' ? user : user.uid;
  const userObj = typeof user === 'string' ? { uid: userUid } : user;

  // Step 1: Validate temporary upload reference and ownership
  const session = validateOwnership(temporaryUploadId, userUid);

  if (!session.files || session.files.length === 0) {
    const err = new Error('No uploaded document files found in session');
    err.statusCode = 400;
    throw err;
  }

  // Idempotency check: prevent duplicate report creation for the same analysis session (Step 29)
  const existingReportId = await findReportByUploadId(userUid, temporaryUploadId);
  if (existingReportId) {
    try {
      const existingReport = await getUserReportById(existingReportId, userUid);
      return {
        success: true,
        message: 'Analysis report already exists for this session',
        reportId: existingReportId,
        reportType: 'error_detection',
        domain: existingReport.domain || SUPPORTED_DOMAIN,
        primaryTopic: existingReport.primaryTopic || 'Computer Science',
        detectedTopics: existingReport.detectedTopics || [],
        summary: existingReport.summary,
        analysis: existingReport,
      };
    } catch (existingErr) {
      console.warn('[ErrorDetectionService] Existing report lookup failed, regenerating:', existingErr.message);
    }
  }

  if (onProgress) {
    onProgress({
      stage: 'extracting',
      stageTitle: 'Extracting Document Text',
      percent: 15,
      currentStep: 2,
      message: `Extracting text & OCR scanning from ${session.files.length} document(s)…`
    });
  }

  const allDocumentsMeta = [];
  const allFindings = [];
  const allDetectedTopics = new Set();
  let globalPrimaryTopic = null;
  let lastComparisonResult = null;
  let lastClassificationResult = null;

  const aggregateSummary = {
    totalDocuments: session.files.length,
    processedDocuments: 0,
    failedDocuments: 0,
    unsupportedDocuments: 0,
    totalStatements: 0,
    supported: 0,
    incorrect: 0,
    misleading: 0,
    unsupported: 0,
    noKnowledgeAvailable: 0,
    // Aliases for UI compatibility
    verified: 0,
    potentialContradictions: 0,
    insufficientEvidence: 0,
    notAnalyzed: 0,
  };

  const aggregateStatementSummary = {
    totalCandidates: 0,
    readyStatements: 0,
    ignoredStatements: 0,
    failedStatements: 0,
  };

  let globalIndex = 1;

  for (let docIdx = 0; docIdx < session.files.length; docIdx++) {
    if (abortSignal?.aborted) {
      throw new Error('Analysis cancelled by user');
    }

    const userFile = session.files[docIdx];
    const docId = `doc_${docIdx + 1}_${temporaryUploadId}`;

    const docMeta = {
      documentId: docId,
      fileName: userFile.originalName,
      originalName: userFile.originalName,
      mimeType: userFile.mimeType,
      status: 'processing',
      statementCount: 0,
      detectedTopics: [],
      summary: { supported: 0, incorrect: 0, misleading: 0, unsupported: 0, noKnowledgeAvailable: 0 },
      errorMessage: null,
    };

    if (onProgress) {
      const docPct = Math.round(15 + ((docIdx + 1) / session.files.length) * 35);
      onProgress({
        stage: 'extracting',
        stageTitle: 'Extracting Document Text',
        percent: docPct,
        currentStep: 2,
        message: `Extracting text from ${userFile.originalName} (${docIdx + 1}/${session.files.length})…`,
        fileUpdate: {
          name: userFile.originalName,
          status: 'extracting',
          progress: 50
        }
      });
    }

    try {
      const onDocOcrProgress = (ocrPct) => {
        if (onProgress) {
          const docBasePct = 15 + Math.round((docIdx / session.files.length) * 35);
          const currentDocPct = Math.round(docBasePct + (ocrPct / 100) * (35 / session.files.length));
          onProgress({
            stage: 'extracting',
            stageTitle: 'OCR Processing',
            percent: Math.min(50, Math.max(15, currentDocPct)),
            currentStep: 2,
            message: `Optical Character Recognition (${ocrPct}%) on ${userFile.originalName}…`,
            fileUpdate: {
              name: userFile.originalName,
              status: 'extracting',
              progress: ocrPct
            }
          });
        }
      };

      // Step 2: Text extraction
      const extractionResult = await extractDocumentText(
        userFile.uploadPath, 
        userFile.originalName, 
        userFile.mimeType,
        { onProgress: onDocOcrProgress }
      );
      const extraction = extractionResult.extraction || {};
      const userText = extraction.text || '';

      docMeta.extractionMethod = extraction.extractionMethod || 'normal';
      docMeta.pageCount = extraction.pageCount || 1;
      docMeta.ocrPages = extraction.ocrPages || [];
      docMeta.qualityNotes = extraction.qualityNotes || null;

      if (!userText || userText.trim().length === 0) {
        docMeta.status = 'failed';
        docMeta.errorMessage = 'Extracted document text is empty.';
        aggregateSummary.failedDocuments++;
        allDocumentsMeta.push(docMeta);
        if (onProgress) {
          onProgress({
            fileUpdate: {
              name: userFile.originalName,
              status: 'failed',
              error: 'Extracted text is empty'
            }
          });
        }
        continue;
      }

      // Step 2b: Domain Validation (Task 2)
      if (onProgress) {
        onProgress({
          stage: 'validating_domain',
          stageTitle: 'Domain Validation',
          percent: 52,
          currentStep: 2,
          message: `Verifying Computer Science technical domain for ${userFile.originalName}…`
        });
      }

      const domainValidation = validateDomain(userText);
      if (!domainValidation.supported) {
        docMeta.status = 'unsupported';
        docMeta.errorMessage = domainValidation.message || 'Unsupported domain';
        aggregateSummary.unsupportedDocuments++;
        allDocumentsMeta.push(docMeta);
        continue;
      }

      // Step 2c: Topic Detection (Task 3)
      const topicDetection = detectTopics(userText);
      docMeta.primaryTopic = topicDetection.primaryTopic;
      docMeta.detectedTopics = topicDetection.detectedTopics || [];
      if (!globalPrimaryTopic) globalPrimaryTopic = topicDetection.primaryTopic;
      (topicDetection.detectedTopics || []).forEach(t => allDetectedTopics.add(t));

      // Step 2d: Relevant Knowledge Retrieval (Task 7)
      const retrievalResult = await retrieveRelevantKnowledge(topicDetection);

      if (onProgress) {
        onProgress({
          stage: 'extracting_statements',
          stageTitle: 'Extracting Statements',
          percent: 55,
          currentStep: 3,
          message: `Extracting factual statements from ${userFile.originalName}…`
        });
      }

      // Step 2e: Statement Extraction & Preparation (Task 8 / E1)
      const statementResult = extractAndPrepareStatements(userText, {
        documentId: docId,
        documentName: userFile.originalName,
        topicDetection,
        retrievalResult,
        pages: extraction.pages || [],
      });

      const readyStatements = statementResult.readyStatements || [];
      const retrievedKnowledge = retrievalResult.entries || [];

      aggregateStatementSummary.totalCandidates += statementResult.summary?.totalCandidates || readyStatements.length;
      aggregateStatementSummary.readyStatements += statementResult.summary?.readyStatements || readyStatements.length;
      aggregateStatementSummary.ignoredStatements += statementResult.summary?.ignoredStatements || 0;
      aggregateStatementSummary.failedStatements += statementResult.summary?.failedStatements || 0;

      if (onProgress) {
        onProgress({
          stage: 'verifying',
          stageTitle: 'Factual Verification',
          percent: 75,
          currentStep: 3,
          message: `Verifying ${readyStatements.length} statements against verified knowledge sources…`
        });
      }

      // Step 2f: TF-IDF + Cosine Similarity Comparison (Task 9)
      const comparisonResult = compareStatementsToKnowledge(readyStatements, retrievedKnowledge);
      lastComparisonResult = comparisonResult;

      // Step 2g: Factual Error Classification (Task 10)
      const classificationResult = classifyStatements(comparisonResult);
      lastClassificationResult = classificationResult;

      const docResults = classificationResult.results || [];
      docMeta.status = 'completed';
      docMeta.statementCount = docResults.length;
      docMeta.summary = classificationResult.summary || { supported: 0, incorrect: 0, misleading: 0, unsupported: 0, noKnowledgeAvailable: 0 };
      aggregateSummary.processedDocuments++;

      if (onProgress) {
        onProgress({
          stage: 'finalizing',
          stageTitle: 'Generating Report',
          percent: 90,
          currentStep: 4,
          message: `Finalizing findings and report for ${userFile.originalName}…`,
          fileUpdate: {
            name: userFile.originalName,
            status: 'completed',
            progress: 100
          }
        });
      }

      // Aggregate counts
      aggregateSummary.totalStatements += docResults.length;
      aggregateSummary.supported += docMeta.summary.supported;
      aggregateSummary.incorrect += docMeta.summary.incorrect;
      aggregateSummary.misleading += docMeta.summary.misleading;
      aggregateSummary.unsupported += docMeta.summary.unsupported;
      aggregateSummary.noKnowledgeAvailable += docMeta.summary.noKnowledgeAvailable;

      // Aliases update
      aggregateSummary.verified += docMeta.summary.supported;
      aggregateSummary.potentialContradictions += docMeta.summary.incorrect;
      aggregateSummary.insufficientEvidence += docMeta.summary.unsupported;

      // Format individual findings with Task 10 canonical fields and UI legacy aliases
      for (const item of docResults) {
        const itemEvidence = item.evidence || {};
        const isVerified = item.classification === 'SUPPORTED';
        const isContradiction = item.classification === 'INCORRECT';
        const isMisleading = item.classification === 'MISLEADING';
        const isNoKnowledge = item.classification === 'NO_KNOWLEDGE_AVAILABLE';

        const statusAlias = isVerified
          ? 'verified'
          : (isContradiction ? 'potential_contradiction' : (isMisleading ? 'potential_contradiction' : (isNoKnowledge ? 'not_analyzed' : 'insufficient_evidence')));

        const findingRecord = {
          index: globalIndex++,
          statementId: item.statementId || `stmt_${docIdx}_${globalIndex}`,
          documentId: docId,
          documentName: userFile.originalName,
          sourcePage: item.sourcePage || item.page || null,
          page: item.sourcePage || item.page || null,
          statement: item.statementText,
          statementText: item.statementText,
          originalStatement: item.statementText,
          topic: item.topic || topicDetection.primaryTopic,
          classification: item.classification,
          status: statusAlias,
          reason: item.classificationReason,
          explanation: item.classificationReason,
          similarityScore: item.comparison?.similarity || 0,
          similarity: item.comparison?.similarity || 0,
          evidence: itemEvidence && (itemEvidence.content || itemEvidence.text) ? {
            knowledgeId: itemEvidence.knowledgeId || null,
            sourceId: itemEvidence.sourceId || null,
            title: itemEvidence.title || 'Trusted Source',
            sourceTitle: itemEvidence.title || 'Trusted Source',
            sourceName: itemEvidence.title || 'Trusted Source',
            content: itemEvidence.content || '',
            text: itemEvidence.content || '',
            sharedTerms: itemEvidence.sharedTerms || [],
          } : null,
        };

        allFindings.push(findingRecord);
      }

      allDocumentsMeta.push(docMeta);
    } catch (docErr) {
      console.error(`[ErrorDetectionService] Failure processing file ${userFile.originalName}:`, docErr);
      docMeta.status = 'failed';
      docMeta.errorMessage = docErr.message || 'Processing failed';
      aggregateSummary.failedDocuments++;
      allDocumentsMeta.push(docMeta);
    }
  }

  // Validate supported domain gate across batch
  const anySupportedDomain = allDocumentsMeta.some(d => d.status !== 'unsupported');
  if (!anySupportedDomain) {
    return {
      success: false,
      supported: false,
      message: 'TrustLens Error Detection currently supports Computer Science documents only. None of the uploaded files contained supported Computer Science content.',
      domain: 'Unsupported',
      evidence: null,
      analysis: null,
    };
  }

  const allFailed = allDocumentsMeta.every(d => d.status === 'failed');
  const reportStatus = allFailed ? 'failed' : 'completed';

  const reportTitle = session.files.length === 1
    ? `Error Detection - ${session.files[0].originalName}`
    : `Error Detection - ${session.files.length} Documents Batch`;

  const overallExtractionMethod = allDocumentsMeta.length === 1
    ? (allDocumentsMeta[0]?.extractionMethod || 'normal')
    : (allDocumentsMeta.some(d => d.extractionMethod === 'ocr' || d.extractionMethod === 'mixed' || d.extractionMethod === 'gemini-vision' || d.extractionMethod?.includes('ocr') || d.extractionMethod?.includes('vision')) ? 'mixed' : 'normal');

  const allOcrPages = allDocumentsMeta.flatMap(d => d.ocrPages || []);

  const reportDocumentMeta = {
    temporaryUploadId,
    originalName: session.files[0].originalName,
    documentCount: session.files.length,
    documents: allDocumentsMeta,
    domain: SUPPORTED_DOMAIN,
    primaryTopic: globalPrimaryTopic || 'Computer Science',
    detectedTopics: Array.from(allDetectedTopics),
    extractionMethod: overallExtractionMethod,
    ocrPages: allOcrPages,
    qualityNotes: allDocumentsMeta.map(d => d.qualityNotes).filter(Boolean).join(' ') || null,
  };

  const finalSummaryMeta = {
    ...aggregateSummary,
    statementSummary: aggregateStatementSummary,
    domain: SUPPORTED_DOMAIN,
    primaryTopic: globalPrimaryTopic || 'Computer Science',
    detectedTopics: Array.from(allDetectedTopics),
    extractionMethod: overallExtractionMethod,
    ocrPages: allOcrPages,
    qualityNotes: allDocumentsMeta.map(d => d.qualityNotes).filter(Boolean).join(' ') || null,
    uploadId: temporaryUploadId,
    comparisonSummary: lastComparisonResult ? {
      totalStatementsAnalyzed: lastComparisonResult.totalStatementsAnalyzed,
      matchedStatementsCount: lastComparisonResult.matchedStatementsCount,
      unmatchedStatementsCount: lastComparisonResult.unmatchedStatementsCount,
      threshold: lastComparisonResult.threshold,
    } : null,
  };

  // STEP 5, 6 & 15: SAVE PERSISTENT REPORT TO FIRESTORE BEFORE RETURNING
  const reportId = await createReport(
    userObj,
    'error-detection',
    reportTitle,
    reportDocumentMeta,
    finalSummaryMeta,
    allFindings,
    temporaryUploadId
  );

  return {
    success: true,
    message: 'Error detection analysis completed and report saved successfully',
    reportId,
    reportType: 'error-detection',
    status: reportStatus,
    domain: SUPPORTED_DOMAIN,
    primaryTopic: globalPrimaryTopic || 'Computer Science',
    detectedTopics: Array.from(allDetectedTopics),
    comparisonResult: lastComparisonResult,
    classificationResult: lastClassificationResult,
    summary: finalSummaryMeta,
    documents: allDocumentsMeta,
    findings: allFindings,
  };
}

module.exports = {
  analyzeStatementsAgainstSources,
  analyzeErrorDetectionDocument,
};
