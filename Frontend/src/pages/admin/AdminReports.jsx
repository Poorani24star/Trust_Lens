import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, FileText, AlertTriangle, CheckCircle, Search, ExternalLink, Trash2 } from 'lucide-react';
import AdminLayout from '../../layouts/AdminLayout';
import AdminStatCard from '../../components/admin/AdminStatCard';
import Button from '../../components/Button';
import { useToast } from '../../components/ui/ToastProvider';
import { listAdminReports, getDashboardStats } from '../../services/adminService';
import { deleteReport } from '../../services/reportService';
import { ROLE_LABELS, ROLE_COLORS, ROLE_FALLBACK_COLOR } from '../../constants/roles';

const PAGE_SIZE = 10;

function StatusBadge({ status }) {
  const s = (status || 'completed').toLowerCase();
  let colorClass = 'bg-green-50 text-green-700 border-green-200';
  let icon = <CheckCircle className="w-3 h-3" />;
  let label = 'Completed';

  if (s === 'analyzing' || s === 'pending') {
    colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
    icon = <AlertTriangle className="w-3 h-3" />;
    label = s === 'analyzing' ? 'Analyzing' : 'Pending';
  } else if (s === 'failed') {
    colorClass = 'bg-red-50 text-red-700 border-red-200';
    icon = <AlertTriangle className="w-3 h-3" />;
    label = 'Failed';
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
      {icon}
      {label}
    </span>
  );
}

export default function AdminReports() {
  const navigate = useNavigate();
  const showToast = useToast();

  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);

  const [reportStats, setReportStats] = useState({
    totalAnalyses: 0,
    errorDetectionAnalyses: 0,
    copiedContentAnalyses: 0,
    reportsGenerated: 0,
    reportsFailed: 0,
  });

  // Fetch Summary Stats from Admin Dashboard system metrics
  useEffect(() => {
    getDashboardStats()
      .then(data => {
        const rep = data?.reports || {};
        setReportStats({
          totalAnalyses: rep.total || 0,
          errorDetectionAnalyses: rep.errorDetection || 0,
          copiedContentAnalyses: rep.copiedContent || 0,
          reportsGenerated: rep.completed || rep.total || 0,
          reportsFailed: rep.failed || 0,
        });
      })
      .catch(err => console.warn('[AdminReports] Report summary notice:', err.message))
      .finally(() => setLoadingStats(false));
  }, []);

  // Fetch System Reports
  const fetchReportsList = useCallback(async () => {
    setLoadingReports(true);
    try {
      const data = await listAdminReports({
        type: typeFilter,
        status: statusFilter,
        search,
      });
      setReports(data || []);

      // If initial summary stats were empty, sync with system reports
      if (Array.isArray(data) && data.length > 0) {
        setReportStats(prev => {
          if (prev.totalAnalyses > 0 && (typeFilter !== 'all' || search)) return prev;
          let ed = 0;
          let cc = 0;
          let comp = 0;
          let fail = 0;
          data.forEach(r => {
            const rt = (r.reportType || r.type || '').toLowerCase();
            if (rt.includes('copied') || rt.includes('content')) cc++;
            else ed++;
            const st = (r.status || 'completed').toLowerCase();
            if (st === 'failed') fail++;
            else comp++;
          });
          return {
            totalAnalyses: Math.max(prev.totalAnalyses, data.length),
            errorDetectionAnalyses: Math.max(prev.errorDetectionAnalyses, ed),
            copiedContentAnalyses: Math.max(prev.copiedContentAnalyses, cc),
            reportsGenerated: Math.max(prev.reportsGenerated, comp),
            reportsFailed: Math.max(prev.reportsFailed, fail),
          };
        });
      }
    } catch (err) {
      showToast(err.message || 'Failed to load system reports', 'error');
    } finally {
      setLoadingReports(false);
    }
  }, [typeFilter, statusFilter, search, showToast]);

  useEffect(() => {
    fetchReportsList();
  }, [fetchReportsList]);

  async function handleDeleteReport(reportId, reportTitle) {
    if (!window.confirm(`Are you sure you want to delete the report "${reportTitle}"? This action cannot be undone.`)) return;
    setDeletingId(reportId);
    try {
      await deleteReport(reportId);
      showToast('Report deleted successfully.', 'success');
      setReports(prev => prev.filter(r => r.id !== reportId));
      setReportStats(prev => ({
        ...prev,
        totalAnalyses: Math.max(0, prev.totalAnalyses - 1),
        reportsGenerated: Math.max(0, prev.reportsGenerated - 1),
      }));
    } catch (err) {
      showToast(err.message || 'Failed to delete report.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const total = Math.max(reportStats.totalAnalyses, 1);
  const errorPct = Math.round((reportStats.errorDetectionAnalyses / total) * 100);
  const copiedPct = Math.round((reportStats.copiedContentAnalyses / total) * 100);

  const STAT_CARDS = [
    { label: 'Total Analyses',           value: loadingStats ? '...' : reportStats.totalAnalyses,          icon: <BarChart2     className="w-5 h-5" />, accent: 'text-blue-600',    bg: 'bg-blue-50'    },
    { label: 'Error Detection Analyses', value: loadingStats ? '...' : reportStats.errorDetectionAnalyses, icon: <FileText      className="w-5 h-5" />, accent: 'text-violet-600',  bg: 'bg-violet-50'  },
    { label: 'Copied Content Analyses',  value: loadingStats ? '...' : reportStats.copiedContentAnalyses,  icon: <FileText      className="w-5 h-5" />, accent: 'text-indigo-600',  bg: 'bg-indigo-50'  },
    { label: 'Reports Generated',        value: loadingStats ? '...' : reportStats.reportsGenerated,       icon: <CheckCircle   className="w-5 h-5" />, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Reports Failed',           value: loadingStats ? '...' : reportStats.reportsFailed,          icon: <AlertTriangle className="w-5 h-5" />, accent: 'text-red-600',     bg: 'bg-red-50'     },
  ];

  const totalPages = Math.ceil(reports.length / PAGE_SIZE);
  const paginated  = reports.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isFiltered = search !== '' || typeFilter !== 'all' || statusFilter !== 'all';

  return (
    <AdminLayout pageTitle="Reports">
      <div className="max-w-5xl mx-auto space-y-8">

        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">System-level analysis and report statistics.</p>
        </div>

        {/* Stats */}
        <section aria-labelledby="report-stats-heading">
          <h3 id="report-stats-heading" className="sr-only">Report statistics</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {STAT_CARDS.map(({ label, value, icon, accent, bg }) => (
              <AdminStatCard key={label} label={label} value={value} icon={icon} accent={accent} bg={bg} />
            ))}
          </div>
        </section>

        {/* Module breakdown */}
        <section aria-labelledby="module-breakdown-heading" className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
          <h3 id="module-breakdown-heading" className="text-base font-semibold text-slate-900 mb-5">Analysis Breakdown</h3>
          {[
            { label: 'Error Detection',  count: reportStats.errorDetectionAnalyses, pct: errorPct, color: 'bg-violet-500' },
            { label: 'Copied Content',   count: reportStats.copiedContentAnalyses,  pct: copiedPct, color: 'bg-indigo-500' },
          ].map(({ label, count, pct, color }) => (
            <div key={label} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-700">{label}</span>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">
                  {count.toLocaleString()} <span className="text-slate-400 font-normal">({pct}%)</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="presentation">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} aria-label={`${label}: ${count}`} />
              </div>
            </div>
          ))}
        </section>

        {/* Reports Management Table Section */}
        <section aria-labelledby="system-reports-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 id="system-reports-heading" className="text-lg font-bold text-slate-900">All Generated System Reports</h3>
            <p className="text-xs text-slate-400">
              {loadingReports
                ? 'Loading reports...'
                : reports.length === 0
                ? 'No reports found'
                : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, reports.length)} of ${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`}
            </p>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search by title, document, or user email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                aria-label="Search reports"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="type-filter" className="text-xs font-medium text-slate-500">Report Type</label>
              <select id="type-filter" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                className="px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                <option value="all">All Types</option>
                <option value="error-detection">Error Detection</option>
                <option value="copied-content">Copied Content</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="status-filter" className="text-xs font-medium text-slate-500">Status</label>
              <select id="status-filter" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="analyzing">Analyzing</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {isFiltered && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setPage(1); }}>
                Clear Filters
              </Button>
            )}
          </div>

          {/* Table */}
          {loadingReports ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
              <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
              <p className="text-sm">Loading system reports...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700 mb-1">
                {isFiltered ? 'No reports match your current filters.' : 'No system reports have been generated yet.'}
              </p>
              <p className="text-xs text-slate-400">
                {isFiltered ? 'Try clearing or adjusting your search criteria.' : 'When users run document analyses, reports will appear here.'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="System reports table">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Report Title / Document', 'Owner', 'Type', 'Status', 'Date', 'Actions'].map(h => (
                        <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginated.map(r => {
                      const isErrorDetection = (r.reportType || r.type || '').replace('_', '-') === 'error-detection';
                      const docName = r.document?.originalName || r.document?.fileName || r.title || 'Uploaded Document';
                      const ownerName = r.userName || 'User';
                      const ownerRole = r.userRole || 'student';
                      const dateText = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Recently';

                      return (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900 line-clamp-1">{r.title || docName}</p>
                            <p className="text-xs text-slate-400 line-clamp-1">{docName}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-sm font-medium text-slate-800">{ownerName}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded border ${ROLE_COLORS[ownerRole] ?? ROLE_FALLBACK_COLOR}`}>
                                {ROLE_LABELS[ownerRole] ?? ownerRole}
                              </span>
                              {r.userEmail && <span className="text-xs text-slate-400">{r.userEmail}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border
                              ${isErrorDetection ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                              {isErrorDetection ? 'Error Detection' : 'Copied Content'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{dateText}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/admin/reports/${r.id}`)}
                                className="inline-flex items-center gap-1"
                              >
                                <span>View</span>
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteReport(r.id, r.title || docName)}
                                disabled={deletingId === r.id}
                                className="inline-flex items-center gap-1"
                                aria-label={`Delete report ${r.title || docName}`}
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>{deletingId === r.id ? 'Deleting…' : 'Delete'}</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <nav aria-label="Reports pagination" className="flex items-center justify-center gap-1 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page">Previous</Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)} aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600
                    ${n === page ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{n}</button>
              ))}
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label="Next page">Next</Button>
            </nav>
          )}
        </section>

      </div>
    </AdminLayout>
  );
}
