import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Trash2, Download, PlusCircle, CheckCircle2, AlertTriangle, HelpCircle, MinusCircle, Info, FileText, ScanSearch, User, ChevronDown, ChevronUp, ShieldCheck, AlertOctagon, Check, ArrowLeftRight } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import AdminLayout from '../layouts/AdminLayout';
import Button from '../components/Button';
import Toast from '../components/ui/Toast';
import { getReportDetails, deleteReport } from '../services/reportService';
import { getAdminReportDetails } from '../services/adminService';

import { generatePdfReport } from '../utils/pdfGenerator';
import { ROLE_LABELS, ROLE_COLORS, ROLE_FALLBACK_COLOR } from '../constants/roles';
import CopiedContentResultCard from '../components/copiedContent/CopiedContentResultCard';
import CopiedDocumentSummaryModule from '../components/copiedContent/CopiedDocumentSummaryModule';
import SideBySideDiffViewer from '../components/copiedContent/SideBySideDiffViewer';

function ReportStatusBadge({ status }) {
  const s = (status || 'completed').toLowerCase();
  let colorClass = 'bg-green-50 text-green-700 border-green-200';
  let dotClass = 'bg-green-500';
  let label = 'COMPLETED';

  if (s === 'analyzing' || s === 'pending') {
    colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
    dotClass = 'bg-amber-500';
    label = s === 'analyzing' ? 'ANALYZING' : 'PENDING';
  } else if (s === 'failed') {
    colorClass = 'bg-red-50 text-red-700 border-red-200';
    dotClass = 'bg-red-500';
    label = 'FAILED';
  }

  return (
    <div className={`px-3 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${colorClass}`}>
      <span className={`w-2 h-2 rounded-full ${dotClass}`}></span>
      Status: {label}
    </div>
  );
}

export default function ReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdminView = location.pathname.startsWith('/admin');
  const Layout = isAdminView ? AdminLayout : DashboardLayout;
  const backPath = isAdminView ? '/admin/reports' : '/reports-history';
  const backText = isAdminView ? 'Back to Admin Reports' : 'Back to Reports & History';

  const [report, setReport] = useState(() => {
    if (location.state?.report && (location.state?.report?.id === id || location.state?.newReportId === id)) {
      return location.state.report;
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    return !(location.state?.report && (location.state?.report?.id === id || location.state?.newReportId === id));
  });
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pairFilter, setPairFilter] = useState('all');
  const [statementFilter, setStatementFilter] = useState('all');
  const [expandedFindings, setExpandedFindings] = useState({});
  const [activeDiffPair, setActiveDiffPair] = useState(null);

  const handleScrollToPair = (pairId) => {
    if (pairId === undefined || pairId === null) return;
    let targetEl = document.getElementById(`pair-card-${pairId}`);
    if (!targetEl) {
      targetEl = document.querySelector(`[id$="${pairId}"]`);
    }
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
      setTimeout(() => {
        targetEl.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2');
      }, 2500);
    }
  };

  const toggleFindingExpand = (key) => {
    setExpandedFindings(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleAllFindings = (expand) => {
    if (!expand) {
      setExpandedFindings({});
    } else {
      const allKeys = {};
      const currentFindings = report?.findings || report?.statementResults || report?.results || [];
      currentFindings.forEach((s, idx) => {
        const key = s.statementId || `stmt-${s.index || idx + 1}`;
        allKeys[key] = true;
      });
      setExpandedFindings(allKeys);
    }
  };

  useEffect(() => {
    if (location.state?.message) {
      setToast({ message: location.state.message, variant: 'success' });
    }
  }, [location.state]);

  useEffect(() => {
    if (!report) {
      setLoading(true);
    }
    setError('');
    const fetchFn = isAdminView ? getAdminReportDetails : getReportDetails;
    fetchFn(id)
      .then(data => {
        setReport(data);
      })
      .catch(err => {
        if (!report) {
          setError(err.message || 'Report Not Found');
        }
      })
      .finally(() => setLoading(false));
  }, [id, isAdminView]);

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this report? This action cannot be undone.')) return;

    setIsDeleting(true);
    try {
      await deleteReport(id);
      setToast({ message: 'Report deleted successfully.', variant: 'success' });
      setTimeout(() => {
        navigate(backPath, { replace: true });
      }, 1000);
    } catch (err) {
      setToast({ message: err.message || 'Failed to delete report', variant: 'error' });
      setIsDeleting(false);
    }
  }

  if (loading) {
    return (
      <Layout pageTitle="Report Detail">
        <div className="max-w-4xl mx-auto text-center py-16 space-y-3 text-slate-500">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium">Loading report details…</p>
        </div>
      </Layout>
    );
  }

  if (error || !report) {
    return (
      <Layout pageTitle="Report Detail">
        <div className="max-w-md mx-auto text-center py-16 space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="text-slate-900 text-lg font-bold">Report Not Found</div>
          <p className="text-sm text-slate-500">{error || 'The requested report is unavailable or may have been deleted.'}</p>
          <Button variant="outline" onClick={() => navigate(backPath)}>
            <ArrowLeft className="w-4 h-4" /> {backText}
          </Button>
        </div>
      </Layout>
    );
  }

  const rawType = (report.reportType || report.type || '').toLowerCase().replace('_', '-');
  const isErrorDetection = rawType === 'error-detection';
  const isCopiedContent = rawType === 'copied-content';

  const parseSafeDateDisplay = (d) => {
    if (!d) return 'Recently';
    try {
      let dt;
      if (typeof d === 'string' || typeof d === 'number') {
        dt = new Date(d);
      } else if (typeof d === 'object') {
        if (typeof d.toDate === 'function') dt = d.toDate();
        else if (typeof (d._seconds ?? d.seconds) === 'number') dt = new Date((d._seconds ?? d.seconds) * 1000);
        else dt = new Date(d);
      } else {
        dt = new Date(d);
      }
      return isNaN(dt.getTime()) ? 'Recently' : dt.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  };

  const createdAtFormatted = parseSafeDateDisplay(report.createdAt);

  const docName = report.document?.originalName || report.document?.fileName || report.title || 'Uploaded Document';
  const summary = report.summary || {};
  const findings = report.findings || report.statementResults || report.results || [];
  const pairsList =
    (Array.isArray(report.documentPairs) && report.documentPairs.length > 0)
      ? report.documentPairs
      : (Array.isArray(report.pairResults) && report.pairResults.length > 0)
      ? report.pairResults
      : (Array.isArray(report.analysis?.documentPairs) && report.analysis.documentPairs.length > 0)
      ? report.analysis.documentPairs
      : [];

  const getFindingCategory = (s) => {
    const raw = (s.classification || '').toUpperCase();
    if (raw === 'INCORRECT' || raw === 'CONTRADICTED' || raw === 'POTENTIAL_CONTRADICTION') return 'incorrect';
    if (raw === 'MISLEADING') return 'misleading';
    if (raw === 'UNSUPPORTED' || raw === 'INSUFFICIENT_EVIDENCE' || raw === 'INSUFFICIENT EVIDENCE') return 'unsupported';
    if (raw === 'SUPPORTED' || raw === 'VERIFIED') return 'supported';
    return 'no_knowledge';
  };

  const getPriorityWeight = (s) => {
    const cat = getFindingCategory(s);
    if (cat === 'incorrect') return 1;
    if (cat === 'misleading') return 2;
    if (cat === 'unsupported') return 3;
    if (cat === 'supported') return 4;
    return 5;
  };

  const dynamicCounts = findings.reduce(
    (acc, s) => {
      const cat = getFindingCategory(s);
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    },
    { incorrect: 0, misleading: 0, unsupported: 0, supported: 0, no_knowledge: 0 }
  );

  const totalStatements = findings.length > 0 ? findings.length : (summary.totalStatements ?? summary.analyzedStatements ?? 0);
  const supportedCount = findings.length > 0 ? dynamicCounts.supported : (summary.supported ?? summary.verified ?? 0);
  const incorrectCount = findings.length > 0 ? dynamicCounts.incorrect : (summary.incorrect ?? summary.potentialContradictions ?? summary.contradictions ?? summary.contradicted ?? 0);
  const misleadingCount = findings.length > 0 ? dynamicCounts.misleading : (summary.misleading ?? 0);
  const unsupportedCount = findings.length > 0 ? dynamicCounts.unsupported : (summary.unsupported ?? summary.insufficientEvidence ?? 0);
  const noKnowledgeCount = findings.length > 0 ? dynamicCounts.no_knowledge : (summary.noKnowledgeAvailable ?? summary.notAnalyzed ?? 0);

  const hasIssues = incorrectCount > 0 || misleadingCount > 0;
  const overallResultTitle = hasIssues ? 'Review Recommended' : 'High Factual Consistency';
  const overallResultSubtitle = hasIssues
    ? `Identified ${incorrectCount} incorrect and ${misleadingCount} misleading statement(s) requiring review.`
    : `All ${supportedCount} analyzed statements are fully supported by verified reference knowledge.`;

  const prioritizedFindings = [...findings].sort((a, b) => {
    const rankA = getPriorityWeight(a);
    const rankB = getPriorityWeight(b);
    if (rankA !== rankB) return rankA - rankB;
    const scoreA = a.similarityScore ?? a.similarity ?? 0;
    const scoreB = b.similarityScore ?? b.similarity ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.index || 0) - (b.index || 0);
  });

  const filteredFindings = prioritizedFindings.filter(s => {
    if (statementFilter === 'all') return true;
    return getFindingCategory(s) === statementFilter;
  });

  const totalDocsCount =
    report.documentCount ||
    report.document?.documentCount ||
    (Array.isArray(report.document) ? report.document.length : 0) ||
    (Array.isArray(report.documents) ? report.documents.length : 0) ||
    (pairsList.length > 0 ? new Set(pairsList.flatMap(p => [p.documentA?.originalName || p.documentA?.documentId, p.documentB?.originalName || p.documentB?.documentId])).size : 1);

  const totalComparisonsCount =
    summary.totalPairsCompared ??
    summary.totalDocumentPairs ??
    summary.documentPairsCompared ??
    pairsList.length ??
    0;
  const highSimCount = summary.highSimilarityCount ?? pairsList.filter(p => (p.overallMatchedContentPercentage ?? p.similarity ?? 0) >= 80).length;
  const potentialSimCount = summary.potentialSimilarityCount ?? pairsList.filter(p => { const score = p.overallMatchedContentPercentage ?? p.similarity ?? 0; return score >= 60 && score < 80; }).length;
  const noSimCount = summary.noSignificantSimilarityCount ?? pairsList.filter(p => (p.overallMatchedContentPercentage ?? p.similarity ?? 0) < 60).length;
  
  const documentList = report.document?.documents || (Array.isArray(report.document) ? report.document : []);
  const extractionMethod = report.extractionMethod || report.document?.extractionMethod || summary.extractionMethod || 'normal';
  const ocrPagesList = report.ocrPages || report.document?.ocrPages || summary.ocrPages || [];

  const filteredPairs = pairsList.filter(pair => {
    const score = pair.overallMatchedContentPercentage ?? pair.similarity ?? 0;
    if (pairFilter === 'high') return score >= 80;
    if (pairFilter === 'potential') return score >= 60 && score < 80;
    if (pairFilter === 'no_significant') return score < 60;
    return true;
  });

  return (
    <Layout pageTitle={`Report Details — ${docName}`}>
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            onClick={() => navigate(backPath)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {backText}
          </button>

          <div className="flex items-center gap-2">
            {!isAdminView && (
              <Button variant="outline" size="sm" onClick={() => navigate(isErrorDetection ? '/error-detection' : '/copied-content')}>
                <PlusCircle className="w-3.5 h-3.5" /> Run New Analysis
              </Button>
            )}
            {isCopiedContent && pairsList.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const sorted = [...pairsList].sort((a, b) => {
                    const sA = a.overallMatchedContentPercentage ?? a.similarity ?? 0;
                    const sB = b.overallMatchedContentPercentage ?? b.similarity ?? 0;
                    return sB - sA;
                  });
                  setActiveDiffPair(sorted[0] || pairsList[0]);
                }}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Side-by-Side Diff
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                try {
                  generatePdfReport(report);
                  setToast({ message: 'PDF report downloaded successfully.', variant: 'success' });
                } catch (pdfErr) {
                  console.error('[ReportDetailPage] Failed to generate PDF report:', pdfErr);
                  setToast({ message: 'Failed to generate PDF report.', variant: 'error' });
                }
              }}
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="w-3.5 h-3.5" /> {isDeleting ? 'Deleting…' : 'Delete Report'}
            </Button>
          </div>
        </div>

        {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${isErrorDetection ? 'bg-blue-50 text-blue-700 border-blue-200' : isCopiedContent ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-300'}`}>
                  {isErrorDetection ? 'Error Detection Report' : isCopiedContent ? 'Copied Content Detection Report' : 'System Report'}
                </span>
                {isErrorDetection && (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    extractionMethod === 'gemini-vision' || extractionMethod?.includes('vision')
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : extractionMethod === 'ocr'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : extractionMethod === 'mixed'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {extractionMethod === 'gemini-vision' || extractionMethod?.includes('vision') ? <ScanSearch className="w-3 h-3 text-emerald-600" /> : extractionMethod === 'ocr' || extractionMethod === 'mixed' ? <ScanSearch className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                    {extractionMethod === 'gemini-vision' || extractionMethod?.includes('vision')
                      ? 'Extraction: Gemini Vision (Handwritten)'
                      : extractionMethod === 'ocr'
                      ? 'Extraction: OCR (Scanned)'
                      : extractionMethod === 'mixed'
                      ? `Extraction: Mixed (Text + OCR${ocrPagesList.length > 0 ? ` p.${ocrPagesList.join(',')}` : ''})`
                      : 'Extraction: Normal Text'}
                  </span>
                )}
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-500 font-medium">ID: {report.id}</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900">{isCopiedContent ? 'Copied Content Detection Report' : (report.title || docName)}</h1>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span>Documents Analyzed: <strong className="text-slate-700">{totalDocsCount} file(s)</strong></span>
                <span>•</span>
                {isErrorDetection && <span>Statements Checked: <strong className="text-slate-700">{totalStatements}</strong> •</span>}
                {isCopiedContent && <span>Comparisons: <strong className="text-slate-700">{totalComparisonsCount} pair(s)</strong> •</span>}
                <span>Analyzed on {createdAtFormatted}</span>
              </p>
            </div>
            <ReportStatusBadge status={report.status} />
          </div>

          {documentList.length > 1 && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">Analyzed Document Batch ({documentList.length} Files)</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {documentList.map((d, dIdx) => (
                  <div key={dIdx} className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="truncate font-semibold text-slate-800" title={d.originalName || d.fileName}>{d.originalName || d.fileName || `Document #${dIdx + 1}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(report.qualityNotes || report.document?.qualityNotes || summary?.qualityNotes) && (
            <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5 animate-fadeIn">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold block text-blue-950">Handwriting & Document OCR Notice</span>
                <p className="text-blue-800 leading-relaxed">
                  {report.qualityNotes || report.document?.qualityNotes || summary?.qualityNotes}
                </p>
              </div>
            </div>
          )}

          {isErrorDetection && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 font-medium block">Statements Checked</span>
                  <span className="text-lg font-bold text-slate-900">{totalStatements}</span>
                </div>
                <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                  <span className="text-[11px] text-green-700 font-medium block">Supported</span>
                  <span className="text-lg font-bold text-green-700">{supportedCount}</span>
                </div>
                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                  <span className="text-[11px] text-red-700 font-medium block">Incorrect</span>
                  <span className="text-lg font-bold text-red-700">{incorrectCount}</span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-[11px] text-amber-700 font-medium block">Misleading</span>
                  <span className="text-lg font-bold text-amber-700">{misleadingCount}</span>
                </div>
                <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-200">
                  <span className="text-[11px] text-yellow-800 font-medium block">Unsupported</span>
                  <span className="text-lg font-bold text-yellow-800">{unsupportedCount}</span>
                </div>
              </div>
              <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 flex-wrap text-xs ${hasIssues ? 'bg-amber-50/80 border-amber-200 text-amber-900' : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'}`}>
                <div className="flex items-center gap-2.5">
                  {hasIssues ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" /> : <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />}
                  <div>
                    <span className="font-bold text-sm block">Overall Result: {overallResultTitle}</span>
                    <span className="text-xs opacity-90">{overallResultSubtitle}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-semibold">
                  <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 shadow-2xs text-slate-700">Threshold: 80% Cosine</span>
                </div>
              </div>
            </div>
          )}

          {isCopiedContent && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-100 text-center">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><span className="text-[11px] text-slate-500 font-medium block">Total Documents</span><span className="text-lg font-bold text-slate-900">{totalDocsCount}</span></div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><span className="text-[11px] text-slate-500 font-medium block">Total Comparisons</span><span className="text-lg font-bold text-slate-900">{totalComparisonsCount}</span></div>
              <div className="p-3 rounded-xl bg-red-50 border border-red-200"><span className="text-[11px] text-red-700 font-medium block">High Similarity</span><span className="text-lg font-bold text-red-700">{highSimCount}</span></div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200"><span className="text-[11px] text-amber-700 font-medium block">Potential Similarity</span><span className="text-lg font-bold text-amber-700">{potentialSimCount}</span></div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><span className="text-[11px] text-emerald-700 font-medium block">No Significant</span><span className="text-lg font-bold text-emerald-700">{noSimCount}</span></div>
            </div>
          )}
        </div>

        {/* Copied Content Summary Module (Fast scan for staff) */}
        {isCopiedContent && pairsList.length > 0 && (
          <CopiedDocumentSummaryModule
            pairs={pairsList}
            summary={summary}
            onOpenDiff={(pair) => setActiveDiffPair(pair)}
            onScrollToPair={handleScrollToPair}
          />
        )}

        {(isErrorDetection || isCopiedContent) && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-5">
            {/* Header & Filter Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {isErrorDetection ? 'Prioritized Statement Findings' : 'Document Pair Comparisons'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isErrorDetection
                    ? 'Prioritized by potential errors, misleading claims, and factual consistency.'
                    : 'Pairwise text similarity evaluation and passage-level matching.'}
                </p>
              </div>

              {/* Error Detection Filter Tabs & Controls */}
              {isErrorDetection && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => setStatementFilter('all')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${statementFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All ({totalStatements})</button>
                  <button onClick={() => setStatementFilter('incorrect')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${statementFilter === 'incorrect' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'}`}>Incorrect ({incorrectCount})</button>
                  <button onClick={() => setStatementFilter('misleading')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${statementFilter === 'misleading' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'}`}>Misleading ({misleadingCount})</button>
                  <button onClick={() => setStatementFilter('unsupported')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${statementFilter === 'unsupported' ? 'bg-yellow-600 text-white' : 'bg-yellow-50 text-yellow-800 border border-yellow-200 hover:bg-yellow-100'}`}>Unsupported ({unsupportedCount})</button>
                  <button onClick={() => setStatementFilter('supported')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${statementFilter === 'supported' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'}`}>Supported ({supportedCount})</button>
                  <button onClick={() => toggleAllFindings(true)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100">Expand All</button>
                  <button onClick={() => toggleAllFindings(false)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100">Collapse All</button>
                </div>
              )}

              {/* Copied Content Filter Tabs */}
              {isCopiedContent && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => setPairFilter('all')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${pairFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All ({totalComparisonsCount})</button>
                  <button onClick={() => setPairFilter('high')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${pairFilter === 'high' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'}`}>High ({highSimCount})</button>
                  <button onClick={() => setPairFilter('potential')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${pairFilter === 'potential' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'}`}>Potential ({potentialSimCount})</button>
                  <button onClick={() => setPairFilter('no_significant')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${pairFilter === 'no_significant' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}>No Significant ({noSimCount})</button>
                </div>
              )}
            </div>

            {/* Error Detection Findings List */}
            {isErrorDetection ? (
              findings.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1.5">
                  <p className="text-sm font-semibold text-slate-800">No Factual Statements Found</p>
                  <p className="text-xs text-slate-500">No meaningful factual statements were found in this document.</p>
                </div>
              ) : filteredFindings.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1.5">
                  <p className="text-sm font-semibold text-slate-800">
                    {statementFilter === 'incorrect' && 'No incorrect findings detected.'}
                    {statementFilter === 'misleading' && 'No misleading statements detected.'}
                    {statementFilter === 'unsupported' && 'No unsupported statements detected.'}
                    {statementFilter === 'supported' && 'No supported statements found.'}
                    {statementFilter === 'no_knowledge' && 'No statements without available knowledge.'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {statementFilter === 'incorrect' && 'All analyzed statements are consistent with reference sources or unevidenced.'}
                    {statementFilter !== 'incorrect' && 'No statement items match the currently selected filter category.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3" role="list">
                  {filteredFindings.map((s, idx) => {
                    const statementKey = s.statementId || `stmt-${s.index || idx + 1}`;
                    const category = getFindingCategory(s);
                    const isExpanded = Boolean(expandedFindings[statementKey]);
                    const rawScore = s.similarityScore ?? s.similarity;
                    const formattedScore = typeof rawScore === 'number' && rawScore > 0 ? `${(rawScore * 100).toFixed(1)}%` : null;
                    
                    const evidenceObj = s.evidence || (s.bestCandidate ? { content: s.bestCandidate.text, title: s.bestCandidate.sourceTitle || s.bestCandidate.sourceName } : null);
                    const evidenceText = evidenceObj?.content || evidenceObj?.text;
                    const sourceName = evidenceObj?.sourceTitle || evidenceObj?.sourceName || evidenceObj?.title || evidenceObj?.sourceId || s.trustedSource;
                    const explanationText = s.explanation || s.reason;
                    const sharedTerms = s.sharedTerms || s.bestCandidate?.sharedTerms || [];

                    // 1. Compact rendering for SUPPORTED items
                    if (category === 'supported') {
                      return (
                        <div
                          key={statementKey}
                          className="p-3.5 rounded-xl border border-green-200 bg-green-50/30 hover:bg-green-50/60 transition-colors space-y-2.5"
                          role="listitem"
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-green-100 text-green-800 border border-green-300 inline-flex items-center gap-1 shrink-0">
                                <Check className="w-3 h-3" />
                                Supported
                              </span>
                              <span className="text-xs font-bold text-slate-500 shrink-0">
                                Statement #{s.index || idx + 1}
                              </span>
                              {(s.sourcePage || s.page) ? (
                                <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200 shrink-0">
                                  Page {s.sourcePage || s.page}
                                </span>
                              ) : (s.documentName ? (
                                <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200 shrink-0">
                                  {s.documentName}
                                </span>
                              ) : null)}
                              <span className="text-xs font-medium text-slate-800 truncate" title={s.statement || s.statementText}>
                                &ldquo;{s.statement || s.statementText}&rdquo;
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {formattedScore && (
                                <span className="text-[11px] bg-white text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-medium">
                                  Similarity: <strong>{formattedScore}</strong>
                                </span>
                              )}
                              <button
                                onClick={() => toggleFindingExpand(statementKey)}
                                aria-expanded={isExpanded}
                                aria-controls={`details-${statementKey}`}
                                className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-colors"
                              >
                                {isExpanded ? 'Hide Details' : 'View Details'}
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div
                              id={`details-${statementKey}`}
                              className="pt-3 border-t border-green-200/80 space-y-2.5 text-xs animate-fadeIn"
                            >
                              {explanationText && (
                                <div className="p-2.5 rounded-lg bg-white border border-green-100 text-slate-700 leading-relaxed break-words">
                                  <strong className="text-green-950 block mb-0.5">Explanation & Reasoning:</strong>
                                  {explanationText}
                                </div>
                              )}
                              {evidenceText ? (
                                <div className="p-3 rounded-lg bg-white border border-green-200 space-y-1.5">
                                  <div className="font-semibold text-green-950 flex items-center justify-between gap-2 flex-wrap">
                                    <span>Verified Reference Evidence</span>
                                    {sourceName && (
                                      <span className="text-green-700 font-normal">
                                        Source: <strong>{sourceName}</strong>
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-slate-700 italic leading-relaxed break-words whitespace-pre-wrap">
                                    &ldquo;{evidenceText}&rdquo;
                                  </p>
                                </div>
                              ) : (
                                <p className="text-slate-500 italic text-[11px] p-2 bg-white/80 rounded border border-green-100">
                                  No additional reference evidence text stored for this statement.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // 2. Compact rendering for INCORRECT / MISLEADING / UNSUPPORTED / NO_KNOWLEDGE
                    let badgeCls = 'bg-slate-100 text-slate-700 border-slate-200';
                    let statusLabel = 'UNSUPPORTED';
                    let StatusIcon = HelpCircle;

                    if (category === 'incorrect') {
                      badgeCls = 'bg-red-100 text-red-800 border-red-300';
                      statusLabel = 'INCORRECT';
                      StatusIcon = AlertTriangle;
                    } else if (category === 'misleading') {
                      badgeCls = 'bg-amber-100 text-amber-800 border-amber-300';
                      statusLabel = 'MISLEADING';
                      StatusIcon = AlertTriangle;
                    } else if (category === 'unsupported') {
                      badgeCls = 'bg-yellow-100 text-yellow-800 border-yellow-300';
                      statusLabel = 'UNSUPPORTED';
                      StatusIcon = HelpCircle;
                    } else {
                      badgeCls = 'bg-slate-100 text-slate-700 border-slate-300';
                      statusLabel = 'NO KNOWLEDGE';
                      StatusIcon = MinusCircle;
                    }

                    return (
                      <div
                        key={statementKey}
                        role="listitem"
                        className={`p-4 rounded-xl border space-y-3 transition-colors
                          ${category === 'incorrect' ? 'bg-red-50/40 border-red-200 hover:bg-red-50/60' : category === 'misleading' ? 'bg-amber-50/40 border-amber-200 hover:bg-amber-50/60' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'}`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border inline-flex items-center gap-1 ${badgeCls}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusLabel}
                            </span>
                            <span className="text-xs font-bold text-slate-500">Statement #{s.index || idx + 1}</span>
                            {(s.sourcePage || s.page) ? (
                              <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                                Page {s.sourcePage || s.page}
                              </span>
                            ) : (s.documentName ? (
                              <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                                {s.documentName}
                              </span>
                            ) : null)}
                          </div>

                          <div className="flex items-center gap-2">
                            {formattedScore && (
                              <span className="text-xs text-slate-500 font-medium">
                                Similarity: <strong className="text-slate-800">{formattedScore}</strong>
                              </span>
                            )}
                            <button
                              onClick={() => toggleFindingExpand(statementKey)}
                              aria-expanded={isExpanded}
                              aria-controls={`details-${statementKey}`}
                              className="text-xs font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-colors"
                            >
                              {isExpanded ? 'Hide Details' : 'View Details'}
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        <div className="text-sm font-medium text-slate-900 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs break-words">
                          &ldquo;{s.statement || s.originalStatement || s.statementText}&rdquo;
                        </div>

                        {isExpanded && (
                          <div
                            id={`details-${statementKey}`}
                            className="pt-2 border-t border-slate-200 space-y-2.5 text-xs animate-fadeIn"
                          >
                            {explanationText && (
                              <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-700 leading-relaxed break-words">
                                <strong className="text-slate-900 block mb-0.5">Detailed Analysis & Reasoning:</strong>
                                {explanationText}
                              </div>
                            )}

                            {evidenceText ? (
                              <div className="p-3 rounded-lg bg-white border border-blue-100 text-xs space-y-1.5">
                                <div className="font-semibold text-blue-950 flex items-center justify-between gap-2 flex-wrap">
                                  <span>Trusted Reference Evidence</span>
                                  {sourceName ? (
                                    <span className="text-blue-700 font-normal">
                                      Source: <strong>{sourceName}</strong>
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 font-normal italic">
                                      Source: Verified CS Reference
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-700 italic leading-relaxed break-words whitespace-pre-wrap">
                                  &ldquo;{evidenceText}&rdquo;
                                </p>
                              </div>
                            ) : (
                              <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-500 italic text-[11px]">
                                No verified reference evidence was retrieved for this specific claim.
                              </div>
                            )}

                            {Array.isArray(sharedTerms) && sharedTerms.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                <span className="text-[11px] font-semibold text-slate-500">Matching Terms:</span>
                                {sharedTerms.map((term, tIdx) => (
                                  <span key={tIdx} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-medium">
                                    {term}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              pairsList.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
                  <p className="text-sm font-semibold text-slate-700">No Document Comparisons Available</p>
                </div>
              ) : filteredPairs.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
                  <p className="text-sm font-semibold text-slate-700">No Matching Document Pairs</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredPairs.map((pair, idx) => (
                    <CopiedContentResultCard key={pair.pairId || idx} pair={pair} pairIndex={idx} />
                  ))}
                </div>
              )
            )}
          </section>
        )}
        {/* Interactive Side-by-Side Diff Viewer Modal */}
        {activeDiffPair && (
          <SideBySideDiffViewer
            pair={activeDiffPair}
            onClose={() => setActiveDiffPair(null)}
          />
        )}
      </div>
    </Layout>
  );
}
