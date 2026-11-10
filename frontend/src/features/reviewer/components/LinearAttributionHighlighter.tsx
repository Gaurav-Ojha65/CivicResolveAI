import React, { useState, useMemo } from 'react';
import { Eye, ShieldAlert, TrendingUp, TrendingDown } from 'lucide-react';
import { FeatureContribution } from '../../../types/grievance';

interface LinearAttributionHighlighterProps {
  narrative: string;
  topPositiveFeatures?: FeatureContribution[];
  topNegativeFeatures?: FeatureContribution[];
  topDifferenceFeatures?: FeatureContribution[];
  priorityReasons?: string[];
}

interface MatchSpan {
  start: number;
  end: number;
  text: string;
  type: 'positive' | 'negative' | 'risk';
  feature?: FeatureContribution;
  keywordReason?: string;
}

const RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(eviction|foreclosure|homeless(?:ness)?|sheriff sale|notice of sale|auction|lockout)\b/gi, reason: 'Imminent loss of shelter / Foreclosure threat' },
  { pattern: /\b(identity theft|stolen identity|drained (?:my|all|our) (?:savings|account)|life savings stolen)\b/gi, reason: 'Active identity theft / Account drainage' },
  { pattern: /\b(repossession|repossessed|tow truck|seizure)\b/gi, reason: 'Vehicle repossession' },
  { pattern: /\b(wage garnishment|freeze (?:my|our) wages|threatened (?:with )?arrest|harassing calls|threatened jail)\b/gi, reason: 'Aggressive collection / Legal threats' },
  { pattern: /\b(unauthorized (?:wire|transfer|withdrawal)|fraudulent charges?|account (?:frozen|locked))\b/gi, reason: 'Unauthorized funds transfer / Frozen account' },
  { pattern: /\b(inaccurate (?:reporting|inquiry|balance)|dispute(?:d)?|credit score dropped)\b/gi, reason: 'Credit reporting dispute' },
];

export const LinearAttributionHighlighter: React.FC<LinearAttributionHighlighterProps> = ({
  narrative,
  topPositiveFeatures = [],
  topNegativeFeatures = [],
  topDifferenceFeatures = [],
  priorityReasons = [],
}) => {
  const [showPositive, setShowPositive] = useState(true);
  const [showNegative, setShowNegative] = useState(true);
  const [showRisk, setShowRisk] = useState(true);
  const [activeTooltip, setActiveTooltip] = useState<MatchSpan | null>(null);

  // Combine positive and difference features for positive attribution
  const positiveMap = useMemo(() => {
    const map = new Map<string, FeatureContribution>();
    topPositiveFeatures.forEach((f) => map.set(f.feature.toLowerCase(), f));
    topDifferenceFeatures.forEach((f) => {
      if (!map.has(f.feature.toLowerCase())) {
        map.set(f.feature.toLowerCase(), f);
      }
    });
    return map;
  }, [topPositiveFeatures, topDifferenceFeatures]);

  const negativeMap = useMemo(() => {
    const map = new Map<string, FeatureContribution>();
    topNegativeFeatures.forEach((f) => map.set(f.feature.toLowerCase(), f));
    return map;
  }, [topNegativeFeatures]);

  // Compute non-overlapping match spans across the narrative
  const spans = useMemo(() => {
    if (!narrative) return [];

    const rawMatches: MatchSpan[] = [];

    // Helper to find word/phrase matches
    const searchTerms = (
      terms: Map<string, FeatureContribution>,
      type: 'positive' | 'negative'
    ) => {
      terms.forEach((feature, term) => {
        if (!term || term.length < 2) return;
        // Escape regex special chars
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(narrative)) !== null) {
          rawMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            type,
            feature,
          });
        }
      });
    };

    if (showPositive) {
      searchTerms(positiveMap, 'positive');
    }
    if (showNegative) {
      searchTerms(negativeMap, 'negative');
    }

    if (showRisk) {
      if (priorityReasons && priorityReasons.length > 0) {
        priorityReasons.forEach((reason) => {
          if (!reason || reason.length < 4) return;
          const words = reason.split(/\s+/).filter((w) => w.length > 5);
          words.forEach((w) => {
            const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
            let m: RegExpExecArray | null;
            while ((m = regex.exec(narrative)) !== null) {
              rawMatches.push({
                start: m.index,
                end: m.index + m[0].length,
                text: m[0],
                type: 'risk',
                keywordReason: reason,
              });
            }
          });
        });
      }

      RISK_PATTERNS.forEach(({ pattern, reason }) => {
        let match: RegExpExecArray | null;
        const localRegex = new RegExp(pattern.source, 'gi');
        while ((match = localRegex.exec(narrative)) !== null) {
          rawMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            type: 'risk',
            keywordReason: reason,
          });
        }
      });
    }

    // Sort by start position
    rawMatches.sort((a, b) => a.start - b.start || b.end - a.end);

    // Filter out overlapping spans (keep longest/earliest)
    const nonOverlapping: MatchSpan[] = [];
    let lastEnd = 0;
    for (const m of rawMatches) {
      if (m.start >= lastEnd) {
        nonOverlapping.push(m);
        lastEnd = m.end;
      }
    }

    return nonOverlapping;
  }, [narrative, positiveMap, negativeMap, showPositive, showNegative, showRisk, priorityReasons]);

  // Build rendered tokens safely without dangerouslySetInnerHTML
  const renderedContent = useMemo(() => {
    if (!narrative) return null;
    if (spans.length === 0) {
      return <span>{narrative}</span>;
    }

    const segments: React.ReactNode[] = [];
    let currentIndex = 0;

    spans.forEach((span, idx) => {
      if (span.start > currentIndex) {
        segments.push(
          <span key={`plain-${currentIndex}`}>
            {narrative.substring(currentIndex, span.start)}
          </span>
        );
      }

      let badgeClasses = '';
      if (span.type === 'positive') {
        badgeClasses = 'bg-teal-100/90 text-teal-950 border border-teal-300 font-semibold rounded px-1 py-0.5 transition-colors hover:bg-teal-200 cursor-help';
      } else if (span.type === 'negative') {
        badgeClasses = 'bg-amber-100/90 text-amber-950 border border-amber-300 font-semibold rounded px-1 py-0.5 transition-colors hover:bg-amber-200 cursor-help';
      } else {
        badgeClasses = 'bg-rose-100/90 text-rose-950 border border-rose-300 font-semibold rounded px-1 py-0.5 transition-colors hover:bg-rose-200 cursor-help';
      }

      segments.push(
        <mark
          key={`mark-${idx}-${span.start}`}
          className={badgeClasses}
          onMouseEnter={() => setActiveTooltip(span)}
          onMouseLeave={() => setActiveTooltip((curr) => (curr === span ? null : curr))}
          onClick={() => setActiveTooltip(span)}
          title={
            span.feature
              ? `${span.feature.feature} (${span.feature.contribution >= 0 ? '+' : ''}${span.feature.contribution.toFixed(4)})`
              : span.keywordReason || 'Triage risk keyword'
          }
        >
          {narrative.substring(span.start, span.end)}
        </mark>
      );

      currentIndex = span.end;
    });

    if (currentIndex < narrative.length) {
      segments.push(
        <span key={`plain-${currentIndex}`}>
          {narrative.substring(currentIndex)}
        </span>
      );
    }

    return segments;
  }, [narrative, spans]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header and Toggle Controls */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <Eye size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Contextual In-Text Attribution
            </h3>
            <p className="text-[11px] text-slate-500">
              Interactive token highlighting of model driver features and policy risk triggers.
            </p>
          </div>
        </div>

        {/* Toggle Chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setShowPositive(!showPositive)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              showPositive
                ? 'bg-teal-50 border-teal-300 text-teal-800 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
            title="Toggle positive feature attribution tokens (drivers for top predicted class)"
          >
            <span className="w-2 h-2 rounded-full bg-teal-600" />
            Positive Drivers
          </button>

          <button
            type="button"
            onClick={() => setShowNegative(!showNegative)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              showNegative
                ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
            title="Toggle negative/competing feature attribution tokens"
          >
            <span className="w-2 h-2 rounded-full bg-amber-600" />
            Negative / Competing
          </button>

          <button
            type="button"
            onClick={() => setShowRisk(!showRisk)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              showRisk
                ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
            title="Toggle policy triage risk keyword triggers"
          >
            <span className="w-2 h-2 rounded-full bg-rose-600" />
            Triage Risk Keywords
          </button>
        </div>
      </div>

      {/* Main Narrative with Highlighted Spans */}
      <div className="p-5 relative">
        <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl text-slate-900 text-xs md:text-sm leading-relaxed whitespace-pre-wrap font-sans selection:bg-teal-100 shadow-2xs">
          {renderedContent}
        </div>

        {/* Hover / Click Info Callout */}
        {activeTooltip && (
          <div className="mt-3 p-3 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-700 text-xs flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              {activeTooltip.type === 'positive' && (
                <TrendingUp size={16} className="text-teal-400 shrink-0" />
              )}
              {activeTooltip.type === 'negative' && (
                <TrendingDown size={16} className="text-amber-400 shrink-0" />
              )}
              {activeTooltip.type === 'risk' && (
                <ShieldAlert size={16} className="text-rose-400 shrink-0" />
              )}

              <div>
                <span className="font-mono font-bold text-teal-300">
                  &ldquo;{activeTooltip.text}&rdquo;
                </span>
                {activeTooltip.feature && (
                  <span className="ml-2 text-slate-300">
                    Linear Driver: {activeTooltip.feature.feature}
                  </span>
                )}
                {activeTooltip.keywordReason && (
                  <span className="ml-2 text-slate-300">
                    Trigger: {activeTooltip.keywordReason}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px]">
              {activeTooltip.feature?.tfidfValue != null && (
                <span className="text-slate-400">
                  tfidf: {activeTooltip.feature.tfidfValue.toFixed(4)}
                </span>
              )}
              {activeTooltip.feature?.contribution != null && (
                <span
                  className={`font-bold ${
                    activeTooltip.feature.contribution >= 0 ? 'text-teal-400' : 'text-amber-400'
                  }`}
                >
                  Weight: {activeTooltip.feature.contribution >= 0 ? '+' : ''}
                  {activeTooltip.feature.contribution.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
