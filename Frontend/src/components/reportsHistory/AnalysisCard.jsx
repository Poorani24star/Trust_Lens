import { useNavigate } from 'react-router-dom';
import { FileText, Archive, CheckCircle, Loader2, AlertTriangle, Download, Trash2 } from 'lucide-react';
import Button from '../Button';
import { useState } from 'react';
import Toast from '../ui/Toast';

import { getReportDetails, deleteReport } from '../../services/reportService';
import { generatePdfReport } from '../../utils/pdfGenerator';

// ── Type badge ────────────────────────────────────────────────────────────────
const TYPE_STYLES = {
  'error-detection': 'bg-blue-50 text-blue-700 border-blue-200',
  'copied-content':  'bg-indigo-50 text-indigo-700 border-indigo-200',
};

// ── Report status config ──────────────────────────────────────────────────────
const REPORT_STATUS = {
  available: {
    icon: <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />,
    cls:  'text-green-700',
    label: 'Report Available',
    hint: null,
  },
  generating: {
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />,
    cls:  'text-blue-600',
    label: 'Report Generating',
    hint: 'Your report is being prepared.',
  },
  failed: {
    icon: <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />,
    cls:  'text-red-600',
    label: 'Report unavailable',
    hint: "We couldn't generate this report.",
  },
};

export default function AnalysisCard({ analysis, onDelete }) {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { id, fileName, typeLabel, type, date, time, result, detail, reportStatus } = analysis;
  const rs = REPORT_STATUS[reportStatus] ?? REPORT_STATUS.available;
  const safeFileName = fileName || analysis.title || (type === 'copied-content' ? 'Documents_Analysis.zip' : 'Document_Analysis.pdf');
  const isZip = safeFileName.toLowerCase().endsWith('.zip');
  const FileIcon = isZip ? Archive : FileText;
  const typeStyle = TYPE_STYLES[type] ?? 'bg-slate-50 text-slate-700 border-slate-200';

  // Format date as "Aug 16, 2026"
  const parsedDate = date ? new Date(date) : new Date();
  const displayDate = !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Recent';

  async function handleDownload() {
    try {
      setToast({ message: 'Preparing PDF download…', variant: 'info' });
      const reportData = await getReportDetails(id);
      generatePdfReport(reportData);
      setToast({ message: 'PDF report downloaded successfully.', variant: 'success' });
    } catch (err) {
      console.error('[AnalysisCard] Download error:', err);
      setToast({ message: err.message || 'Failed to download PDF report.', variant: 'error' });
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Are you sure you want to delete the report for "${safeFileName}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteReport(id);
      setToast({ message: 'Report deleted successfully.', variant: 'success' });
      if (typeof onDelete === 'function') {
        onDelete(id);
      }
    } catch (err) {
      console.error('[AnalysisCard] Delete error:', err);
      setToast({ message: err.message || 'Failed to delete report.', variant: 'error' });
      setIsDeleting(false);
    }
  }

  return (
    <article
      className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4"
      aria-label={`Analysis: ${fileName}`}
    >
      {/* Top row — file name + type badge */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 text-slate-400" aria-hidden="true">
            <FileIcon className="w-5 h-5" />
          </span>
          <span className="text-sm font-semibold text-slate-900 truncate">{fileName}</span>
        </div>
        <span className={`shrink-0 inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${typeStyle}`}>
          {typeLabel}
        </span>
      </div>

      {/* Date + time */}
      <p className="text-xs text-slate-400">{displayDate} • {time}</p>

      {/* Result */}
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Result</p>
        <p className="text-sm text-slate-700">{result}</p>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
      </div>

      {/* Report status */}
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${rs.cls}`}>
          {rs.icon}
          {rs.label}
        </span>
        {rs.hint && <span className="text-xs text-slate-400">— {rs.hint}</span>}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <div className="flex flex-wrap gap-2">
          {reportStatus === 'available' && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/reports/${id}`)}
                aria-label={`View report for ${fileName}`}
              >
                View Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                aria-label={`Download PDF report for ${fileName}`}
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download PDF
              </Button>
            </>
          )}
          {reportStatus === 'generating' && (
            <Button variant="outline" size="sm" disabled aria-label="Report is being generated">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              Generating…
            </Button>
          )}
          {reportStatus === 'failed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(type === 'error-detection' ? '/error-detection' : '/copied-content')}
              aria-label={`Retry analysis for ${fileName}`}
            >
              Try Again
            </Button>
          )}
        </div>

        {/* Delete Report Button */}
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label={`Delete report for ${fileName}`}
          className="ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </article>
  );
}
