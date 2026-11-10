import React from 'react';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { FeatureContribution } from '../../../types/grievance';

interface DivergingFeatureBarChartProps {
  positiveFeatures?: FeatureContribution[];
  negativeFeatures?: FeatureContribution[];
  predictedClass?: string;
  runnerUpClass?: string;
}

export const DivergingFeatureBarChart: React.FC<DivergingFeatureBarChartProps> = ({
  positiveFeatures = [],
  negativeFeatures = [],
  predictedClass,
  runnerUpClass,
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

            return (
              <div
                key={`${item.feature}-${idx}`}
                className="group p-2 rounded-xl bg-slate-50/70 hover:bg-slate-100/80 border border-slate-200/60 transition-colors"
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
                        className="h-full bg-amber-500 rounded-l-full transition-all duration-300 group-hover:brightness-95"
                        style={{ width: `${widthPercent}%` }}
                      />
                    )}
                  </div>

                  {/* Right Half (Positive) */}
                  <div className="flex justify-start items-center">
                    {isPos && (
                      <div
                        className="h-full bg-teal-600 rounded-r-full transition-all duration-300 group-hover:brightness-95"
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
