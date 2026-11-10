import React, { useState } from 'react';
import {
  X,
  Play,
  ArrowRight,
  Sparkles,
  Info,
  RotateCcw,
} from 'lucide-react';
import { PredictionSummary } from '../../../types/grievance';
import { previewClassify } from '../../../lib/api/endpoints';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';

interface WhatIfSandboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  originalNarrative: string;
  originalPrediction: PredictionSummary | null | undefined;
}

export const WhatIfSandboxDrawer: React.FC<WhatIfSandboxDrawerProps> = ({
  isOpen,
  onClose,
  originalNarrative,
  originalPrediction,
}) => {
  const [editedText, setEditedText] = useState(originalNarrative);
  const [simulatedPrediction, setSimulatedPrediction] = useState<PredictionSummary | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunSimulation = async () => {
    if (!editedText.trim() || editedText.trim().length < 20) {
      setSimulationError('Simulated narrative must contain at least 20 characters.');
      return;
    }
    setSimulationError(null);
    setIsSimulating(true);

    try {
      const result = await previewClassify({ text: editedText.trim() });
      setSimulatedPrediction(result);
    } catch (err) {
      setSimulationError(
        err instanceof Error ? err.message : 'Simulation failed. Please verify NLP service availability.'
      );
    } finally {
      setIsSimulating(false);
    }
  };

  const handleReset = () => {
    setEditedText(originalNarrative);
    setSimulatedPrediction(null);
    setSimulationError(null);
  };

  // Delta calculations
  const origConf = originalPrediction?.confidence ?? 0;
  const simConf = simulatedPrediction?.confidence ?? 0;
  const confDelta = simConf - origConf;

  const origMargin = originalPrediction?.margin ?? 0;
  const simMargin = simulatedPrediction?.margin ?? 0;
  const marginDelta = simMargin - origMargin;

  const categoryChanged =
    simulatedPrediction &&
    originalPrediction &&
    simulatedPrediction.predictedCategory !== originalPrediction.predictedCategory;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Counterfactual &ldquo;What-If&rdquo; Sensitivity Sandbox
              </h2>
              <p className="text-[11px] text-slate-500">
                Stateless simulation of classification and linear feature shifts.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Notice */}
        <div className="p-4 bg-teal-50/70 border-b border-teal-100 text-xs text-teal-900 flex items-start gap-2">
          <Info size={16} className="text-teal-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Stateless Exploration:</span> Modifications made here are never persisted to the database and do not create audit log entries.
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1">
          {simulationError && (
            <Alert variant="danger" title="Simulation Error">
              {simulationError}
            </Alert>
          )}

          {/* Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="whatif-text" className="font-semibold text-slate-800">
                Simulated Complaint Narrative
              </label>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 font-mono">
                  {editedText.length} chars
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 text-[11px] text-teal-700 hover:text-teal-900 font-medium"
                >
                  <RotateCcw size={12} /> Reset to Original
                </button>
              </div>
            </div>

            <textarea
              id="whatif-text"
              rows={6}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              placeholder="Edit or append narrative phrases to test model sensitivity..."
              className="w-full text-xs font-sans rounded-xl border border-slate-200 p-3.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 shadow-2xs resize-y"
            />

            {/* Quick perturbation chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <span className="text-slate-400 font-medium">Add test phrase:</span>
              <button
                type="button"
                onClick={() => setEditedText((t) => t + ' The debt collector threatened me with wage garnishment and illegal arrest.')}
                className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
              >
                + Debt collection threat
              </button>
              <button
                type="button"
                onClick={() => setEditedText((t) => t + ' The mortgage servicer initiated wrongful foreclosure and sent a notice of sheriff sale.')}
                className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
              >
                + Foreclosure keyword
              </button>
              <button
                type="button"
                onClick={() => setEditedText((t) => t + ' Unauthorized withdrawal drained my checking account savings without notice.')}
                className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
              >
                + Unauthorized drain
              </button>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleRunSimulation}
            isLoading={isSimulating}
            className="w-full shadow-xs"
          >
            <Play size={14} className="mr-1.5" /> Run What-If Simulation
          </Button>

          {/* Results Comparison */}
          {simulatedPrediction && (
            <div className="space-y-4 pt-4 border-t border-slate-200 animate-in fade-in duration-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Simulation Delta Comparison
              </h3>

              {/* Category Shift */}
              <div
                className={`p-4 rounded-xl border ${
                  categoryChanged
                    ? 'bg-amber-50/70 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Predicted Category Shift
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-400">Original: </span>
                    <span className="font-bold text-slate-800">
                      {originalPrediction?.predictedCategory || 'N/A'}
                    </span>
                  </div>
                  <ArrowRight size={14} className="text-slate-400 hidden sm:block" />
                  <div>
                    <span className="text-slate-400">Simulated: </span>
                    <span
                      className={`font-bold ${
                        categoryChanged ? 'text-amber-800' : 'text-slate-800'
                      }`}
                    >
                      {simulatedPrediction.predictedCategory}
                    </span>
                  </div>
                </div>
                {categoryChanged && (
                  <p className="text-[11px] text-amber-800 font-medium mt-2">
                    &bull; Narrative modifications altered the model top-1 classification!
                  </p>
                )}
              </div>

              {/* Confidence & Margin Delta */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">
                    Top-1 Confidence
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-slate-700">
                      {(simConf * 100).toFixed(1)}%
                    </span>
                    <span
                      className={`text-[11px] font-bold flex items-center ${
                        confDelta >= 0 ? 'text-teal-700' : 'text-rose-700'
                      }`}
                    >
                      {confDelta >= 0 ? '+' : ''}
                      {(confDelta * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">
                    Top-2 Margin
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-slate-700">
                      {(simMargin * 100).toFixed(1)}%
                    </span>
                    <span
                      className={`text-[11px] font-bold flex items-center ${
                        marginDelta >= 0 ? 'text-teal-700' : 'text-rose-700'
                      }`}
                    >
                      {marginDelta >= 0 ? '+' : ''}
                      {(marginDelta * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Simulated Linear Drivers */}
              {simulatedPrediction.explanation && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                    Simulated Top Positive Drivers
                  </div>
                  <div className="space-y-1.5">
                    {simulatedPrediction.explanation.topPositiveFeatures.slice(0, 4).map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-lg bg-teal-50/60 border border-teal-200 text-xs font-mono"
                      >
                        <span className="font-bold text-teal-950 truncate pr-2">
                          {f.feature}
                        </span>
                        <span className="text-teal-700 font-bold">
                          +{f.contribution.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose} size="sm">
            Close Sandbox
          </Button>
        </div>
      </div>
    </div>
  );
};
