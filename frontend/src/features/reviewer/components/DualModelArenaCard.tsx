import React, { useState } from 'react';
import { Cpu, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { compareModels } from '../../../lib/api/endpoints';
import { DualModelComparisonResponse } from '../../../types/grievance';
import { Button } from '../../../components/ui/Button';
import { LoadingIndicator } from '../../../components/ui/LoadingIndicator';

interface DualModelArenaCardProps {
  narrative: string;
}

export const DualModelArenaCard: React.FC<DualModelArenaCardProps> = ({ narrative }) => {
  const [comparison, setComparison] = useState<DualModelComparisonResponse | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunComparison = async () => {
    if (!narrative || narrative.trim().length < 10) return;
    setIsRunning(true);
    setError(null);
    try {
      const res = await compareModels(narrative);
      setComparison(res);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to execute dual-model comparison.');
    } finally {
      setIsRunning(false);
    }
  };

  const categories = comparison
    ? Object.keys(comparison.baseline.probabilities || {})
    : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <Cpu size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Live Dual-Model Arena (Linear vs. Neural)
            </h2>
            <p className="text-[11px] text-slate-500">
              Side-by-side inference: TF-IDF + Logistic Regression (Production) vs. PyTorch Bi-LSTM (Benchmark).
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRunComparison}
          disabled={isRunning || !narrative}
          className="inline-flex items-center gap-1.5 text-xs font-semibold"
        >
          {isRunning ? (
            <LoadingIndicator size="sm" label="Evaluating..." />
          ) : (
            <>
              <Sparkles size={13} className="text-teal-600" />
              {comparison ? 'Re-run Comparison' : 'Run Arena Comparison'}
            </>
          )}
        </Button>
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
            {error}
          </div>
        )}

        {!comparison && !isRunning && !error && (
          <div className="py-6 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl text-center space-y-2">
            <p className="text-xs text-slate-600 font-medium">
              Click <strong>"Run Arena Comparison"</strong> to execute the PyTorch Bi-LSTM neural model in real-time alongside the active TF-IDF baseline.
            </p>
            <p className="text-[11px] text-slate-400">
              Tests category agreement, confidence alignment, latency delta, and sequence truncation.
            </p>
          </div>
        )}

        {comparison && (
          <div className="space-y-4">
            {/* Agreement Banner */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                comparison.models_agree
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50/80 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {comparison.models_agree ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                )}
                <span className="font-semibold">
                  {comparison.models_agree
                    ? 'Consensus: Both models agree on top category'
                    : 'Discrepancy: Models disagree on recommended category'}
                </span>
              </div>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-white/80 border border-current">
                Δ Confidence: {(Math.abs(comparison.confidence_delta) * 100).toFixed(1)}%
              </span>
            </div>

            {/* Model Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Baseline Card */}
              <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded">
                    Production Authority
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {comparison.baseline.latency_ms} ms
                  </span>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800">{comparison.baseline.model_name}</h3>
                  <p className="text-sm font-extrabold text-slate-900 mt-1">
                    {comparison.baseline.predicted_category}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs pt-1 border-t border-slate-200/80">
                  <div>
                    <span className="text-slate-400 text-[10px]">Confidence: </span>
                    <span className="font-bold font-mono">{(comparison.baseline.confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Margin: </span>
                    <span className="font-bold font-mono">{(comparison.baseline.margin * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Active Features: </span>
                    <span className="font-mono">{comparison.baseline.token_or_feature_count}</span>
                  </div>
                </div>
              </div>

              {/* Bi-LSTM Card */}
              <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-800 bg-indigo-100/70 px-2 py-0.5 rounded">
                    Neural Benchmark
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {comparison.bilstm.latency_ms} ms
                  </span>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800">{comparison.bilstm.model_name}</h3>
                  <p className="text-sm font-extrabold text-slate-900 mt-1">
                    {comparison.bilstm.predicted_category}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs pt-1 border-t border-slate-200/80">
                  <div>
                    <span className="text-slate-400 text-[10px]">Confidence: </span>
                    <span className="font-bold font-mono">{(comparison.bilstm.confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Margin: </span>
                    <span className="font-bold font-mono">{(comparison.bilstm.margin * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Tokens: </span>
                    <span className="font-mono">{comparison.bilstm.token_or_feature_count}</span>
                    {comparison.bilstm.truncated && (
                      <span className="ml-1 text-[9px] text-amber-700 bg-amber-100 px-1 py-0.2 rounded">
                        trunc
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Probability Distribution Side-by-Side */}
            <div className="pt-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Class Probability Alignment
              </h4>
              <div className="space-y-1.5 text-xs font-mono">
                {categories.map((cat) => {
                  const pBase = (comparison.baseline.probabilities[cat] || 0) * 100;
                  const pBi = (comparison.bilstm.probabilities[cat] || 0) * 100;
                  const isTopBase = cat === comparison.baseline.predicted_category;
                  const isTopBi = cat === comparison.bilstm.predicted_category;

                  return (
                    <div key={cat} className="p-2 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-sans truncate ${isTopBase || isTopBi ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                          {cat}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`tabular-nums ${isTopBase ? 'text-teal-700 font-bold' : 'text-slate-400'}`}>
                            TF-IDF: {pBase.toFixed(1)}%
                          </span>
                          <span className={`tabular-nums ${isTopBi ? 'text-indigo-700 font-bold' : 'text-slate-400'}`}>
                            Bi-LSTM: {pBi.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 h-1.5 rounded-full overflow-hidden bg-slate-200">
                        <div className="bg-teal-600 h-full rounded-full" style={{ width: `${pBase}%` }} />
                        <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${pBi}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic pt-1">
              {comparison.disclaimer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
