const { generateHash } = require('./hasher');
const { generateShingles } = require('./shingler');
const { calculatePassageJaccard } = require('./jaccardSimilarity');
const { isCandidateForLevenshtein } = require('./candidateSelector');
const { calculateLevenshteinSimilarity } = require('./levenshtein');
const { classifyMatch } = require('./matchClassifier');

/**
 * Compares two documents passage by passage and aggregates pair results
 * @param {string} pairId 
 * @param {Object} docA 
 * @param {Object} docB 
 * @returns {Object} Complete document pair comparison result
 */
function compareAndAggregateDocumentPair(pairId, docA, docB) {
  const matches = [];
  const matchedPassageIdsA = new Set();
  const matchedPassageIdsB = new Set();
  const seenPairKeys = new Set();

  let exactMatchesCount = 0;
  let nearMatchesCount = 0;
  let partialMatchesCount = 0;
  let matchCounter = 1;
  let totalPassageComparisons = 0;
  let candidatePairsEvaluated = 0;

  // Pre-calculate hashes and shingle sets for docA passages
  const preparedPassagesA = docA.passages.map(p => ({
    ...p,
    hash: generateHash(p.normalizedText),
    shingleData: generateShingles(p.normalizedText),
  }));

  // Pre-calculate hashes and shingle sets for docB passages
  const preparedPassagesB = docB.passages.map(p => ({
    ...p,
    hash: generateHash(p.normalizedText),
    shingleData: generateShingles(p.normalizedText),
  }));

  for (const passA of preparedPassagesA) {
    for (const passB of preparedPassagesB) {
      totalPassageComparisons++;

      // Deduplication check: ignore if this exact passage pair was already matched
      const pairKey = `${passA.passageId}_vs_${passB.passageId}`;
      if (seenPairKeys.has(pairKey)) continue;

      let classification;

      // 1. Exact match fast-path via hash comparison
      if (passA.hash === passB.hash || passA.normalizedText === passB.normalizedText) {
        classification = classifyMatch(passA, passB, passA.hash, passB.hash, 1.0, 1.0);
      } else {
        // 2. Calculate Jaccard similarity considering shingles and tokens
        const jaccardScore = calculatePassageJaccard(
          passA.normalizedText,
          passB.normalizedText,
          passA.shingleData.shingleSet,
          passB.shingleData.shingleSet
        );

        // 3. Lightweight candidate filtering before Levenshtein
        if (!isCandidateForLevenshtein(passA, passB, jaccardScore)) {
          continue;
        }

        candidatePairsEvaluated++;

        // 4. Calculate normalized Levenshtein similarity
        const levenshteinScore = calculateLevenshteinSimilarity(passA.normalizedText, passB.normalizedText);

        // 5. Combined similarity scoring and classification
        classification = classifyMatch(passA, passB, passA.hash, passB.hash, jaccardScore, levenshteinScore);
      }

      if (['exact_match', 'near_identical', 'partial_match', 'exact-match', 'near-match'].includes(classification.matchType)) {
        seenPairKeys.add(pairKey);
        matchedPassageIdsA.add(passA.passageId);
        matchedPassageIdsB.add(passB.passageId);

        if (classification.matchType === 'exact_match') exactMatchesCount++;
        else if (classification.matchType === 'near_identical') nearMatchesCount++;
        else if (classification.matchType === 'partial_match') partialMatchesCount++;

        matches.push({
          matchId: `${pairId}-match-${matchCounter++}`,
          matchType: classification.matchType,
          similarity: classification.similarityPercentage,
          similarityScore: classification.combinedSimilarity,
          jaccardSimilarity: classification.jaccardSimilarity,
          levenshteinSimilarity: classification.levenshteinSimilarity,
          combinedSimilarity: classification.combinedSimilarity,
          documentAPassage: passA.originalText,
          documentBPassage: passB.originalText,
          documentA: {
            documentId: docA.documentId,
            documentName: docA.originalName || docA.documentName,
            passageIndex: passA.passageIndex,
            position: passA.position || passA.passageIndex,
            text: passA.originalText,
            passage: passA.originalText,
          },
          documentB: {
            documentId: docB.documentId,
            documentName: docB.originalName || docB.documentName,
            passageIndex: passB.passageIndex,
            position: passB.position || passB.passageIndex,
            text: passB.originalText,
            passage: passB.originalText,
          },
        });
      }
    }
  }

  // Calculate unique matched characters and Matched Content Percentage
  let matchedLengthA = 0;
  for (const passA of docA.passages) {
    if (matchedPassageIdsA.has(passA.passageId)) {
      matchedLengthA += passA.originalText.length;
    }
  }

  let matchedLengthB = 0;
  for (const passB of docB.passages) {
    if (matchedPassageIdsB.has(passB.passageId)) {
      matchedLengthB += passB.originalText.length;
    }
  }

  const totalLengthA = docA.passages.reduce((sum, p) => sum + p.originalText.length, 0);
  const totalLengthB = docB.passages.reduce((sum, p) => sum + p.originalText.length, 0);

  const referenceContentLength = Math.min(totalLengthA, totalLengthB);
  const uniqueMatchedContentLength = Math.max(matchedLengthA, matchedLengthB);

  let matchedContentPercentage = 0;
  if (referenceContentLength > 0 && uniqueMatchedContentLength > 0) {
    matchedContentPercentage = Math.min(100, Math.round((uniqueMatchedContentLength / referenceContentLength) * 100));
  }

  const overallPercentage = matchedContentPercentage;

  return {
    pairId,
    documentA: {
      documentId: docA.documentId,
      originalName: docA.originalName || docA.documentName,
      name: docA.originalName || docA.documentName,
      matchedContentPercentage,
    },
    documentB: {
      documentId: docB.documentId,
      originalName: docB.originalName || docB.documentName,
      name: docB.originalName || docB.documentName,
      matchedContentPercentage,
    },
    comparison: {
      passagesCompared: totalPassageComparisons,
      candidatePairs: candidatePairsEvaluated,
      exactMatchCount: exactMatchesCount,
      nearMatchCount: nearMatchesCount,
      partialMatchCount: partialMatchesCount,
      matchedContentPercentage,
      overallSimilarity: overallPercentage,
    },
    overallMatchedContentPercentage: overallPercentage,
    similarity: overallPercentage, // UI backwards compatibility
    totalMatches: matches.length,
    exactMatches: exactMatchesCount,
    nearMatches: nearMatchesCount + partialMatchesCount,
    matches,
    algorithm: {
      shingleSize: 5,
      method: 'pairwise_shingling_jaccard_levenshtein_hashing',
    },
  };
}

/**
 * Builds overall summary metrics across all pairwise document results
 * @param {number} totalDocuments 
 * @param {Array<Object>} pairResults 
 * @returns {Object} Overall summary object
 */
function buildOverallAnalysisSummary(totalDocuments, pairResults) {
  let totalPairsWithMatches = 0;
  let totalExactMatches = 0;
  let totalNearMatches = 0;
  let totalPartialMatches = 0;
  let highestMatchedContentPercentage = 0;

  for (const pair of pairResults) {
    if (pair.totalMatches > 0 || pair.overallMatchedContentPercentage > 0) {
      totalPairsWithMatches++;
    }

    const exact = pair.comparison ? pair.comparison.exactMatchCount : (pair.exactMatches || 0);
    const near = pair.comparison ? pair.comparison.nearMatchCount : (pair.nearMatches || 0);
    const partial = pair.comparison ? pair.comparison.partialMatchCount : 0;
    const score = pair.overallMatchedContentPercentage || 0;

    totalExactMatches += exact;
    totalNearMatches += near;
    totalPartialMatches += partial;

    if (score > highestMatchedContentPercentage) {
      highestMatchedContentPercentage = score;
    }
  }

  return {
    totalDocuments,
    totalDocumentPairs: pairResults.length,
    documentPairsCompared: pairResults.length, // UI backwards compatibility
    totalPairsCompared: pairResults.length, // Frontend analysisService compatibility
    pairsWithMatches: totalPairsWithMatches,
    matchingPairs: totalPairsWithMatches, // Frontend analysisService compatibility
    totalExactMatches,
    totalNearMatches,
    totalPartialMatches,
    highestMatchedContentPercentage,
    algorithm: 'pairwise_shingling_jaccard_levenshtein_hashing',
  };
}

module.exports = {
  compareAndAggregateDocumentPair,
  buildOverallAnalysisSummary,
};
