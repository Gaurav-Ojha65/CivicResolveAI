import React, { useState } from 'react';
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
    badge: 'SYNTHETIC DEMO SCENARIO — NOT SAVED',
    text:
      'URGENT: Received an immediate Notice of Default and pending Trustee Sale date scheduled for next Tuesday on my primary mortgage. I submitted a complete loan modification packet under the loss mitigation rules 45 days ago, but the loan servicer continues dual-tracking foreclosure proceedings and refused to acknowledge receipt of documents, threatening imminent eviction.',
  },
  {
    id: 'debt_vs_card',
    title: 'Ambiguous Debt vs Credit Card',
    badge: 'SYNTHETIC DEMO SCENARIO — NOT SAVED',
    text:
      'A collection agency has placed an outstanding charge of $1,850 on my credit file citing an unpaid balance from a store credit card opened six years ago. When I demanded formal debt validation under FDCPA, they sent a generic printout without original account agreements or itemized interest charges, while simultaneously calling my workplace multiple times daily.',
  },
  {
    id: 'credit_reporting',
    title: 'Credit Reporting Dispute',
    badge: 'SYNTHETIC DEMO SCENARIO — NOT SAVED',
    text:
      'I formally submitted certified dispute letters to all three nationwide credit reporting bureaus regarding an erroneous delinquent auto loan account that belongs to an individual with a similar name and SSN. Despite enclosing government ID and police reports proving identity theft, the bureau marked the dispute as verified without performing a reasonable investigation.',
  },
  {
    id: 'unauthorized_transactions',
    title: 'Unauthorized Card Transactions',
    badge: 'SYNTHETIC DEMO SCENARIO — NOT SAVED',
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
  const [activeTab, setActiveTab] = useState<'whatif' | 'precedents' | 'arena'>('whatif');
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

  const handleReset = () => {
    setSimulatedText(originalNarrative);
    setComparison(null);
    setReplayError(null);
  };

  const handleApplyPreset = (presetText: string) => {
    // STRICT RULE: Only populates editor text — never fabricates predictions or saves data
    setSimulatedText(presetText);
    setComparison(null);
    setReplayError(null);
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
    setIsReplaying(true);

    try {
      const res = await compareModels(trimmed);
      setComparison(res);
    } catch (err: unknown) {
      setReplayError((err as Error).message || 'Replay simulation failed. Ensure NLP service is reachable.');
    } finally {
      setIsReplaying(false);
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
  const origCategory = originalPrediction?.predictedCategory || 'N/A';
  const simBaselineCategory = comparison?.baseline.predicted_category;
  const isCategoryFlipped = simBaselineCategory && simBaselineCategory !== origCategory;

  const origConf = originalPrediction?.confidence ?? 0;
  const simConf = comparison?.baseline.confidence ?? 0;
  const confDelta = comparison ? simConf - origConf : 0;

  const origMargin = originalPrediction?.margin ?? 0;
  const simMargin = comparison?.baseline.margin ?? 0;
  const marginDelta = comparison ? simMargin - origMargin : 0;

  // Provenance consistency check
  const origModelVersion = originalPrediction?.modelVersion;
  const liveModelHash = comparison?.baseline.model_version_sha256;
  const isProvenanceMatch = !origModelVersion || !liveModelHash || origModelVersion === liveModelHash;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      {/* Lab Header */}
      <div className="p-5 border-b border-slate-100 bg-linear-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-300 flex items-center justify-center">
            <Sparkles size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold tracking-tight text-white uppercase font-mono">
                CivicResolve Decision Intelligence Lab
              </h2>
              <Badge variant="default" size="sm" className="bg-teal-500/20 text-teal-200 border-teal-400/30 font-mono text-[10px]">
                FLAGSHIP SUITE
              </Badge>
            </div>
            <p className="text-[11px] text-slate-300">
              Counterfactual Case Replay &amp; Decision Consistency Workspace.
            </p>
          </div>
        </div>

        {/* Tab View Switcher */}
        <div className="inline-flex p-1 bg-slate-800/90 rounded-xl border border-slate-700/80 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('whatif')}
            className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'whatif'
                ? 'bg-teal-600 text-white font-bold shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sparkles size={13} />
            What-If Replay
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('precedents')}
            className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'precedents'
                ? 'bg-teal-600 text-white font-bold shadow-xs'
                : 'text-slate-300 hover:text-white'
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
                  <Badge variant="warning" size="sm" className="text-[10px]">
                    Stateless Simulation
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500">
                  Edit complaint details or load synthetic stress-test scenarios to evaluate model sensitivity.
                </p>
              </div>

              {/* Delta Telemetry Pill */}
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg">
                  Words: {simWordCount}{' '}
                  <span className={wordDelta > 0 ? 'text-teal-700 font-bold' : wordDelta < 0 ? 'text-rose-700 font-bold' : 'text-slate-400'}>
                    ({wordDelta >= 0 ? `+${wordDelta}` : wordDelta})
                  </span>
                </span>
                <span className="bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg">
                  Chars: {simCharCount}{' '}
                  <span className={charDelta > 0 ? 'text-teal-700 font-bold' : charDelta < 0 ? 'text-rose-700 font-bold' : 'text-slate-400'}>
                    ({charDelta >= 0 ? `+${charDelta}` : charDelta})
                  </span>
                </span>
              </div>
            </div>

            {/* Synthetic Demo Presets (visibly badged as synthetic / not saved) */}
            <div>
              <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Layers size={13} className="text-slate-400" />
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

            {/* Editable Textarea */}
            <div className="space-y-1.5">
              <textarea
                id="counterfactual-editor"
                rows={5}
                value={simulatedText}
                onChange={(e) => setSimulatedText(e.target.value)}
                placeholder="Enter counterfactual narrative to test sensitivity..."
                className="w-full text-xs font-sans rounded-xl border border-slate-300 bg-white p-3.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 shadow-2xs"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
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
                  <p className="text-[11px] text-slate-500">
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
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/80 border border-slate-300 shrink-0">
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
                    className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                      isProvenanceMatch
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-amber-50 text-amber-900 border-amber-300'
                    }`}
                  >
                    {isProvenanceMatch
                      ? 'PROVENANCE VERIFIED: Active Production Checkpoint'
                      : 'VERSION DRIFT WARNING: Model Checkpoint Changed'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Category Shift */}
                  <div className="p-2.5 bg-white border border-slate-200/80 rounded-lg">
                    <div className="text-[11px] text-slate-500 font-medium">Category Disposition</div>
                    <div className="font-bold text-slate-900 pt-1">
                      {isCategoryFlipped ? (
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
                    <div className="text-[11px] text-slate-500 font-medium">Confidence Shift</div>
                    <div className="font-bold text-slate-900 pt-1 font-mono tabular-nums">
                      {(simConf * 100).toFixed(1)}%{' '}
                      <span className={confDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                        ({confDelta >= 0 ? `+${(confDelta * 100).toFixed(1)}%` : `${(confDelta * 100).toFixed(1)}%`})
                      </span>
                    </div>
                  </div>

                  {/* Top-2 Margin Delta */}
                  <div className="p-2.5 bg-white border border-slate-200/80 rounded-lg">
                    <div className="text-[11px] text-slate-500 font-medium">Top-2 Probability Margin (P₁ - P₂)</div>
                    <div className="font-bold text-slate-900 pt-1 font-mono tabular-nums">
                      {(simMargin * 100).toFixed(1)}%{' '}
                      <span className={marginDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                        ({marginDelta >= 0 ? `+${(marginDelta * 100).toFixed(1)}%` : `${(marginDelta * 100).toFixed(1)}%`})
                      </span>
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
                        <span className="text-[10px] font-mono text-teal-800 font-semibold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                          PRODUCTION CLASSIFIER
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
                    <div className="flex justify-between font-mono pt-1 border-t border-slate-100 text-[11px]">
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
                        <span className="text-[10px] font-mono text-indigo-800 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          NEURAL BENCHMARK CHALLENGER
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
                    <div className="flex justify-between font-mono pt-1 border-t border-slate-100 text-[11px]">
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
                <div className="text-[11px] text-slate-500 border-t border-slate-200/60 pt-1.5 font-mono">
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
