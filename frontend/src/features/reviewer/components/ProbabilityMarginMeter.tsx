import React, { useState } from 'react';
import { Gauge, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface ProbabilityMarginMeterProps {
  probabilities: Record<string, number>;
  predictedCategory: string;
  confidence: number;
  margin: number;
  minConfidenceThreshold?: number;
  minMarginThreshold?: number;
}

export const ProbabilityMarginMeter: React.FC<ProbabilityMarginMeterProps> = ({
  probabilities = {},
  predictedCategory,
  confidence,
  margin,
  minConfidenceThreshold = 0.55,
  minMarginThreshold = 0.15,
}) => {
  const [showAllClasses, setShowAllClasses] = useState(false);

  // Sort categories by probability descending
  const sortedProbabilities = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);

  const top1 = sortedProbabilities[0] || [predictedCategory, confidence];
  const top2 = sortedProbabilities[1] || ['None', 0];

  const isLowConfidence = confidence < minConfidenceThreshold;
  const isNarrowMargin = margin < minMarginThreshold;

  const displayList = showAllClasses ? sortedProbabilities : sortedProbabilities.slice(0, 4);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <Gauge size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              8-Class Probability &amp; Margin Calibration
            </h3>
            <p className="text-[11px] text-slate-500">
              Uncalibrated model probability estimates &bull; Dual-trigger safety thresholds.
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
          8 Classes
        </span>
      </div>

      {/* Threshold Status Badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Margin Threshold Box */}
        <div
          className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
            isNarrowMargin
              ? 'bg-amber-50/70 border-amber-200 text-amber-900'
              : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
          }`}
        >
          {isNarrowMargin ? (
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div className="text-xs">
            <div className="flex items-center justify-between font-bold">
              <span>Top-2 Probability Margin</span>
              <span className="font-mono tabular-nums text-sm">
                {(margin * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-[11px] mt-0.5 opacity-90">
              {isNarrowMargin ? (
                <>
                  Below minimum safety margin (<strong>&lt;{(minMarginThreshold * 100).toFixed(0)}%</strong>). Flagged for mandatory review.
                </>
              ) : (
                <>
                  Exceeds review threshold (<strong>&ge;{(minMarginThreshold * 100).toFixed(0)}%</strong>). Decisive class separation.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Confidence Threshold Box */}
        <div
          className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
            isLowConfidence
              ? 'bg-amber-50/70 border-amber-200 text-amber-900'
              : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
          }`}
        >
          {isLowConfidence ? (
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div className="text-xs">
            <div className="flex items-center justify-between font-bold">
              <span>Top-1 Probability Confidence</span>
              <span className="font-mono tabular-nums text-sm">
                {(confidence * 100).toFixed(2)}%
              </span>
            </div>
            <p className="text-[11px] mt-0.5 opacity-90">
              {isLowConfidence ? (
                <>
                  Below confidence threshold (<strong>&lt;{(minConfidenceThreshold * 100).toFixed(0)}%</strong>). Human verification required.
                </>
              ) : (
                <>
                  High preliminary estimate (<strong>&ge;{(minConfidenceThreshold * 100).toFixed(0)}%</strong>).
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Class Probabilities Bars */}
      <div className="space-y-2">
        {displayList.map(([cat, prob], index) => {
          const isWinner = cat === top1[0];
          const isRunnerUp = cat === top2[0];
          const pct = Math.round(prob * 1000) / 10;

          return (
            <div
              key={cat}
              className={`p-2.5 rounded-xl border transition-all ${
                isWinner
                  ? 'bg-teal-50/60 border-teal-300 shadow-2xs'
                  : isRunnerUp
                  ? 'bg-slate-50 border-slate-200'
                  : 'bg-white border-slate-100'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono mb-1">
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="text-[10px] text-slate-400 font-bold w-4">
                    #{index + 1}
                  </span>
                  <span
                    className={`font-semibold truncate ${
                      isWinner ? 'text-teal-950 font-bold' : 'text-slate-800'
                    }`}
                    title={cat}
                  >
                    {cat}
                  </span>
                  {isWinner && (
                    <span className="text-[9px] bg-teal-600 text-white font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                      Predicted
                    </span>
                  )}
                  {isRunnerUp && (
                    <span className="text-[9px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                      Runner-up
                    </span>
                  )}
                </div>

                <span
                  className={`font-mono tabular-nums text-xs font-bold ${
                    isWinner ? 'text-teal-700' : 'text-slate-600'
                  }`}
                >
                  {(prob * 100).toFixed(2)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isWinner
                      ? 'bg-teal-600'
                      : isRunnerUp
                      ? 'bg-slate-400'
                      : 'bg-slate-300'
                  }`}
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {sortedProbabilities.length > 4 && (
        <button
          type="button"
          onClick={() => setShowAllClasses(!showAllClasses)}
          className="w-full py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200/80 transition-colors flex items-center justify-center gap-1"
        >
          {showAllClasses ? (
            <>
              <ChevronUp size={14} /> Show Top 4 Classes Only
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Show All 8 Product Classes ({sortedProbabilities.length})
            </>
          )}
        </button>
      )}

      {/* Truthful AI Disclaimer Banner */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-[11px] text-slate-500 flex items-start gap-2">
        <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
        <div>
          <span className="font-semibold text-slate-700">Truthful AI Notice:</span>{' '}
          All probabilities shown are <em>uncalibrated model probability estimates</em> and preliminary AI assessments. They are heuristic suggestions and do not constitute legal adjudication or guaranteed routing.
        </div>
      </div>
    </div>
  );
};
