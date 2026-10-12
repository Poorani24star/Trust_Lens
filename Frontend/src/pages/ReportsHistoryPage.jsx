import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import AnalysisSummaryCards from '../components/reportsHistory/AnalysisSummaryCards';
import AnalysisFilters from '../components/reportsHistory/AnalysisFilters';
import AnalysisCard from '../components/reportsHistory/AnalysisCard';
import { EmptyAnalysis, NoAnalysisResults } from '../components/reportsHistory/EmptyAnalysis';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../config/rolePermissions';
import { getAnalyses, getAnalysisSummary } from '../services/analysisService';
import { isWithinRange, sortItems } from '../utils/dateUtils';

const PAGE_SIZE = 8;

const DEFAULT_FILTERS = {
  search:       '',
  typeFilter:   'all',
  statusFilter: 'all',
  dateFilter:   'all',
  sortOrder:    'newest',
};

export default function ReportsHistoryPage() {
  const { user } = useAuth();
  const showCopiedContent = hasPermission(user?.role, 'copiedContent');

  const [allAnalyses, setAllAnalyses] = useState([]);
  const [summary, setSummary]         = useState({ total: 0, errorDetection: 0, copiedContent: 0, reportsAvailable: 0 });
  const [filters, setFilters]         = useState(DEFAULT_FILTERS);
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    getAnalyses()
      .then(data => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : [];
        // Students only see error-detection records
        const visible = showCopiedContent ? list : list.filter(a => a.type === 'error-detection');
        setAllAnalyses(visible);
        setSummary(getAnalysisSummary(visible));
      })
      .catch(err => {
        console.error('[ReportsHistoryPage] Failed to fetch analyses:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [showCopiedContent]);

  function handleDeleteReport(deletedId) {
    setAllAnalyses(prev => {
      const updated = prev.filter(item => item.id !== deletedId);
      setSummary(getAnalysisSummary(updated));
      return updated;
    });
  }

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  const isFiltered =
    filters.search       !== '' ||
    filters.typeFilter   !== 'all' ||
    filters.statusFilter !== 'all' ||
    filters.dateFilter   !== 'all' ||
    filters.sortOrder    !== 'newest';

  const filtered = useMemo(() => {
    const q = (filters.search || '').trim().toLowerCase();
    const result = allAnalyses.filter(a => {
      const fileNameStr = (a.fileName || a.title || '').toLowerCase();
      const typeLabelStr = (a.typeLabel || '').toLowerCase();
      if (q && !fileNameStr.includes(q) && !typeLabelStr.includes(q)) return false;
      if (filters.typeFilter   !== 'all' && a.type   !== filters.typeFilter)   return false;
      if (filters.statusFilter !== 'all' && a.status !== filters.statusFilter) return false;
      if (a.date && !isWithinRange(a.date, filters.dateFilter)) return false;
      return true;
    });
    return sortItems(result, filters.sortOrder);
  }, [allAnalyses, filters]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardLayout pageTitle="Reports & History">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Page heading */}
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports &amp; History</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            View your document analysis activity and access your reports.
          </p>
        </div>

        {/* Summary cards */}
        <AnalysisSummaryCards summary={summary} showCopiedContent={showCopiedContent} />

        {/* Filters */}
        <AnalysisFilters
          search={filters.search}               onSearch={v => setFilter('search', v)}
          typeFilter={filters.typeFilter}       onTypeFilter={v => setFilter('typeFilter', v)}
          statusFilter={filters.statusFilter}   onStatusFilter={v => setFilter('statusFilter', v)}
          dateFilter={filters.dateFilter}       onDateFilter={v => setFilter('dateFilter', v)}
          sortOrder={filters.sortOrder}         onSortOrder={v => setFilter('sortOrder', v)}
          isFiltered={isFiltered}
          onClear={clearFilters}
          showCopiedContent={showCopiedContent}
        />

        {/* Result count */}
        {!loading && allAnalyses.length > 0 && (
          <p className="text-xs text-slate-400" aria-live="polite" aria-atomic="true">
            {filtered.length === 0
              ? 'No results'
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} ${filtered.length === 1 ? 'analysis' : 'analyses'}`}
          </p>
        )}

        {/* List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 shadow-card text-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-slate-600">Loading analysis reports…</p>
          </div>
        ) : allAnalyses.length === 0 ? (
          <EmptyAnalysis showCopiedContent={showCopiedContent} />
        ) : filtered.length === 0 ? (
          <NoAnalysisResults onClear={clearFilters} />
        ) : (
          <section aria-label="Analysis list" className="space-y-4">
            {paginated.map(a => <AnalysisCard key={a.id} analysis={a} onDelete={handleDeleteReport} />)}
          </section>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav aria-label="Analyses pagination" className="flex items-center justify-center gap-1 pt-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              Previous
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => setPage(n)}
                aria-label={`Page ${n}`}
                aria-current={n === page ? 'page' : undefined}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600
                  ${n === page ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              >
                {n}
              </button>
            ))}
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              Next
            </Button>
          </nav>
        )}

      </div>
    </DashboardLayout>
  );
}
