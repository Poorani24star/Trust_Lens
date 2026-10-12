import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Package, ScanSearch, Copy, Download, Trash2 } from 'lucide-react';
import ReportStatusBadge from './ReportStatusBadge';
import Button from '../Button';
import Toast from '../ui/Toast';
import { deleteReport } from '../../services/reportService';

const TYPE_CONFIG = {
  'error-detection': {
    label: 'Error Detection',
    icon: <ScanSearch className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  'copied-content': {
    label: 'Copied Content',
    icon: <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
};

export default function ReportCard({ report, onDelete }) {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isZip = (report.fileName || '').toLowerCase().endsWith('.zip');
  const typeCfg = TYPE_CONFIG[report.type] ?? TYPE_CONFIG['error-detection'];
  const isAvailable = report.reportStatus === 'available';
  const isGenerating = report.reportStatus === 'generating';
  const isFailed = report.reportStatus === 'failed';

  function handleView() {
    if (isFailed) {
      navigate(report.type === 'copied-content' ? '/copied-content' : '/error-detection');
    } else {
      navigate(`/reports/${report.id}`);
    }
  }

  function handleDownload() {
    setToast({ message: 'Preparing PDF download…', variant: 'info' });
  }

  async function handleDelete() {
    if (!window.confirm(`Are you sure you want to delete the report for "${report.fileName || 'this document'}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteReport(report.id);
      setToast({ message: 'Report deleted successfully.', variant: 'success' });
      if (typeof onDelete === 'function') {
        onDelete(report.id);
      }
    } catch (err) {
      console.error('[ReportCard] Delete error:', err);
      setToast({ message: err.message || 'Failed to delete report.', variant: 'error' });
      setIsDeleting(false);
    }
  }

  return (
    <article
      className="bg-white rounded-xl border border-slate-200 shadow-card px-5 py-4 space-y-3"
      aria-label={`${report.typeLabel} report for ${report.fileName}`}
    >
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* File icon */}
        <span
          className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0
            ${isZip
              ? 'bg-indigo-50 border-indigo-100 text-indigo-500'
              : 'bg-blue-50 border-blue-100 text-blue-500'}`}
          aria-hidden="true"
        >
          {isZip ? <Package className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
        </span>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${typeCfg.badge}`}
            >
              {typeCfg.icon}
              {typeCfg.label}
            </span>
            <ReportStatusBadge status={report.reportStatus} />
          </div>

          <p className="text-sm font-semibold text-slate-900 truncate">
            {report.fileName}
          </p>

          <p className="text-xs text-slate-400">
            {report.date} · {report.time}
          </p>

          {/* Result preview */}
          {isAvailable && report.result && (
            <p className="text-xs text-slate-600 line-clamp-1">
              Result: {report.result}
            </p>
          )}

          {/* Generating hint */}
          {isGenerating && (
            <p className="text-xs text-blue-600">Your report is being prepared.</p>
          )}

          {/* Failed message */}
          {isFailed && (
            <p className="text-xs text-red-600">We couldn't generate this report.</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={isFailed ? 'outline' : 'secondary'}
            size="sm"
            onClick={handleView}
            aria-label={
              isFailed
                ? `Try again for ${report.fileName}`
                : isGenerating
                ? `View progress for ${report.fileName}`
                : `View report for ${report.fileName}`
            }
          >
            {isFailed ? 'Try Again' : isGenerating ? 'View Progress' : 'View Report'}
          </Button>

          {isAvailable && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              aria-label={`Download PDF report for ${report.fileName}`}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Download PDF
            </Button>
          )}
        </div>

        {/* Delete Report Button */}
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label={`Delete report for ${report.fileName}`}
          className="ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </article>
  );
}
