import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  RotateCcw,
  Play,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Copy,
  Check,
  Info,
  ArrowRight,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { DualModelComparisonResponse, PredictionSummary } from '../../../types/grievance';
import { compareModels } from '../../../lib/api/endpoints';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { LoadingIndicator } from '../../../components/ui/LoadingIndicator';
import { SemanticPrecedentCard } from './SemanticPrecedentCard';

interface DecisionIntelligenceLabProps {
  originalNarrative: string;
  originalPrediction: PredictionSummary | null | undefined;
  grievanceId: string;
  onAppendReviewNote: (text: string) => void;
}

export const SYNTHETIC_PRESETS = [
  {
    id: 'mortgage_foreclosure',
    title: 'Critical Mortgage Foreclosure',
    text:
      'URGENT: Received an immediate Notice of Default and pending Trustee Sale date scheduled for next Tuesday on my primary mortgage. I submitted a complete loan modification packet under the loss mitigation rules 45 days ago, but the loan servicer continues dual-tracking foreclosure proceedings and refused to acknowledge receipt of documents, threatening imminent eviction.',
  },
  {
    id: 'debt_vs_card',
    title: 'Ambiguous Debt vs Credit Card',
    text:
      'A collection agency has placed an outstanding charge of $1,850 on my credit file citing an unpaid balance from a store credit card opened six years ago. When I demanded formal debt validation under FDCPA, they sent a generic printout without original account agreements or itemized interest charges, while simultaneously calling my workplace multiple times daily.',
  },
  {
    id: 'credit_reporting',
    title: 'Credit Reporting Dispute',
    text:
      'I formally submitted certified dispute letters to all three nationwide credit reporting bureaus regarding an erroneous delinquent auto loan account that belongs to an individual with a similar name and SSN. Despite enclosing government ID and police reports proving identity theft, the bureau marked the dispute as verified without performing a reasonable investigation.',
  },
  {
    id: 'unauthorized_transactions',
    title: 'Unauthorized Card Transactions',
    text:
      'Discovered eight separate unauthorized debit and credit card charges totaling $2,430 billed from an overseas merchant while traveling domestically. I immediately notified my bank within 24 hours to freeze the card and dispute under Regulation E/Z, but the bank denied the provisional credit claim asserting that the card chip was authenticated.',
  },
];

export const DecisionIntelligenceLab: React.FC<DecisionIntelligenceLabProps> = ({
  originalNarrative,
  originalPrediction,
  grievanceId,
  onAppendReviewNote,
}) => {
  const [activeTab, setActiveTab] = useState<'whatif' | 'precedents'>('whatif');
  const [simulatedText, setSimulatedText] = useState<string>(originalNarrative);
  const [comparison, setComparison] = useState<DualModelComparisonResponse | null>(null);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [copiedNote, setCopiedNote] = useState<boolean>(false);

  // Character and word counts
  const origWordCount = originalNarrative.trim().split(/\s+/).filter(Boolean).length;
  const simWordCount = simulatedText.trim().split(/\s+/).filter(Boolean).length;
  const wordDelta = simWordCount - origWordCount;

  const origCharCount = originalNarrative.length;
  const simCharCount = simulatedText.length;
  const charDelta = simCharCount - origCharCount;

  const replayRequest = useRef<AbortController | null>(null);
  useEffect(() => () => replayRequest.current?.abort(), []);

  const updateNarrative = (text: string) => {
    replayRequest.current?.abort();
    setSimulatedText(text);
    setComparison(null);
    setReplayError(null);
    setCopiedNote(false);
    setIsReplaying(false);
  };
  const handleReset = () => {
    updateNarrative(originalNarrative);
  };

  const handleApplyPreset = (presetText: string) => {
    // STRICT RULE: Only populates editor text — never fabricates predictions or saves data
    updateNarrative(presetText);
  };

  const handleRunReplay = async () => {
    const trimmed = simulatedText.trim();
    if (trimmed.length < 10) {
      setReplayError('Simulated narrative must contain at least 10 characters.');
      return;
    }
    if (trimmed.length > 10000) {
      setReplayError('Simulated narrative cannot exceed 10,000 characters.');
      return;
    }

    setReplayError(null);
    replayRequest.current?.abort();
    const controller = new AbortController();
    replayRequest.current = controller;
    setIsReplaying(true);

    try {
      const res = await compareModels(trimmed, controller.signal);
      if (!controller.signal.aborted) setComparison(res);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setReplayError((err as Error).message || 'Replay simulation failed. Ensure NLP service is reachable.');
    } finally {
      if (!controller.signal.aborted) setIsReplaying(false);
    }
  };

  const handleCopySummaryToNote = () => {
    if (!comparison) return;

    const base = comparison.baseline;
    const chal = comparison.bilstm;
    const summaryText =
      `[Counterfactual Replay Summary]\n` +
      `• Edit Delta: ${wordDelta >= 0 ? '+' : ''}${wordDelta} words (${charDelta >= 0 ? '+' : ''}${charDelta} chars)\n` +
      `• Baseline Model (${base.model_type}): "${base.predicted_category}" (Confidence: ${(base.confidence * 100).toFixed(1)}%, Top-2 Margin: ${(base.margin * 100).toFixed(1)}%)\n` +
      `• Challenger Bi-LSTM: "${chal.predicted_category}" (Confidence: ${(chal.confidence * 100).toFixed(1)}%, Top-2 Margin: ${(chal.margin * 100).toFixed(1)}%)\n` +
      `• Model Agreement: ${comparison.models_agree ? 'AGREE' : 'DISAGREE'}\n` +
      `• Latency: Baseline ${base.latency_ms}ms vs. Bi-LSTM ${chal.latency_ms}ms\n` +
      `• Telemetry: Active TF-IDF Features: ${base.token_or_feature_count} | Non-Padding Tokens: ${chal.token_or_feature_count} (truncated: ${chal.truncated})`;

    onAppendReviewNote(summaryText);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2500);
  };

  // Deltas against Zone A
  const origCategory = originalPrediction?.predictedCategory;
  const simBaselineCategory = comparison?.baseline.predicted_category;
  const isCategoryFlipped = simBaselineCategory && simBaselineCategory !== origCategory;

  const confDelta = comparison && originalPrediction ? (comparison.baseline.confidence - originalPrediction.confidence) * 100 : null;
  const marginDelta = comparison && originalPrediction ? (comparison.baseline.margin - originalPrediction.margin) * 100 : null;
  // Provenance consistency check
  const origModelVersion = originalPrediction?.modelVersion;
  const liveModelHash = comparison?.baseline.model_version_sha256;
  const isProvenanceMatch = origModelVersion && liveModelHash ? origModelVersion === liveModelHash : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      {/* Lab Header */}
      <div className="p-5 border-b border-slate-100 bg-canvas text-ink flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 border border-line text-teal-trust flex items-center justify-center">
            <Sparkles size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-ink">
                CivicResolve Decision Intelligence Lab
              </h2>
            </div>
            <p className="text-sm text-ink-muted">
              Compare model responses to edited text or inspect similar cases.
            </p>
          </div>
        </div>

        {/* Tab View Switcher */}
        <div className="inline-flex p-1 bg-white rounded-lg border border-line text-xs font-medium">
          <button
            type="button"
            aria-pressed={activeTab === 'whatif'}
            onClick={() => setActiveTab('whatif')}
            className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'whatif'
                ? 'bg-teal-trust text-white font-semibold shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Sparkles size={13} />
            What-If Replay
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'precedents'}
            onClick={() => setActiveTab('precedents')}
            className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'precedents'
                ? 'bg-teal-trust text-white font-semibold shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Scale size={13} />
            Precedent Consistency
          </button>
        </div>
      </div>

      {/* Tab 1: Counterfactual Simulation Workspace (Zone B + Zone C Dual-Model Telemetry) */}
      {activeTab === 'whatif' && (
        <div className="p-5 md:p-6 space-y-6">
          {/* ZONE B — What-If Narrative Lab */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                    Zone B — Counterfactual Narrative Editor
                  </h3>
                  <Badge variant="warning" size="sm" className="text-xs">
                    Stateless Simulation
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Edit complaint details or load synthetic stress-test scenarios to evaluate model sensitivity.
                </p>
              </div>

              {/* Delta Telemetry Pill */}
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg">
                  Words: {simWordCount}{' '}
                  <span className={wordDelta > 0 ? 'text-teal-700 font-bold' : wordDelta < 0 ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                    ({wordDelta >= 0 ? `+${wordDelta}` : wordDelta})
                  </span>
                </span>
                <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg">
                  Chars: {simCharCount}{' '}
                  <span className={charDelta > 0 ? 'text-teal-700 font-bold' : charDelta < 0 ? 'text-rose-700 font-bold' : 'text-slate-600'}>
                    ({charDelta >= 0 ? `+${charDelta}` : charDelta})
                  </span>
                </span>
              </div>
            </div>

            {/* Synthetic Demo Presets (visibly badged as synthetic / not saved) */}
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Layers size={13} className="text-slate-600" />
                <span>Synthetic Demo Stress Presets:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {SYNTHETIC_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.text)}
                    className="p-2.5 text-left rounded-xl border border-slate-200 bg-slate-50 hover:bg-teal-50/60 hover:border-teal-300 transition-all space-y-1 shadow-2xs group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-teal-900 line-clamp-1">
                      {preset.title}
                    </div>
                    <span className="inline-block text-[9px] font-mono font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                      SYNTHETIC DEMO
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* TF-IDF Linear Attribution Feature Tokens */}
            {originalPrediction?.explanation && (
              ((originalPrediction.explanation.topPositiveFeatures && originalPrediction.explanation.topPositiveFeatures.length > 0) ||
               (originalPrediction.explanation.topNegativeFeatures && originalPrediction.explanation.topNegativeFeatures.length > 0)) && (
                <div className="space-y-1.5 p-3 bg-slate-50/80 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Scale size={13} className="text-teal-700" />
                      TF-IDF Linear Attribution Tokens
                    </span>
                    <span className="text-slate-600 font-mono text-xs">
                      {originalPrediction.explanation.predictedClass} Drivers
                    </span>
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {originalPrediction.explanation.topPositiveFeatures?.slice(0, 6).map((feat, idx) => (
                      <span
                        key={`lab-pos-${idx}-${feat.feature}`}
                        title={`Contribution: +${feat.contribution.toFixed(4)}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs tabular-nums"
                      >
                        <span>+{feat.feature}</span>
                        <span className="text-xs text-teal-600 font-bold opacity-80">
                          {feat.contribution > 0 ? `+${feat.contribution.toFixed(2)}` : feat.contribution.toFixed(2)}
                        </span>
                      </span>
                    ))}
                    {originalPrediction.explanation.topNegativeFeatures?.slice(0, 4).map((feat, idx) => (
                      <span
                        key={`lab-neg-${idx}-${feat.feature}`}
                        title={`Contribution: ${feat.contribution.toFixed(4)}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs tabular-nums"
                      >
                        <span>{feat.feature}</span>
                        <span className="text-xs text-rose-600 font-bold opacity-80">
                          {feat.contribution.toFixed(2)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Editable Textarea */}
            <div className="space-y-1.5">
              <label htmlFor="counterfactual-editor" className="block text-sm font-semibold text-ink">Simulation narrative</label>
              <textarea
                id="counterfactual-editor"
                rows={5}
                value={simulatedText}
                onChange={(e) => updateNarrative(e.target.value)}
                placeholder="Enter counterfactual narrative to test sensitivity..."
                className="w-full text-xs font-sans rounded-xl border border-slate-300 bg-white p-3.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 shadow-2xs"
              />
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Valid input range: 10 to 10,000 characters.</span>
                <span className="font-mono">{simCharCount} / 10,000</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isReplaying || simulatedText === originalNarrative}
                className="inline-flex items-center gap-1.5 text-xs"
              >
                <RotateCcw size={13} /> Reset to Original
              </Button>

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleRunReplay}
                disabled={isReplaying || !simulatedText.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-bold shadow-xs"
              >
                {isReplaying ? (
                  <LoadingIndicator size="sm" label="Executing Replay..." />
                ) : (
                  <>
                    <Play size={13} className="fill-current" /> Compare Models &amp; Run Replay
                  </>
                )}
              </Button>
            </div>

            {replayError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                <span>{replayError}</span>
              </div>
            )}
          </div>

          {/* ZONE C — Decision Intelligence & Telemetry Delta Results */}
          {comparison && (
            <div className="pt-5 border-t border-slate-200/90 space-y-5 animate-in fade-in duration-200">
              {/* Header & Copy Action */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
                    Zone C — Replay Telemetry &amp; Model Arena Comparison
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dual inference comparing active TF-IDF linear baseline against PyTorch Bi-LSTM benchmark.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopySummaryToNote}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 shadow-2xs"
                >
                  {copiedNote ? (
                    <>
                      <Check size={13} className="text-emerald-600" /> Appended to Note!
                    </>
                  ) : (
                    <>
                      <Copy size={13} /> Copy Replay Summary to Review Note
                    </>
                  )}
                </Button>
              </div>

              {/* Model Agreement Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs shadow-2xs ${
                  comparison.models_agree
                    ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-medium'
                    : 'bg-amber-50/90 border-amber-300 text-amber-950 font-medium'
                }`}
              >
                <div className="flex items-center gap-2">
                  {comparison.models_agree ? (
                    <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-700 shrink-0" />
                  )}
                  <span>
                    <strong>Model {comparison.models_agree ? 'Agreement' : 'Disagreement'}:</strong>{' '}
                    {comparison.models_agree
                      ? `Both models unanimously recommend "${comparison.baseline.predicted_category}".`
                      : `Baseline recommends "${comparison.baseline.predicted_category}", whereas Challenger recommends "${comparison.bilstm.predicted_category}".`}
                  </span>
                </div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white/80 border border-slate-300 shrink-0">
                  Δ Conf: {(comparison.confidence_delta * 100).toFixed(1)}%
                </span>
              </div>

              {/* Baseline vs. Original Persisted Prediction Delta */}
              <div className="p-4 bg-slate-50/90 border border-slate-200/90 rounded-xl space-y-3 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={15} className="text-teal-700" />
                    <span className="text-xs font-bold text-slate-900 font-mono">
                      Baseline vs. Original Persisted Prediction Delta
                    </span>
                  </div>

                  {/* Provenance Consistency Check Badge */}
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                      isProvenanceMatch
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-amber-50 text-amber-900 border-amber-300'
                    }`}
                  >
                    {isProvenanceMatch === null ? 'Model version unavailable' : isProvenanceMatch ? 'Model versions match' : 'Model version changed'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Category Shift */}
                  <div className="p-2.5 bg-white border border-slate-200/80 rounded-lg">
                    <div className="text-xs text-slate-500 font-medium">Category Disposition</div>
                    <div className="font-bold text-slate-900 pt-1">
                      {!origCategory ? "Original category unavailable" : isCategoryFlipped ? (
                        <span className="text-amber-700 flex items-center gap-1">
                          {origCategory} <ArrowRight size={12} /> {simBaselineCategory}
                        </span>
                      ) : (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 size={13} /> Maintained: {origCategory}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Confidence Delta */}
                  <div className="p-2.5 bg-white border border-slate-200/80 rounded-lg">
                    <div className="text-xs text-slate-500 font-medium">Confidence Shift</div>
                    <div className="font-bold text-slate-900 pt-1 font-mono tabular-nums">
                      {(comparison.baseline.confidence * 100).toFixed(1)}%{' '}
                      <span className="text-ink-muted">{confDelta === null ? "Original value unavailable" : `(${confDelta >= 0 ? "+" : ""}${confDelta.toFixed(1)} pp)`}</span>
                    </div>
                  </div>

                  {/* Top-2 Margin Delta */}
                  <div className="p-2.5 bg-white border border-slate-200/80 rounded-lg">
                    <div className="text-xs text-slate-500 font-medium">Top-2 Probability Margin (P₁ - P₂)</div>
                    <div className="font-bold text-slate-900 pt-1 font-mono tabular-nums">
                      {(comparison.baseline.margin * 100).toFixed(1)}%{' '}
                      <span className="text-ink-muted">{marginDelta === null ? "Original value unavailable" : `(${marginDelta >= 0 ? "+" : ""}${marginDelta.toFixed(1)} pp)`}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Model Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Baseline Card */}
                <div className="p-4 bg-white border-2 border-teal-500/30 rounded-xl space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Cpu size={16} className="text-teal-700" />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {comparison.baseline.model_name}
                        </div>
                        <span className="text-xs font-mono text-teal-800 font-semibold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                          Routing model
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border">
                      {comparison.baseline.latency_ms} ms
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Predicted Category:</span>
                      <span className="font-bold text-slate-900 text-right">
                        {comparison.baseline.predicted_category}
                      </span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">Confidence:</span>
                      <span className="font-bold text-teal-800">
                        {(comparison.baseline.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">Top-2 Probability Margin (P₁ - P₂):</span>
                      <span className="font-bold text-slate-800">
                        {(comparison.baseline.margin * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between font-mono pt-1 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Active TF-IDF N-Gram Features (of 50,000):</span>
                      <span className="font-bold text-slate-800">
                        {comparison.baseline.token_or_feature_count}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Challenger Card */}
                <div className="p-4 bg-white border-2 border-indigo-400/30 rounded-xl space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Cpu size={16} className="text-indigo-700" />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {comparison.bilstm.model_name}
                        </div>
                        <span className="text-xs font-mono text-indigo-800 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          Benchmark model
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border">
                      {comparison.bilstm.latency_ms} ms
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Predicted Category:</span>
                      <span className="font-bold text-slate-900 text-right">
                        {comparison.bilstm.predicted_category}
                      </span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">Confidence:</span>
                      <span className="font-bold text-indigo-800">
                        {(comparison.bilstm.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">Top-2 Probability Margin (P₁ - P₂):</span>
                      <span className="font-bold text-slate-800">
                        {(comparison.bilstm.margin * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between font-mono pt-1 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Non-Padding Sequence Tokens (max_len=200/250, truncated: true/false):</span>
                      <span className="font-bold text-slate-800">
                        {comparison.bilstm.token_or_feature_count} (truncated: {String(comparison.bilstm.truncated)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attribution Shift Notice & Disclaimers */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs text-slate-600">
                <div className="flex items-start gap-2 text-slate-700">
                  <Info size={15} className="text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>Attribution Transparency:</strong> Per-token linear feature attribution applies to the primary baseline inspection. PyTorch Bi-LSTM utilizes deep contextual sequence embeddings.
                  </div>
                </div>
                <div className="text-xs text-slate-500 border-t border-slate-200/60 pt-1.5 font-mono">
                  Uncalibrated model probability estimates. Stateless simulation—never written to PostgreSQL.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Precedent Consistency (Zone C Precedent Finder + Historical Decision Patterns) */}
      {activeTab === 'precedents' && (
        <div className="p-5 md:p-6 space-y-4">
          <SemanticPrecedentCard grievanceId={grievanceId} />
        </div>
      )}
    </div>
  );
};
