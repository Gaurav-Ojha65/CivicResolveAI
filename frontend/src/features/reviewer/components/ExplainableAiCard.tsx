import React, { useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  Scale,
  Cpu,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { PredictionSummary, FeatureContribution } from '../../../types/grievance';
import { Badge } from '../../../components/ui/Badge';

interface ExplainableAiCardProps {
  prediction: PredictionSummary | null | undefined;
}

/**
 * FeatureBarItem — renders a single feature attribution token with horizontal bi-directional bar.
 */
const FeatureBarItem: React.FC<{
  item: FeatureContribution;
  type: 'positive' | 'negative' | 'diff';
  maxAbsContrib: number;
}> = ({ item, type, maxAbsContrib }) => {
  const isPositive = item.contribution >= 0;
  const hasTfidf = typeof item.tfidfValue === 'number' && !isNaN(item.tfidfValue);
  const hasCoef = typeof item.coefficient === 'number' && !isNaN(item.coefficient);
  const ratio = maxAbsContrib > 0 ? Math.min(100, Math.round((Math.abs(item.contribution) / maxAbsContrib) * 100)) : 50;

  return (
    <div className="py-2 px-3 rounded-xl bg-surface border border-border shadow-2xs space-y-1.5 transition-colors hover:border-slate-300">
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 truncate pr-2">
          {type === 'positive' ? (
            <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-700 flex items-center justify-center shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          ) : type === 'negative' ? (
            <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-700 flex items-center justify-center shrink-0">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-md bg-teal-500/10 text-teal-700 flex items-center justify-center shrink-0">
              <Scale className="w-3.5 h-3.5" />
            </div>
          )}
          <span className="font-bold text-ink-deep truncate">{item.feature}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-ink-muted">
          {hasTfidf && (
            <span className="text-[11px] bg-canvas px-1.5 py-0.5 rounded border border-border/80" title={`TF-IDF: ${item.tfidfValue!.toFixed(4)}`}>
              tf-idf: {item.tfidfValue!.toFixed(3)}
            </span>
          )}
          <span
            className={`font-bold font-mono ${
              isPositive ? 'text-semantic-success-fg' : 'text-semantic-danger-fg'
            }`}
            title={
              hasCoef
                ? `Coefficient: ${item.coefficient!.toFixed(4)}`
                : `Contribution: ${item.contribution.toFixed(4)}`
            }
          >
            {item.contribution > 0 ? '+' : ''}
            {item.contribution.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Horizontal bi-directional attribution visual bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isPositive ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
          style={{ width: `${ratio}%` }}
        />
      </div>
    </div>
  );
};

export const ExplainableAiCard: React.FC<ExplainableAiCardProps> = ({ prediction }) => {
  const [showAllProbabilities, setShowAllProbabilities] = useState(false);
  const [showExplanationDetails, setShowExplanationDetails] = useState(true);

  if (!prediction) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-card">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-teal-trust/10 text-teal-trust flex items-center justify-center">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink-deep">AI Triage & Prediction Analysis</h2>
            <p className="text-[11px] text-ink-muted">Automated multi-class classification and rule evaluation.</p>
          </div>
        </div>
        <div className="text-xs text-ink-muted p-8 text-center bg-canvas rounded-xl mt-4 border border-border">
          No automated prediction audit record is attached to this complaint.
        </div>
      </div>
    );
  }

  // Sorted probability entries
  const sortedProbabilities = prediction.probabilities
    ? Object.entries(prediction.probabilities).sort(([, a], [, b]) => b - a)
    : [];

  const displayedProbabilities = showAllProbabilities
    ? sortedProbabilities
    : sortedProbabilities.slice(0, 5);

  const explanation = prediction.explanation;

  // Compute max absolute contribution for proportionate bar scaling
  const allContribs: number[] = [];
  if (explanation?.topPositiveFeatures) {
    explanation.topPositiveFeatures.forEach((f) => allContribs.push(Math.abs(f.contribution)));
  }
  if (explanation?.topNegativeFeatures) {
    explanation.topNegativeFeatures.forEach((f) => allContribs.push(Math.abs(f.contribution)));
  }
  const maxAbsContrib = allContribs.length > 0 ? Math.max(...allContribs) : 1;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-border flex items-center justify-between bg-canvas/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-trust/10 text-teal-trust flex items-center justify-center">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink-deep font-sans">
              AI Triage & Prediction Analysis
            </h2>
            <p className="text-[11px] text-ink-muted">
              Automated multi-class classification and rule evaluation.
            </p>
          </div>
        </div>
        <Badge variant={prediction.flagForReview ? 'warning' : 'success'} size="sm">
          {prediction.flagForReview ? 'Flagged for Human Review' : 'Auto-routed'}
        </Badge>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Key Metrics Grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-canvas rounded-xl border border-border shadow-2xs">
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
              Predicted Category
            </span>
            <span
              className="text-xs font-bold text-ink-deep mt-1 block truncate"
              title={prediction.predictedCategory}
            >
              {prediction.predictedCategory}
            </span>
          </div>

          <div className="p-4 bg-canvas rounded-xl border border-border shadow-2xs">
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
              Confidence
            </span>
            <span className="text-lg font-extrabold text-teal-trust mt-1 block font-mono">
              {(prediction.confidence * 100).toFixed(1)}%
            </span>
          </div>

          <div className="p-4 bg-canvas rounded-xl border border-border shadow-2xs">
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
              Margin
            </span>
            <span className="text-lg font-extrabold text-ink-deep mt-1 block font-mono">
              {(prediction.margin * 100).toFixed(1)}%
            </span>
          </div>

          <div className="p-4 bg-canvas rounded-xl border border-border shadow-2xs">
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block">
              Model Version
            </span>
            <span
              className="text-xs font-bold text-ink-deep mt-1 block font-mono truncate"
              title={`${prediction.modelUsed} (${prediction.modelVersion})`}
            >
              {prediction.modelVersion}
            </span>
          </div>
        </div>

        {/* ── Review Flags & Priority Reasons ─────────────────────────────────── */}
        {(prediction.reviewReasons.length > 0 || prediction.priorityReasons.length > 0) && (
          <div className="space-y-3 pt-1">
            {prediction.reviewReasons.length > 0 && (
              <div>
                <span className="text-xs font-bold text-ink-deep block mb-1.5">
                  Review Flags Triggered:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {prediction.reviewReasons.map((reason, idx) => (
                    <Badge key={idx} variant="warning" size="sm">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {prediction.priorityReasons.length > 0 && (
              <div>
                <span className="text-xs font-bold text-ink-deep block mb-1.5">
                  Priority Assessment Rationale:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {prediction.priorityReasons.map((reason, idx) => (
                    <Badge key={idx} variant="info" size="sm">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Sentiment and Triage Alignment ──────────────────────────────────── */}
        {(prediction.sentimentLabel || prediction.sentimentScore !== null) && (
          <div className="p-3.5 bg-canvas/70 rounded-xl border border-border flex items-center justify-between text-xs">
            <span className="font-semibold text-ink-muted">Sentiment Analysis:</span>
            <div className="flex items-center gap-2">
              {prediction.sentimentLabel && (
                <Badge
                  variant={
                    prediction.sentimentLabel === 'NEGATIVE'
                      ? 'danger'
                      : prediction.sentimentLabel === 'POSITIVE'
                      ? 'success'
                      : 'default'
                  }
                  size="sm"
                >
                  {prediction.sentimentLabel}
                </Badge>
              )}
              {prediction.sentimentScore !== null && (
                <span className="font-mono text-ink-muted text-xs font-medium">
                  Score: {prediction.sentimentScore.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Category Probability Distribution ───────────────────────────────── */}
        {sortedProbabilities.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-deep block">
                Category Probability Distribution:
              </span>
              {sortedProbabilities.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllProbabilities((prev) => !prev)}
                  className="text-xs font-semibold text-teal-trust hover:underline flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                >
                  {showAllProbabilities
                    ? 'Show Top 5 Only'
                    : `Show All (${sortedProbabilities.length})`}
                  {showAllProbabilities ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {displayedProbabilities.map(([cat, prob]) => {
                const pct = Math.round(prob * 100);
                const isTop = cat === prediction.predictedCategory;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={isTop ? 'font-bold text-ink-deep' : 'text-ink-muted font-medium'}>
                        {cat}
                      </span>
                      <span className="font-mono text-ink-muted font-bold">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-canvas rounded-full overflow-hidden border border-border/50">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isTop ? 'bg-teal-trust' : 'bg-slate-300'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Explainable AI (XAI) Attribution Container ───────────────────────── */}
        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-teal-trust" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-deep">
                Linear Feature Attribution & Decision Score
              </h3>
            </div>
            {explanation && (
              <button
                type="button"
                onClick={() => setShowExplanationDetails((prev) => !prev)}
                className="text-xs text-ink-muted hover:text-ink-deep flex items-center gap-1"
                aria-label={showExplanationDetails ? 'Collapse XAI details' : 'Expand XAI details'}
              >
                {showExplanationDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>

          {explanation ? (
            showExplanationDetails && (
              <div className="space-y-4">
                {/* Decision Score Metrics Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 text-xs font-mono shadow-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Predicted Score</span>
                    <span className="font-bold text-teal-300 text-sm">
                      {explanation.predictedDecisionScore.toFixed(4)}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">
                      (b₀={explanation.predictedIntercept.toFixed(3)})
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Runner-up Score</span>
                    <span className="font-bold text-slate-200 text-sm">
                      {explanation.runnerUpDecisionScore.toFixed(4)}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1 truncate block sm:inline" title={explanation.runnerUpClass}>
                      ({explanation.runnerUpClass})
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Score Margin</span>
                    <span className="font-bold text-teal-400 text-sm">
                      {explanation.decisionScoreMargin.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Top Positive Features */}
                {explanation.topPositiveFeatures && explanation.topPositiveFeatures.length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-semantic-success-fg flex items-center gap-1.5 mb-2">
                      <TrendingUp size={14} />
                      Top Features Supporting {explanation.predictedClass}:
                    </span>
                    <div className="space-y-2">
                      {explanation.topPositiveFeatures.map((item, idx) => (
                        <FeatureBarItem
                          key={`pos-${idx}`}
                          item={item}
                          type="positive"
                          maxAbsContrib={maxAbsContrib}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Negative Features */}
                {explanation.topNegativeFeatures && explanation.topNegativeFeatures.length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-semantic-danger-fg flex items-center gap-1.5 mb-2">
                      <TrendingDown size={14} />
                      Top Features Opposing {explanation.predictedClass}:
                    </span>
                    <div className="space-y-2">
                      {explanation.topNegativeFeatures.map((item, idx) => (
                        <FeatureBarItem
                          key={`neg-${idx}`}
                          item={item}
                          type="negative"
                          maxAbsContrib={maxAbsContrib}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Provenance Badge */}
                {explanation.modelProvenanceSha256 && (
                  <div className="pt-2 flex items-center justify-between text-[11px] text-ink-muted font-mono bg-canvas p-2.5 rounded-lg border border-border">
                    <span className="flex items-center gap-1.5 font-bold text-ink-deep">
                      <Cpu size={13} className="text-teal-trust" /> Model Artifact SHA-256:
                    </span>
                    <span className="truncate max-w-[220px] text-teal-trust font-semibold" title={explanation.modelProvenanceSha256}>
                      {explanation.modelProvenanceSha256.substring(0, 16)}…
                    </span>
                  </div>
                )}
              </div>
            )
          ) : (
            /* Graceful Empty State */
            <div className="p-4 rounded-xl bg-canvas border border-border/80 text-xs text-ink-muted space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-ink-deep">
                <Info size={14} className="text-teal-trust" />
                <span>Explainable AI Attribution (Ready for Stage 4)</span>
              </div>
              <p className="leading-relaxed">
                Linear TF-IDF feature contribution vectors and decision boundary score decomposition will be attached here upon Stage 4 backend persistence rollout.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
