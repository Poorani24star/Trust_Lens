import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, CheckCircle2, AlertTriangle, Info, Copy, ArrowLeftRight } from 'lucide-react';
import SideBySideDiffViewer from './SideBySideDiffViewer';

export function getSimilarityStatus(similarityScore) {
  const score = Number(similarityScore) || 0;
  if (score >= 80) {
    return {
      label: 'High Similarity Detected',
      variant: 'danger',
      colorClass: 'bg-red-50 text-red-700 border-red-200',
      badgeClass: 'bg-red-600 text-white',
      icon: AlertTriangle,
    };
  }
  if (score >= 60) {
    return {
      label: 'Potential Copied Content',
      variant: 'warning',
      colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
      badgeClass: 'bg-amber-500 text-white',
      icon: Info,
    };
  }
  return {
    label: 'No Significant Similarity',
    variant: 'success',
    colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeClass: 'bg-emerald-600 text-white',
    icon: CheckCircle2,
  };
}

export function getMatchLabel(matchType, similarity) {
  const t = (matchType || '').toLowerCase();
  if (t === 'exact_match' || t === 'exact-match' || similarity === 100) {
    return { label: 'Exact Match', bg: 'bg-red-100 text-red-800 border-red-200' };
  }
  if (t === 'near_identical' || t === 'near-match' || similarity >= 80) {
    return { label: 'Near-Identical Match', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  return { label: 'Partial Match', bg: 'bg-blue-100 text-blue-800 border-blue-200' };
}

export default function CopiedContentResultCard({ pair, pairIndex }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDiffViewerOpen, setIsDiffViewerOpen] = useState(false);
  const [diffViewerMatchIndex, setDiffViewerMatchIndex] = useState(0);

  if (!pair) return null;

  const docAName = pair.documentA?.originalName || pair.documentA?.name || pair.docA?.name || pair.doc1 || 'Document A';
  const docBName = pair.documentB?.originalName || pair.documentB?.name || pair.docB?.name || pair.doc2 || 'Document B';

  const similarityScore = pair.overallMatchedContentPercentage ?? pair.similarity ?? pair.similarityScore ?? 0;
  const status = getSimilarityStatus(similarityScore);
  const StatusIcon = status.icon;

  const matches = pair.matches || pair.matchedBlocks || [];

  return (
    <>
      <div
        id={pair.pairId ? `pair-card-${pair.pairId}` : `pair-card-${pairIndex}`}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0 transition-all"
      >
        {/* Pair Header Summary */}
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Pair #{pairIndex + 1}
              </span>
              <div className={`px-2.5 py-0.5 rounded-full border text-xs font-bold flex items-center gap-1 ${status.colorClass}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                <span>{status.label}</span>
              </div>
            </div>

            <h4 className="text-base font-bold text-slate-900 flex items-center gap-2 truncate">
              <span className="text-slate-800 truncate" title={docAName}>{docAName}</span>
              <span className="text-slate-400 font-normal shrink-0">vs</span>
              <span className="text-slate-800 truncate" title={docBName}>{docBName}</span>
            </h4>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="text-right">
              <div className="text-2xl font-black text-slate-900">{similarityScore}%</div>
              <div className="text-xs text-slate-500 font-medium">Matched Content</div>
            </div>

            {matches.length > 0 && (
              <button
                onClick={() => {
                  setDiffViewerMatchIndex(0);
                  setIsDiffViewerOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors shadow-2xs"
                title="Open interactive side-by-side split comparison"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Side-by-Side Diff</span>
              </button>
            )}

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 rounded-lg hover:bg-slate-200/60 text-slate-600 transition-colors"
              title={isExpanded ? 'Collapse section matches' : 'Expand section matches'}
              aria-label="Toggle section matches"
            >
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Matching Sections */}
        {isExpanded && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h5 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Copy className="w-4 h-4 text-indigo-600" />
                Matching Sections ({matches.length})
              </h5>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-medium">
                  Passages meeting similarity threshold ($\ge 60\%$).
                </span>
                {matches.length > 0 && (
                  <button
                    onClick={() => {
                      setDiffViewerMatchIndex(0);
                      setIsDiffViewerOpen(true);
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>View All in Diff Viewer →</span>
                  </button>
                )}
              </div>
            </div>

            {matches.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 italic">
                No significant matching passages were identified between these documents.
              </div>
            ) : (
              <div className="space-y-4">
                {matches.map((match, mIdx) => {
                  const matchSim = match.similarity ?? Math.round((match.combinedSimilarity || match.similarityScore || 0) * 100);
                  const matchBadge = getMatchLabel(match.matchType, matchSim);

                  const textA = match.documentAPassage || match.documentA?.text || match.documentA?.passage || match.textA || '';
                  const textB = match.documentBPassage || match.documentB?.text || match.documentB?.passage || match.textB || '';

                  return (
                    <div key={match.matchId || mIdx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                      {/* Match item header */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-700">Match #{mIdx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${matchBadge.bg}`}>
                            {matchBadge.label}
                          </span>
                          <span className="text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {matchSim}% Similarity
                          </span>
                          <button
                            onClick={() => {
                              setDiffViewerMatchIndex(mIdx);
                              setIsDiffViewerOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 transition-colors"
                            title="Inspect this specific match in side-by-side diff viewer"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            <span>Inspect Diff</span>
                          </button>
                        </div>
                      </div>

                      {/* Comparison columns */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Document A Passage */}
                        <div className="space-y-1 bg-white p-3 rounded-lg border border-slate-200">
                          <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="truncate" title={docAName}>{docAName}</span>
                            {match.documentA?.passageIndex && (
                              <span className="text-slate-400 font-normal"> (Passage {match.documentA.passageIndex})</span>
                            )}
                          </div>
                          <p className="text-slate-800 font-mono text-[11px] leading-relaxed break-words bg-slate-50 p-2.5 rounded border border-slate-100">
                            &ldquo;{textA}&rdquo;
                          </p>
                        </div>

                        {/* Document B Passage */}
                        <div className="space-y-1 bg-white p-3 rounded-lg border border-slate-200">
                          <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="truncate" title={docBName}>{docBName}</span>
                            {match.documentB?.passageIndex && (
                              <span className="text-slate-400 font-normal"> (Passage {match.documentB.passageIndex})</span>
                            )}
                          </div>
                          <p className="text-slate-800 font-mono text-[11px] leading-relaxed break-words bg-slate-50 p-2.5 rounded border border-slate-100">
                            &ldquo;{textB}&rdquo;
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive Side-by-Side Diff Modal */}
      {isDiffViewerOpen && (
        <SideBySideDiffViewer
          pair={pair}
          initialMatchIndex={diffViewerMatchIndex}
          onClose={() => setIsDiffViewerOpen(false)}
        />
      )}
    </>
  );
}
