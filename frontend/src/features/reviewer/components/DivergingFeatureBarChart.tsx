import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, RotateCcw } from 'lucide-react';
import { FeatureContribution } from '../../../types/grievance';

export interface DivergingFeatureBarChartProps {
  positiveFeatures?: FeatureContribution[];
  negativeFeatures?: FeatureContribution[];
  predictedClass?: string;
  runnerUpClass?: string;
  activeFeature?: string | null;
  onFeatureHover?: (feature: string | null) => void;
  onFeatureSelect?: (feature: string | null) => void;
}

export const DivergingFeatureBarChart: React.FC<DivergingFeatureBarChartProps> = ({
  positiveFeatures = [],
  negativeFeatures = [],
  predictedClass,
  runnerUpClass,
  activeFeature,
  onFeatureHover,
  onFeatureSelect,
}) => {
  // Combine all features
  const allFeatures = [
    ...positiveFeatures.map((f) => ({ ...f, type: 'positive' as const })),
    ...negativeFeatures.map((f) => ({ ...f, type: 'negative' as const })),
  ];

  // Determine maximum absolute contribution to calibrate bar scale
  const maxAbs = Math.max(
    ...allFeatures.map((f) => Math.abs(f.contribution)),
    0.001
  );

  const handleRowSelect = (featureName: string) => {
    onFeatureSelect?.(featureName);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <BarChart3 size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Diverging Feature Contribution Profile
            </h3>
            <p className="text-[11px] text-slate-500">
              Exact linear decision contribution $w_i \cdot x_i$ centered on zero line.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
          <span className="flex items-center gap-1 text-teal-700 font-semibold">
            <TrendingUp size={13} /> Favors {predictedClass || 'Predicted'}
          </span>
          <span className="text-slate-300">|</span>
          <span className="flex items-center gap-1 text-amber-700 font-semibold">
            <TrendingDown size={13} /> Favors {runnerUpClass || 'Runner-Up'}
          </span>
        </div>
      </div>

      {/* Clear Reset Indication when Active Feature is selected */}
      {activeFeature && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-teal-50/90 border border-teal-200/80 rounded-xl text-xs text-teal-900 animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            <span className="text-[11px] font-medium text-teal-800">
              Active Feature Focus: <strong className="font-mono text-teal-950 underline">{activeFeature}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onFeatureSelect?.(null)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-800 hover:text-teal-950 bg-white px-2 py-0.5 rounded border border-teal-300 shadow-2xs hover:bg-teal-50 transition-colors cursor-pointer"
            aria-label="Clear active feature filter"
          >
            <RotateCcw size={11} /> Reset Filter
          </button>
        </div>
      )}

      {/* Axis Guide */}
      <div className="grid grid-cols-2 text-[10px] text-slate-400 font-mono px-3">
        <div className="text-left">&larr; Negative Impact (-{maxAbs.toFixed(2)})</div>
        <div className="text-right">Positive Impact (+{maxAbs.toFixed(2)}) &rarr;</div>
      </div>

      {/* Bars Container */}
      <div className="space-y-2.5">
        {allFeatures.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            No linear attribution coefficients available for this prediction.
          </p>
        ) : (
          allFeatures.map((item, idx) => {
            const isPos = item.contribution >= 0;
            const widthPercent = Math.min(100, Math.round((Math.abs(item.contribution) / maxAbs) * 100));
            const isMatch = Boolean(
              activeFeature && item.feature.trim().toLowerCase() === activeFeature.trim().toLowerCase()
            );
            const isDimmed = Boolean(activeFeature && !isMatch);

            return (
              <div
                key={`${item.feature}-${idx}`}
                role="button"
                tabIndex={0}
                aria-pressed={isMatch}
                aria-label={`Linear feature: ${item.feature}, impact: ${item.contribution >= 0 ? '+' : ''}${item.contribution.toFixed(4)}`}
                className={`group p-2.5 rounded-xl border transition-all duration-150 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  isMatch
                    ? 'ring-2 ring-teal-500 bg-teal-50/80 scale-[1.01] border-teal-300 shadow-xs'
                    : isDimmed
                    ? 'opacity-50 bg-slate-50/40 border-slate-200/40'
                    : 'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/60'
                }`}
                onMouseEnter={() => onFeatureHover?.(item.feature)}
                onMouseLeave={() => onFeatureHover?.(null)}
                onClick={() => handleRowSelect(item.feature)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRowSelect(item.feature);
                  }
                }}
              >
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <span className="font-semibold text-slate-800 truncate pr-2 max-w-[220px]" title={item.feature}>
                    {item.feature}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] tabular-nums font-mono">
                    {item.tfidfValue != null && (
                      <span className="text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                        tfidf {item.tfidfValue.toFixed(3)}
                      </span>
                    )}
                    <span
                      className={`font-bold ${
                        isPos ? 'text-teal-700' : 'text-amber-700'
                      }`}
                    >
                      {item.contribution > 0 ? '+' : ''}
                      {item.contribution.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Centered Diverging Bar */}
                <div className="grid grid-cols-2 gap-0 h-2 bg-slate-200/50 rounded-full overflow-hidden relative">
                  {/* Left Half (Negative) */}
                  <div className="flex justify-end items-center border-r border-slate-300">
                    {!isPos && (
                      <div
                        className={`h-full bg-amber-500 rounded-l-full transition-all duration-300 group-hover:brightness-95 ${
                          isMatch ? 'brightness-110' : ''
                        }`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    )}
                  </div>

                  {/* Right Half (Positive) */}
                  <div className="flex justify-start items-center">
                    {isPos && (
                      <div
                        className={`h-full bg-teal-600 rounded-r-full transition-all duration-300 group-hover:brightness-95 ${
                          isMatch ? 'brightness-110' : ''
                        }`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
