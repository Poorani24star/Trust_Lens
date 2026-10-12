import { apiRequest } from './apiClient';
import { API_BASE_URL } from '../config/api';
import { auth } from '../config/firebase';

/**
 * Start a new background analysis job
 * @param {{ type: 'copied-content'|'error-detection', uploadId: string, files?: Array<Object> }} data 
 */
export async function startAnalysisJob(data) {
  return await apiRequest('/analysis/jobs/start', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Fetch current snapshot of job progress
 * @param {string} jobId 
 */
export async function getJobStatus(jobId) {
  return await apiRequest(`/analysis/jobs/${jobId}`);
}

/**
 * Cancel an active analysis job
 * @param {string} jobId 
 * @param {string} reason 
 */
export async function cancelAnalysisJob(jobId, reason = 'Cancelled by user') {
  return await apiRequest(`/analysis/jobs/${jobId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Retry an individual failed file in an active job
 * @param {string} jobId 
 * @param {string} fileId 
 */
export async function retryAnalysisFile(jobId, fileId) {
  return await apiRequest(`/analysis/jobs/${jobId}/retry-file`, {
    method: 'POST',
    body: JSON.stringify({ fileId }),
  });
}

/**
 * Create a Server-Sent Events (SSE) connection for real-time progress updates
 * @param {string} jobId 
 * @returns {EventSource}
 */
export function createAnalysisEventSource(jobId) {
  const url = `${API_BASE_URL}/analysis/jobs/${jobId}/events`;
  return new EventSource(url);
}

function parseSafeDate(dateVal) {
  if (!dateVal) return new Date();
  if (typeof dateVal === 'string' || typeof dateVal === 'number') {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  if (typeof dateVal === 'object') {
    if (typeof dateVal.toDate === 'function') return dateVal.toDate();
    const sec = dateVal._seconds ?? dateVal.seconds;
    if (typeof sec === 'number') return new Date(sec * 1000);
  }
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Fetch list of analyses/reports formatted for UI (History & Reports pages)
 */
export async function getAnalyses(params = {}) {
  try {
    const res = await apiRequest('/reports', { params });
    const rawReports = res.reports || [];
    return rawReports.map(r => {
      const isErrorDetection =
        r.reportType === 'error-detection' ||
        r.reportType === 'error_detection' ||
        r.type === 'error-detection' ||
        r.type === 'error_detection';

      const created = parseSafeDate(r.createdAt);
      
      const fileName =
        r.document?.originalName ||
        r.document?.fileName ||
        r.fileName ||
        r.title ||
        (isErrorDetection ? 'Document_Analysis.pdf' : 'Documents_Analysis.zip');
      
      const verified = r.summary?.verified ?? r.summary?.supported ?? 0;
      const contradictions = r.summary?.potentialContradictions ?? r.summary?.incorrect ?? r.summary?.contradictions ?? 0;
      const totalStmts = r.summary?.totalStatements ?? r.summary?.analyzedStatements ?? 0;

      const pairsCompared =
        r.summary?.totalPairsCompared ??
        r.summary?.documentPairsCompared ??
        r.summary?.totalDocumentPairs ??
        (Array.isArray(r.documentPairs) ? r.documentPairs.length : (Array.isArray(r.pairResults) ? r.pairResults.length : 0));

      const matchingPairs =
        r.summary?.matchingPairs ??
        r.summary?.pairsWithMatches ??
        0;

      const resultText = isErrorDetection
        ? `${verified} Verified · ${contradictions} Contradictions`
        : (matchingPairs > 0 ? `${matchingPairs} matching pairs` : 'Analysis completed');

      const detailText = isErrorDetection
        ? `${totalStmts} statements analyzed against reference sources`
        : (`${pairsCompared} pairs compared · ${matchingPairs} matching pairs`);

      return {
        id: r.id || r.reportId,
        reportId: r.reportId || r.id,
        fileName,
        type: isErrorDetection ? 'error-detection' : 'copied-content',
        typeLabel: isErrorDetection ? 'Error Detection' : 'Copied Content',
        reportType: isErrorDetection ? 'error-detection' : 'copied-content',
        date: created.toISOString().split('T')[0],
        time: created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: r.status || 'completed',
        result: resultText,
        reportStatus: 'available',
        detail: detailText,
        documentCount: r.documentCount || (r.documents ? r.documents.length : 1),
        summary: r.summary || {},
        findings: r.findings || [],
        pairResults: r.pairResults || [],
        ...r,
      };
    });
  } catch (err) {
    console.warn('[AnalysisService] Unable to fetch live reports:', err.message);
    return [];
  }
}

/**
 * Calculate client-side summary counts
 */
export function getAnalysisSummary(analyses = []) {
  const errorDetection = analyses.filter(a => a.type === 'error-detection').length;
  const copiedContent  = analyses.filter(a => a.type === 'copied-content').length;
  const reportsAvailable = analyses.filter(a => a.reportStatus === 'available').length;
  return {
    total: analyses.length,
    errorDetection,
    copiedContent,
    reportsAvailable,
  };
}

/**
 * Fetch analysis summary statistics from backend
 */
export async function fetchAnalysisSummary() {
  try {
    const res = await apiRequest('/reports/stats/summary');
    const stats = res.stats || {};
    return {
      total: stats.totalReports || 0,
      errorDetection: stats.errorDetectionReports || 0,
      copiedContent: stats.copiedContentReports || 0,
      reportsAvailable: stats.totalReports || 0
    };
  } catch {
    return { total: 0, errorDetection: 0, copiedContent: 0, reportsAvailable: 0 };
  }
}

