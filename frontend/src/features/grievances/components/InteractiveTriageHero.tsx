/**
 * InteractiveTriageHero.tsx
 *
 * Dark-ink fintech hero banner for the CivicResolve AI public intake page.
 * Displays platform telemetry badges and an interactive Live Triage Engine
 * Preview card with 3 selectable scenario tabs showing linear attribution
 * token highlighting, probability bars, decision margin, and load-to-form action.
 *
 * Design: Tremor/Shadcn enterprise dark card, crisp 1px border (#1E293B / border-slate-800),
 * 12-column responsive layout (5-span narrative & telemetry, 7-span live preview).
 * Zero backend calls — all data is static demo payload.
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Cpu,
  FlaskConical,
  Hash,
  TrendingUp,
  ChevronRight,
  Zap,
} from 'lucide-react';

// ── Telemetry badge data ────────────────────────────────────────────────────
const TELEMETRY_BADGES = [
  { icon: <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />, label: '8 CFPB Divisions' },
  { icon: <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />, label: '0.7488 Test Macro-F1' },
  { icon: <Cpu className="w-3.5 h-3.5" aria-hidden="true" />, label: '0.55 / 0.15 Safety Gates' },
  { icon: <Hash className="w-3.5 h-3.5" aria-hidden="true" />, label: 'Salted SHA-256 Tracking' },
];

// ── Token colour semantics ──────────────────────────────────────────────────
type TokenType = 'positive' | 'competing' | 'trigger';

interface AttributionToken {
  word: string;
  weight: number; // absolute weight (0–1 scale)
  type: TokenType;
}

interface TriageScenario {
  id: string;
  label: string;
  topCategory: string;
  topProb: number;
  runnerUp: string;
  runnerUpProb: number;
  margin: number;
  tokens: AttributionToken[];
  policyTrigger: string;
  narrativePresetId: string; // matches DEMO_PRESETS id in SubmitGrievancePage
}

// ── Static scenario data ────────────────────────────────────────────────────
const SCENARIOS: TriageScenario[] = [
  {
    id: 'foreclosure',
    label: 'Critical Mortgage',
    topCategory: 'Mortgage',
    topProb: 0.891,
    runnerUp: 'Money transfer / service',
    runnerUpProb: 0.063,
    margin: 0.828,
    policyTrigger: 'CRITICAL_PRIORITY_POLICY: foreclosure + eviction',
    tokens: [
      { word: 'foreclosure', weight: 0.94, type: 'positive' },
      { word: 'wrongfully', weight: 0.81, type: 'positive' },
      { word: 'sheriff', weight: 0.76, type: 'trigger' },
      { word: 'eviction', weight: 0.72, type: 'trigger' },
      { word: 'loan modification', weight: 0.68, type: 'positive' },
      { word: 'wire transfers', weight: 0.44, type: 'competing' },
      { word: 'escrow', weight: 0.39, type: 'competing' },
    ],
    narrativePresetId: 'foreclosure',
  },
  {
    id: 'debt-card',
    label: 'Ambiguous Dual-Class',
    topCategory: 'Debt collection',
    topProb: 0.512,
    runnerUp: 'Credit card or prepaid card',
    runnerUpProb: 0.381,
    margin: 0.131,
    policyTrigger: 'SMALL_MARGIN: dual-class ambiguity < 0.15',
    tokens: [
      { word: 'collection agency', weight: 0.88, type: 'positive' },
      { word: 'harassing', weight: 0.74, type: 'positive' },
      { word: 'debt validation', weight: 0.69, type: 'positive' },
      { word: 'credit card', weight: 0.65, type: 'competing' },
      { word: 'charged off', weight: 0.58, type: 'competing' },
      { word: 'credit bureaus', weight: 0.52, type: 'competing' },
      { word: 'derogatory', weight: 0.47, type: 'trigger' },
    ],
    narrativePresetId: 'debt-card',
  },
  {
    id: 'credit-report',
    label: 'Credit Reporting',
    topCategory: 'Credit reporting',
    topProb: 0.934,
    runnerUp: 'Debt collection',
    runnerUpProb: 0.041,
    margin: 0.893,
    policyTrigger: 'AUTO_ROUTED: confidence > 0.90 & margin > 0.55',
    tokens: [
      { word: 'credit reports', weight: 0.92, type: 'positive' },
      { word: 'delinquent', weight: 0.85, type: 'positive' },
      { word: 'inaccurate', weight: 0.79, type: 'positive' },
      { word: 'lien release', weight: 0.73, type: 'positive' },
      { word: 'disputes', weight: 0.68, type: 'positive' },
      { word: 'vehicle auto loan', weight: 0.41, type: 'competing' },
      { word: 'delete', weight: 0.35, type: 'competing' },
    ],
    narrativePresetId: 'credit-report',
  },
];

const TOKEN_STYLES: Record<TokenType, string> = {
  positive: 'bg-teal-500/20 text-teal-200 border border-teal-500/40',
  competing: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
  trigger:   'bg-rose-500/20  text-rose-200  border border-rose-500/40',
};

const TOKEN_LABEL: Record<TokenType, string> = {
  positive: 'Positive attribution',
  competing: 'Competing signal',
  trigger: 'Policy trigger',
};

// ── Component ───────────────────────────────────────────────────────────────
interface InteractiveTriageHeroProps {
  /** Called when user clicks "Load into Intake Form" for a scenario. */
  onLoadScenario: (presetId: string) => void;
}

export const InteractiveTriageHero: React.FC<InteractiveTriageHeroProps> = ({
  onLoadScenario,
}) => {
  const [activeId, setActiveId] = useState<string>(SCENARIOS[0]!.id);
  // Always defined: fallback to first element ensures non-undefined
  const active: TriageScenario = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0]!;

  return (
    <section
      aria-label="Live Triage Engine Preview"
      className="rounded-2xl border border-slate-800 bg-[#0F172A] p-6 sm:p-8 lg:p-10 shadow-sm w-full"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* ── Left Column: Intro, Title, Telemetry Badges, Footnote (5 cols) ── */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-400/10 border border-teal-400/30 text-teal-300 text-[10px] font-bold tracking-widest uppercase mb-3">
              <Zap className="w-3 h-3 text-teal-400" aria-hidden="true" />
              CivicResolve AI
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-sans leading-tight">
              AI-Powered CFPB Complaint Triage
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-slate-400 leading-relaxed">
              Every submission is instantly classified by our NLP pipeline with linear attribution
              explainability and multi-gate safety controls before human reviewer adjudication.
            </p>
          </div>

          {/* Telemetry badges */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
              Platform Architecture Telemetry
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TELEMETRY_BADGES.map((badge) => (
                <span
                  key={badge.label}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 text-[11px] font-semibold font-mono"
                >
                  <span className="text-teal-400">{badge.icon}</span>
                  {badge.label}
                </span>
              ))}
            </div>
          </div>

          {/* Disclaimer Footnote */}
          <div className="pt-4 border-t border-slate-800/80 flex items-start gap-2 text-slate-500 text-[11px] leading-relaxed">
            <FlaskConical className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              Model trained on CFPB public complaint dataset. F1 scores measured on held-out test split.
              Probabilities are uncalibrated decision-function scores, not calibrated posteriors.
              All routing decisions are subject to human reviewer adjudication before any final determination.
            </p>
          </div>
        </div>

        {/* ── Right Column: Interactive Live Preview Card (7 cols) ─────────── */}
        <div className="lg:col-span-7">
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-5 sm:p-6 shadow-inner space-y-5">
            {/* Live Triage Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-3 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                Live Triage Engine Preview
              </span>
              <span className="text-[10px] text-slate-400">
                Probabilities are uncalibrated estimates • Preliminary AI assessment only
              </span>
            </div>

            {/* Scenario tab strip */}
            <div
              role="tablist"
              aria-label="Triage scenario selector"
              className="flex gap-2 flex-wrap"
            >
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === activeId}
                  aria-controls={`triage-panel-${s.id}`}
                  id={`triage-tab-${s.id}`}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400',
                    s.id === activeId
                      ? 'bg-teal-500/20 border border-teal-400/50 text-teal-200'
                      : 'bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800',
                  ].join(' ')}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div
              id={`triage-panel-${active.id}`}
              role="tabpanel"
              aria-labelledby={`triage-tab-${active.id}`}
              className="space-y-5"
            >
              {/* Token attribution display */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Linear Attribution Tokens
                </p>
                <div className="flex flex-wrap gap-2" aria-label="Attribution tokens">
                  {active.tokens.map((tok) => (
                    <span
                      key={tok.word}
                      title={`${TOKEN_LABEL[tok.type]} • weight ${tok.weight.toFixed(2)}`}
                      className={[
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold font-mono',
                        TOKEN_STYLES[tok.type],
                      ].join(' ')}
                    >
                      {tok.word}
                      <span className="opacity-70 text-[9px] tabular-nums">{tok.weight.toFixed(2)}</span>
                    </span>
                  ))}
                </div>
                {/* Legend */}
                <div className="mt-2.5 flex flex-wrap gap-3 text-[10px]">
                  <span className="flex items-center gap-1.5 text-teal-300">
                    <span className="w-2 h-2 rounded-sm bg-teal-500/40 border border-teal-500/60 inline-block" />
                    Positive (Teal)
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <span className="w-2 h-2 rounded-sm bg-amber-500/40 border border-amber-500/60 inline-block" />
                    Competing (Amber)
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-300">
                    <span className="w-2 h-2 rounded-sm bg-rose-500/40 border border-rose-500/60 inline-block" />
                    Policy Trigger (Rose)
                  </span>
                </div>
              </div>

              {/* Probability bars */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Classification Probability
                  <span className="ml-1.5 text-slate-500 font-normal normal-case">(uncalibrated estimate)</span>
                </p>
                <div className="space-y-2.5">
                  {/* Top-1 */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-teal-300 font-semibold truncate max-w-[55%]">
                        Top-1: {active.topCategory}
                      </span>
                      <span className="text-teal-200 font-mono font-bold tabular-nums">
                        {(active.topProb * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-500"
                        style={{ width: `${active.topProb * 100}%` }}
                        role="progressbar"
                        aria-valuenow={Math.round(active.topProb * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${active.topCategory} probability`}
                      />
                    </div>
                  </div>
                  {/* Runner-up */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-amber-300 font-semibold truncate max-w-[55%]">
                        Runner-up: {active.runnerUp}
                      </span>
                      <span className="text-amber-200 font-mono font-bold tabular-nums">
                        {(active.runnerUpProb * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
                        style={{ width: `${active.runnerUpProb * 100}%` }}
                        role="progressbar"
                        aria-valuenow={Math.round(active.runnerUpProb * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${active.runnerUp} runner-up probability`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Decision margin + policy trigger */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                    Decision Margin
                  </p>
                  <p className={[
                    'text-lg font-extrabold font-mono tabular-nums',
                    active.margin < 0.2 ? 'text-amber-300' : 'text-teal-300',
                  ].join(' ')}>
                    {active.margin.toFixed(3)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {active.margin < 0.2 ? '⚠ Narrow — flags for human review' : '✓ Clear — eligible for auto-route'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40">
                  <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-1">
                    Active Policy Gate
                  </p>
                  <p className="text-[11px] text-rose-200 font-mono leading-relaxed">
                    {active.policyTrigger}
                  </p>
                </div>
              </div>

              {/* Load scenario CTA */}
              <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onLoadScenario(active.narrativePresetId)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F766E] text-white hover:bg-teal-700 text-xs font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400 shadow-sm"
                  aria-label={`Load ${active.label} scenario into the intake form below`}
                >
                  Load "{active.label}" into Intake Form
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span className="text-[10px] text-slate-500">
                  Instant narrative population
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
