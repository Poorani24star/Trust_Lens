import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import ReportSummary from '../components/reports/ReportSummary';
import ReportFilters from '../components/reports/ReportFilters';
import ReportCard from '../components/reports/ReportCard';
import { EmptyReports, NoReportResults } from '../components/reports/EmptyReports';
import Button from '../components/Button';
import { getReports, getReportSummary } from '../services/reportService';
import { isWithinRange, sortItems } from '../utils/dateUtils';

const PAGE_SIZE = 8;

const DEFAULT_FILTERS = {
  search:       '',
  typeFilter:   'all',
  dateFilter:   'all',
  statusFilter: 'all',
  sortOrder:    'newest',
};

export default function ReportsPage() {
  const [allReports, setAllReports] = useState([]);
  const [summary, setSummary]       = useState({ total: 0, errorDetection: 0, copiedContent: 0 });
  const [filters, setFilters]       = useState(DEFAULT_FILTERS);
  const [page, setPage]             = useState(1);

  useEffect(() => {
    getReports().then(setAllReports);
    getReportSummary().then(setSummary);
  }, []);

  function handleDeleteReport(deletedId) {
    setAllReports(prev => prev.filter(r => r.id !== deletedId));
    getReportSummary().then(setSummary);
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
    filters.dateFilter   !== 'all' ||
    filters.statusFilter !== 'all' ||
    filters.sortOrder    !== 'newest';

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase();
    const result = allReports.filter(r => {
      if (q && !r.fileName.toLowerCase().includes(q) && !r.typeLabel.toLowerCase().includes(q)) return false;
      if (filters.typeFilter   !== 'all' && r.type         !== filters.typeFilter)   return false;
      if (filters.statusFilter !== 'all' && r.reportStatus !== filters.statusFilter) return false;
      if (!isWithinRange(r.date, filters.dateFilter)) return false;
      return true;
    });
    return sortItems(result, filters.sortOrder);
  }, [allReports, filters]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showPager  = totalPages > 1;

  return (
    <DashboardLayout pageTitle="Reports">
      <div className="max-w-3xl mx-auto space-y-5">

        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">View and manage your document analysis reports.</p>
        </div>

        <ReportSummary summary={summary} />

        <ReportFilters
          search={filters.search}               onSearch={v => setFilter('search', v)}
          typeFilter={filters.typeFilter}       onTypeFilter={v => setFilter('typeFilter', v)}
          dateFilter={filters.dateFilter}       onDateFilter={v => setFilter('dateFilter', v)}
          statusFilter={filters.statusFilter}   onStatusFilter={v => setFilter('statusFilter', v)}
          sortOrder={filters.sortOrder}         onSortOrder={v => setFilter('sortOrder', v)}
          isFiltered={isFiltered}
          onClear={clearFilters}
        />

        {allReports.length > 0 && (
          <p className="text-xs text-slate-400" aria-live="polite" aria-atomic="true">
            {filtered.length === 0
              ? 'No results'
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} ${filtered.length === 1 ? 'report' : 'reports'}`}
          </p>
        )}

        {allReports.length === 0 ? (
          <EmptyReports />
        ) : filtered.length === 0 ? (
          <NoReportResults onClear={clearFilters} />
        ) : (
          <section aria-label="Reports list" className="space-y-3">
            {paginated.map(report => <ReportCard key={report.id} report={report} onDelete={handleDeleteReport} />)}
          </section>
        )}

        {showPager && (
          <nav aria-label="Reports pagination" className="flex items-center justify-center gap-1 pt-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page">
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
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label="Next page">
              Next
            </Button>
          </nav>
        )}

      </div>
    </DashboardLayout>
  );
}
