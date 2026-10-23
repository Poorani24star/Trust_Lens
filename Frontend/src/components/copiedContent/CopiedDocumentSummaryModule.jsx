import { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
  Search,
  SlidersHorizontal,
  ExternalLink,
  ShieldAlert,
  Layers,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import Button from '../Button';

export default function CopiedDocumentSummaryModule({
  pairs = [],
  summary = {},
  onOpenDiff,
  onScrollToPair,
}) {
  const [viewMode, setViewMode] = useState('pairwise'); // 'pairwise' | 'document'
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'flagged' | 'high'
  const [searchTerm, setSearchTerm] = useState('');

  // Normalize pairwise data to ensure complete backward compatibility
  const normalizedPairs = useMemo(() => {
    if (!Array.isArray(pairs)) return [];

    return pairs.map((pair, idx) => {
      const docAName =
        pair.documentA?.originalName ||
        pair.documentA?.name ||
        pair.docA?.name ||
        pair.doc1 ||
        'Document A';
      const docBName =
        pair.documentB?.originalName ||
        pair.documentB?.name ||
        pair.docB?.name ||
        pair.doc2 ||
        'Document B';

      const similarity =
        pair.overallMatchedContentPercentage ??
        pair.similarity ??
        pair.similarityScore ??
        pair.comparison?.overallSimilarity ??
        0;

      const exactMatches =
        pair.comparison?.exactMatchCount ??
        pair.exactMatches ??
        0;
      const nearMatches =
        pair.comparison?.nearMatchCount ??
        pair.nearMatches ??
        0;
      const partialMatches =
        pair.comparison?.partialMatchCount ??
        0;
      const totalMatches =
        pair.totalMatches ??
        pair.matches?.length ??
        (exactMatches + nearMatches + partialMatches);

      let status = 'clean';
      let statusLabel = 'No Significant Overlap';
      let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      let barColor = 'bg-emerald-500';

      if (similarity >= 80) {
        status = 'high';
        statusLabel = 'High Copy Risk';
        badgeClass = 'bg-red-50 text-red-700 border-red-200';
        barColor = 'bg-red-500';
      } else if (similarity >= 60) {
        status = 'potential';
        statusLabel = 'Potential Copied Content';
        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        barColor = 'bg-amber-500';
      }

      return {
        rawPair: pair,
        pairId: pair.pairId || `pair-${idx + 1}`,
        idx,
        docAName,
        docBName,
        similarity,
        status,
        statusLabel,
        badgeClass,
        barColor,
        exactMatches,
        nearMatches: nearMatches + partialMatches,
        totalMatches,
        isFlagged: similarity >= 60,
      };
    }).sort((a, b) => b.similarity - a.similarity);
  }, [pairs]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = normalizedPairs.length;
    const high = normalizedPairs.filter((p) => p.similarity >= 80).length;
    const potential = normalizedPairs.filter(
      (p) => p.similarity >= 60 && p.similarity < 80
    ).length;
    const flagged = high + potential;
    const maxSim = total > 0 ? normalizedPairs[0].similarity : 0;

    return { total, high, potential, flagged, maxSim };
  }, [normalizedPairs]);

  // Default to 'flagged' filter if there are flagged pairs to save staff time
  useEffect(() => {
    if (stats.flagged > 0) {
      setFilterMode('flagged');
    }
  }, [stats.flagged]);

  // Filter pairs based on search and selected filterMode
  const filteredPairs = useMemo(() => {
    let result = normalizedPairs;

    if (filterMode === 'flagged') {
      result = result.filter((p) => p.isFlagged);
    } else if (filterMode === 'high') {
      result = result.filter((p) => p.similarity >= 80);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.docAName.toLowerCase().includes(q) ||
          p.docBName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [normalizedPairs, filterMode, searchTerm]);

  // Group by document for Document-Centric Breakdown view
  const documentBreakdown = useMemo(() => {
    const map = new Map();

    normalizedPairs.forEach((pair) => {
      [
        { doc: pair.docAName, other: pair.docBName },
        { doc: pair.docBName, other: pair.docAName },
      ].forEach(({ doc, other }) => {
        if (!map.has(doc)) {
          map.set(doc, {
            documentName: doc,
            highestSimilarity: 0,
            mostCopiedWith: null,
            flaggedCount: 0,
            relatedPairs: [],
          });
        }
        const entry = map.get(doc);
        if (pair.similarity > entry.highestSimilarity) {
          entry.highestSimilarity = pair.similarity;
          entry.mostCopiedWith = other;
        }
        if (pair.isFlagged) {
          entry.flaggedCount++;
        }
        entry.relatedPairs.push({
          otherDocName: other,
          similarity: pair.similarity,
          status: pair.status,
          statusLabel: pair.statusLabel,
          pair: pair.rawPair,
        });
      });
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        relatedPairs: item.relatedPairs.sort(
          (a, b) => b.similarity - a.similarity
        ),
      }))
      .sort((a, b) => b.highestSimilarity - a.highestSimilarity);
  }, [normalizedPairs]);

  // Filtered document breakdown based on search
  const filteredDocuments = useMemo(() => {
    let list = documentBreakdown;
    if (filterMode === 'flagged') {
      list = list.filter((d) => d.flaggedCount > 0);
    } else if (filterMode === 'high') {
      list = list.filter((d) => d.highestSimilarity >= 80);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.documentName.toLowerCase().includes(q) ||
          d.mostCopiedWith?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [documentBreakdown, filterMode, searchTerm]);

  if (normalizedPairs.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Executive Document Copy Summary"
      className="bg-white rounded-2xl border border-indigo-100 shadow-card p-6 space-y-5 animate-fadeIn"
    >
      {/* Module Title & Quick Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
              Executive Copy Summary
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Staff Quick-Scan
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-medium">
              {stats.total} Pairwise Comparisons
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Document-to-Document Copying Summary
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Instant overview of which documents share copied passages. Staff
            can identify matching document pairs immediately without reading all
            content.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start md:self-auto shrink-0 border border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode('pairwise')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
              viewMode === 'pairwise'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Pairwise Matrix
          </button>
          <button
            type="button"
            onClick={() => setViewMode('document')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
              viewMode === 'document'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Per-Document Overview
          </button>
        </div>
      </div>

      {/* Staff Executive Takeaway Box */}
      {stats.flagged > 0 ? (
        <div className="p-4 rounded-xl bg-gradient-to-r from-red-50/80 via-amber-50/60 to-slate-50 border border-red-200 text-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-xs font-bold text-red-950 uppercase tracking-wide">
              Staff Alert: {stats.flagged} Document Pair(s) Show Substantial
              Copying (≥60%)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-xs">
            {normalizedPairs
              .filter((p) => p.isFlagged)
              .slice(0, 4)
              .map((p) => (
                <div
                  key={p.pairId}
                  className="bg-white/90 p-2.5 rounded-lg border border-red-100 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {p.docAName} <span className="text-red-500 font-bold">↔</span>{' '}
                      {p.docBName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {p.exactMatches} exact match(es) • {p.totalMatches} total
                      passages
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        p.similarity >= 80
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {p.similarity}%
                    </span>
                    {onOpenDiff && (
                      <button
                        type="button"
                        onClick={() => onOpenDiff(p.rawPair)}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline ml-1"
                      >
                        Diff
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="leading-relaxed">
            <strong>Staff Fast-Check Passed:</strong> All analyzed documents
            show independent, unique content. No cross-document copying exceeded
            the 60% threshold (highest overlap: {stats.maxSim}%).
          </p>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3" /> Filter:
          </span>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              filterMode === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Pairs ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('flagged')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              filterMode === 'flagged'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Flagged Copied (≥60%) ({stats.flagged})
          </button>
          {stats.high > 0 && (
            <button
              type="button"
              onClick={() => setFilterMode('high')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterMode === 'high'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
              }`}
            >
              High Risk (≥80%) ({stats.high})
            </button>
          )}
        </div>

        {/* Search input */}
        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search document name…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* VIEW MODE 1: Pairwise Summary Table */}
      {viewMode === 'pairwise' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50">
          {filteredPairs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">
                No Document Pairs Found
              </p>
              <p>
                {searchTerm
                  ? `No pairs matched "${searchTerm}".`
                  : 'No document pairs in this filter category.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs text-left" aria-label="Copied Document Summary Table">
              <thead>
                <tr className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    #
                  </th>
                  <th scope="col" className="py-2.5 px-3 min-w-[160px]">
                    Document 1 (Source)
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-center">
                    ↔
                  </th>
                  <th scope="col" className="py-2.5 px-3 min-w-[160px]">
                    Copied With (Document 2)
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap min-w-[130px]">
                    Overlap / Similarity
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                    Copy Verdict
                  </th>
                  <th scope="col" className="py-2.5 px-3 whitespace-nowrap text-center">
                    Matches
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-right whitespace-nowrap">
                    Quick Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 bg-white">
                {filteredPairs.map((p, pIdx) => (
                  <tr
                    key={p.pairId}
                    className={`hover:bg-slate-50/90 transition-colors ${
                      p.similarity >= 80
                        ? 'bg-red-50/20'
                        : p.similarity >= 60
                        ? 'bg-amber-50/15'
                        : ''
                    }`}
                  >
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {pIdx + 1}
                    </td>

                    {/* Document A */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span
                          className="font-semibold text-slate-900 truncate block max-w-[170px]"
                          title={p.docAName}
                        >
                          {p.docAName}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-2 text-center text-slate-400 font-bold">
                      ↔
                    </td>

                    {/* Document B */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span
                          className="font-semibold text-slate-900 truncate block max-w-[170px]"
                          title={p.docBName}
                        >
                          {p.docBName}
                        </span>
                      </div>
                    </td>

                    {/* Similarity Score & Mini Bar */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-bold text-xs ${
                              p.similarity >= 80
                                ? 'text-red-700'
                                : p.similarity >= 60
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {p.similarity}%
                          </span>
                          <span className="text-[10px] text-slate-400">
                            overlap
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${p.barColor}`}
                            style={{
                              width: `${Math.max(4, p.similarity)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${p.badgeClass}`}
                      >
                        {p.statusLabel}
                      </span>
                    </td>

                    {/* Matches Count */}
                    <td className="py-3 px-3 whitespace-nowrap text-center text-slate-600">
                      <span className="font-bold text-slate-800">
                        {p.totalMatches}
                      </span>{' '}
                      <span className="text-[10px] text-slate-400">
                        ({p.exactMatches} exact)
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 justify-end">
                        {onOpenDiff && (
                          <button
                            type="button"
                            onClick={() => onOpenDiff(p.rawPair)}
                            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors inline-flex items-center gap-1"
                            title="Open interactive side-by-side diff"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            Diff
                          </button>
                        )}
                        {onScrollToPair && (
                          <button
                            type="button"
                            onClick={() => onScrollToPair(p.pairId || p.idx)}
                            className="px-2 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="Scroll to detailed comparison card"
                          >
                            Details
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* VIEW MODE 2: Per-Document Breakdown */}
      {viewMode === 'document' && (
        <div className="space-y-3">
          {filteredDocuments.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-1 bg-slate-50 rounded-xl border border-slate-200">
              <p className="font-semibold text-slate-700">
                No Documents Matched Filter
              </p>
              <p>Try clearing your search or filter options.</p>
            </div>
          ) : (
            filteredDocuments.map((doc, dIdx) => (
              <div
                key={dIdx}
                className={`p-4 rounded-xl border bg-white shadow-2xs space-y-3 transition-colors ${
                  doc.highestSimilarity >= 80
                    ? 'border-red-200 bg-red-50/15'
                    : doc.highestSimilarity >= 60
                    ? 'border-amber-200 bg-amber-50/15'
                    : 'border-slate-200'
                }`}
              >
                {/* Document Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="font-bold text-sm text-slate-900 truncate">
                      {doc.documentName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {doc.highestSimilarity >= 60 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        Copied with {doc.flaggedCount} other file(s)
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Unique / Clean
                      </span>
                    )}

                    <span className="text-xs text-slate-500 font-medium">
                      Top Match:{' '}
                      <strong
                        className={
                          doc.highestSimilarity >= 80
                            ? 'text-red-700'
                            : doc.highestSimilarity >= 60
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }
                      >
                        {doc.highestSimilarity}%
                      </strong>{' '}
                      {doc.mostCopiedWith ? `(with ${doc.mostCopiedWith})` : ''}
                    </span>
                  </div>
                </div>

                {/* List of related documents */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                    Pairwise Overlap Breakdown for this Document:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {doc.relatedPairs.map((rel, rIdx) => (
                      <div
                        key={rIdx}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          rel.similarity >= 80
                            ? 'bg-red-50/60 border-red-200 text-red-900'
                            : rel.similarity >= 60
                            ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className="font-medium truncate"
                            title={rel.otherDocName}
                          >
                            ↔ {rel.otherDocName}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {rel.statusLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-xs">
                            {rel.similarity}%
                          </span>
                          {onOpenDiff && (
                            <button
                              type="button"
                              onClick={() => onOpenDiff(rel.pair)}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                              title="View diff"
                            >
                              Diff
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
