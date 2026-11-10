import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowUpRight, Scale } from 'lucide-react';
import { getPrecedents } from '../../../lib/api/endpoints';
import { SemanticPrecedentItem } from '../../../types/grievance';
import { LoadingIndicator } from '../../../components/ui/LoadingIndicator';
import { HistoricalDecisionPatternCard } from './HistoricalDecisionPatternCard';

interface SemanticPrecedentCardProps {
  grievanceId: string;
}

export const SemanticPrecedentCard: React.FC<SemanticPrecedentCardProps> = ({ grievanceId }) => {
  const [precedents, setPrecedents] = useState<SemanticPrecedentItem[]>([]);
  const [totalCandidates, setTotalCandidates] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function fetchPrecedents() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getPrecedents(grievanceId, controller.signal);
        if (isMounted) {
          setPrecedents(res.precedents || []);
          setTotalCandidates(res.candidatesEvaluated || 0);
        }
      } catch (err: unknown) {
        if (isMounted && (err as Error).name !== 'AbortError') {
          setError('Unable to load historical precedents.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (grievanceId) {
      fetchPrecedents();
    }

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [grievanceId]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <Scale size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Precedent Insights (Top 3 Prior Decisions)
            </h2>
            <p className="text-[11px] text-slate-500">
              Ranked by exact Lexical TF-IDF Cosine Similarity against historical human-adjudicated cases.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
          Pool: {totalCandidates} cases
        </span>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="py-6 flex justify-center items-center">
            <LoadingIndicator size="sm" label="Evaluating lexical similarity over historical decisions..." />
          </div>
        ) : error ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
            <AlertCircle size={15} className="text-slate-400" />
            <span>{error}</span>
          </div>
        ) : precedents.length === 0 ? (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 text-center">
            No finalized human-adjudicated precedents available yet in the pool.
          </div>
        ) : (
          <div className="space-y-4">
            <HistoricalDecisionPatternCard
              precedents={precedents}
              totalCandidates={totalCandidates}
            />

            <div className="space-y-3.5">
              {precedents.map((item, idx) => {
              const simPercent = (item.similarityScore * 100).toFixed(1);
              const isOverridden = item.status === 'OVERRIDDEN';

              return (
                <div
                  key={item.grievanceId || idx}
                  className="p-4 bg-slate-50/80 hover:bg-slate-50 rounded-xl border border-slate-200/90 transition-all text-xs space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                        #{idx + 1} · {simPercent}% Similarity
                      </span>
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider font-mono">
                        Lexical TF-IDF Cosine Similarity
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                          isOverridden
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>

                  <div className="text-slate-700 leading-relaxed font-sans bg-white p-3 rounded-lg border border-slate-200/70 shadow-2xs">
                    "{item.sanitizedSnippet}"
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Adjudicated:</span>
                      <span className="font-semibold text-slate-900">{item.assignedCategory}</span>
                      {item.predictedCategory && item.predictedCategory !== item.assignedCategory && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          (overrode AI: {item.predictedCategory})
                        </span>
                      )}
                    </div>

                    <a
                      href={`/reviewer/grievances/${item.grievanceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 font-semibold"
                    >
                      Inspect #{item.grievanceId.substring(0, 8)} <ArrowUpRight size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
