import { jsPDF } from 'jspdf';

/**
 * Generates and downloads a complete PDF report for an Error Detection or Copied Content report object
 * @param {Object} report - Full report object from backend/Firestore
 */
export function generatePdfReport(report) {
  if (!report) return;

  const summary = report.summary || {};
  const isErrorDetection =
    report.reportType === 'error-detection' ||
    report.reportType === 'error_detection' ||
    report.type === 'error-detection' ||
    report.type === 'error_detection';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function checkPageOverflow(neededHeight = 40) {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      // Add subtle header to sub-pages
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(`TrustLens Analysis Report — ID: ${report.id || 'N/A'} (Cont.)`, margin, 25);
      doc.setDrawColor(230, 230, 230);
      doc.line(margin, 30, pageWidth - margin, 30);
      y = 45;
    }
  }

  // 1. TrustLens Header Banner
  doc.setFillColor(37, 99, 235); // Blue 600
  doc.rect(0, 0, pageWidth, 50, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('TrustLens Report Summary', margin, 32);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Factual Integrity & Content Verification Engine', pageWidth - margin, 32, { align: 'right' });

  y = 70;

  // 2. Report Overview Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42); // Slate 900
  const docTitle = report.title || report.document?.originalName || 'Document Analysis';
  doc.text(docTitle, margin, y);
  y += 18;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // Slate 500

  const createdDate = report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Recently';
  const docName = report.document?.originalName || report.document?.fileName || docTitle;
  const extractionMethod = report.extractionMethod || report.document?.extractionMethod || summary.extractionMethod || 'normal';

  doc.text(`Report ID: ${report.id || 'N/A'}`, margin, y);
  doc.text(`Analysis Type: ${isErrorDetection ? 'Error Detection / Factual Check' : 'Copied Content Analysis'}`, margin + 220, y);
  y += 14;

  doc.text(`Document Name: ${docName}`, margin, y);
  doc.text(`Analysis Date: ${createdDate}`, margin + 220, y);
  y += 14;

  doc.text(`Status: ${(report.status || 'completed').toUpperCase()}`, margin, y);
  if (isErrorDetection) {
    doc.text(`Extraction: ${extractionMethod.includes('vision') ? 'Gemini Vision (Handwritten)' : extractionMethod === 'ocr' ? 'OCR (Scanned Document)' : extractionMethod === 'mixed' ? 'Mixed (Text + OCR)' : 'Normal Text Extraction'}`, margin + 220, y);
  }
  y += 20;

  // Divider line
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 15;

  // 3. Summary Statistics
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('Summary Statistics', margin, y);
  y += 15;

  if (isErrorDetection) {
    const total = summary.totalStatements ?? summary.analyzedStatements ?? 0;
    const supported = summary.supported ?? summary.verified ?? 0;
    const incorrect = summary.incorrect ?? summary.potentialContradictions ?? summary.contradictions ?? 0;
    const misleading = summary.misleading ?? 0;
    const unsupported = summary.unsupported ?? summary.insufficientEvidence ?? 0;
    const noKnowledge = summary.noKnowledgeAvailable ?? summary.notAnalyzed ?? 0;

    // Summary Box grid
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 40, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, 40, 'S');

    const colW = contentWidth / 6;
    const stats = [
      { label: 'Total', val: total, color: [15, 23, 42] },
      { label: 'Supported', val: supported, color: [22, 101, 52] },
      { label: 'Incorrect', val: incorrect, color: [153, 27, 27] },
      { label: 'Misleading', val: misleading, color: [180, 83, 9] },
      { label: 'Unsupported', val: unsupported, color: [146, 64, 14] },
      { label: 'No Knowledge', val: noKnowledge, color: [71, 85, 105] },
    ];

    stats.forEach((st, idx) => {
      const cx = margin + idx * colW + 6;
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(st.label, cx, y + 14);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(st.color[0], st.color[1], st.color[2]);
      doc.text(String(st.val), cx, y + 30);
    });

    y += 55;
  } else {
    // Copied content summary
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 35, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, 35, 'S');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`Total Pairs Compared: ${summary.totalPairsCompared || 0}  |  Matching Pairs: ${summary.matchingPairs || 0}  |  Overall Similarity: ${summary.overallSimilarity || '0%'}`, margin + 12, y + 21);
    y += 50;
  }

  // 4. Detailed Findings
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(isErrorDetection ? 'Statement Factual Verification Findings' : 'Pairwise Document Comparisons', margin, y);
  y += 15;

  if (isErrorDetection) {
    const findings = report.findings || report.statementResults || report.results || [];

    if (findings.length === 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text('No detailed statement findings recorded for this document.', margin, y);
      y += 20;
    } else {
      findings.forEach((s, idx) => {
        checkPageOverflow(85);

        const rawStatus = (s.classification || s.status || '').toUpperCase().replace(/_/g, ' ');
        let statusText = 'UNSUPPORTED';
        let statusColor = [146, 64, 14];

        if (rawStatus === 'SUPPORTED' || rawStatus === 'VERIFIED') {
          statusText = 'SUPPORTED';
          statusColor = [22, 101, 52];
        } else if (rawStatus === 'INCORRECT' || rawStatus === 'POTENTIAL CONTRADICTION' || rawStatus === 'CONTRADICTION') {
          statusText = 'INCORRECT';
          statusColor = [153, 27, 27];
        } else if (rawStatus === 'MISLEADING') {
          statusText = 'MISLEADING';
          statusColor = [180, 83, 9];
        } else if (rawStatus === 'NO KNOWLEDGE AVAILABLE' || rawStatus === 'NOT ANALYZED') {
          statusText = 'NO KNOWLEDGE AVAILABLE';
          statusColor = [71, 85, 105];
        }

        const rawScore = s.similarityScore ?? s.similarity;
        const scoreText = typeof rawScore === 'number' && rawScore > 0 ? ` (Similarity: ${(rawScore * 100).toFixed(1)}%)` : '';

        // Statement Card Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
        const pageSuffix = (s.sourcePage || s.page)
          ? ` [Page ${s.sourcePage || s.page}]`
          : (s.documentName ? ` [${s.documentName}]` : '');
        doc.text(`Statement #${s.index || idx + 1}${pageSuffix} — ${statusText}${scoreText}`, margin, y);
        y += 12;

        // Statement Body
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);

        const stmtText = `"${s.statement || s.originalStatement || s.statementText || ''}"`;
        const stmtLines = doc.splitTextToSize(stmtText, contentWidth - 20);
        checkPageOverflow(stmtLines.length * 11 + 30);

        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y, contentWidth, stmtLines.length * 12 + 8, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, contentWidth, stmtLines.length * 12 + 8, 'S');

        doc.text(stmtLines, margin + 8, y + 12);
        y += stmtLines.length * 12 + 14;

        // Reason / Explanation
        if (s.reason || s.explanation) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(71, 85, 105);
          const reasonLines = doc.splitTextToSize(`Explanation: ${s.reason || s.explanation}`, contentWidth);
          checkPageOverflow(reasonLines.length * 10);
          doc.text(reasonLines, margin, y);
          y += reasonLines.length * 11 + 4;
        }

        // Evidence
        const evidenceObj = s.evidence || (s.bestCandidate ? { text: s.bestCandidate.text, sourceTitle: s.bestCandidate.sourceTitle || s.bestCandidate.sourceName } : null);
        const evidenceText = evidenceObj?.content || evidenceObj?.text;
        if (evidenceObj && evidenceText) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(30, 58, 138); // Blue 900
          const sourceName = evidenceObj.sourceTitle || evidenceObj.sourceName || evidenceObj.title || 'Trusted Source';
          const evLines = doc.splitTextToSize(`Trusted Reference (${sourceName}): "${evidenceText}"`, contentWidth - 16);

          checkPageOverflow(evLines.length * 10 + 10);
          doc.setFillColor(239, 246, 255);
          doc.rect(margin, y, contentWidth, evLines.length * 10 + 8, 'F');
          doc.text(evLines, margin + 8, y + 10);
          y += evLines.length * 10 + 14;
        }

        y += 10; // Gap between statement cards
      });
    }
  } else {
    // Copied content findings
    const pairs = report.documentPairs || report.pairResults || [];
    if (pairs.length === 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text('No high-overlap document pairs identified.', margin, y);
      y += 20;
    } else {
      pairs.forEach((pair, idx) => {
        checkPageOverflow(50);
        const nameA = pair.documentA?.originalName || pair.documentA?.name || pair.docA?.name || pair.doc1 || 'Document A';
        const nameB = pair.documentB?.originalName || pair.documentB?.name || pair.docB?.name || pair.doc2 || 'Document B';
        const score = pair.overallMatchedContentPercentage ?? pair.similarity ?? pair.similarityScore ?? pair.comparison?.overallSimilarity ?? 0;
        const totalMatches = pair.totalMatches ?? pair.matches?.length ?? (((pair.exactMatches || 0) + (pair.nearMatches || 0)) || 0);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        const headerText = `Pair #${idx + 1}: ${nameA} vs ${nameB}`;
        const headerLines = doc.splitTextToSize(headerText, contentWidth);
        checkPageOverflow(headerLines.length * 12 + 25);
        doc.text(headerLines, margin, y);
        y += headerLines.length * 11 + 2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        const statusLabel = score >= 70 ? 'High Similarity' : score >= 30 ? 'Moderate Similarity' : 'No Significant Similarity';
        doc.text(`Similarity: ${score}%  |  Matched Sections: ${totalMatches}  |  Classification: ${statusLabel}`, margin + 8, y);
        y += 16;

        // Render matching snippets if present
        if (pair.matches && pair.matches.length > 0) {
          const sampleMatches = pair.matches.slice(0, 3);
          sampleMatches.forEach((m, mIdx) => {
            const snippetA = m.documentAPassage || m.documentA?.text || m.passageA || '';
            const mScore = m.similarity || m.similarityScore || 100;
            const mType = (m.matchType || 'exact_match').replace(/_/g, ' ').toUpperCase();

            if (snippetA) {
              const snippetText = `Match ${mIdx + 1} (${mType} - ${mScore}%): "${snippetA}"`;
              const snippetLines = doc.splitTextToSize(snippetText, contentWidth - 24);
              checkPageOverflow(snippetLines.length * 10 + 14);

              doc.setFillColor(248, 250, 252);
              doc.rect(margin + 8, y, contentWidth - 16, snippetLines.length * 10 + 6, 'F');
              doc.setDrawColor(226, 232, 240);
              doc.rect(margin + 8, y, contentWidth - 16, snippetLines.length * 10 + 6, 'S');

              doc.setFont('helvetica', 'italic');
              doc.setFontSize(7.5);
              doc.setTextColor(51, 65, 85);
              doc.text(snippetLines, margin + 14, y + 9);
              y += snippetLines.length * 10 + 12;
            }
          });
        }
        y += 6;
      });
    }
  }

  // Footer on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
    doc.text('TrustLens Automated Verification System', margin, pageHeight - 20);
  }

  // Save/Download PDF file
  const fileNameClean = (docName || 'TrustLens_Report').replace(/[^a-z0-9_-]/gi, '_');
  doc.save(`${fileNameClean}_Report.pdf`);
}
