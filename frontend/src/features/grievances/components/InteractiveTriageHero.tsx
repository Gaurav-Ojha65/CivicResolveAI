/**
 * InteractiveTriageHero.tsx
 *
 * Dark-ink fintech showcase banner for the CivicResolve AI public intake page.
 * Displays platform telemetry badges and an interactive Sample Triage Engine
 * Preview card with 3 selectable scenario tabs showing linear attribution
 * token highlighting, probability bars, decision margin, and load-to-form action.
 *
 * Design: Tremor/Shadcn enterprise dark card, crisp 1px border (#1E293B / border-slate-800),
 * 12-column responsive layout (5-span narrative & telemetry, 7-span sample preview).
 * Accessible role="tablist" with Arrow/Home/End keyboard navigation.
 * Floor font size of 12px (text-xs) with WCAG AAA compliant text contrast.
 */

import React, { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
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
  { icon: <ShieldCheck className="w-4 h-4" aria-hidden="true" />, label: '8 CFPB Divisions' },
  { icon: <TrendingUp className="w-4 h-4" aria-hidden="true" />, label: '0.7488 Test Macro-F1' },
  { icon: <Cpu className="w-4 h-4" aria-hidden="true" />, label: '0.55 / 0.15 Safety Gates' },
  { icon: <Hash className="w-4 h-4" aria-hidden="true" />, label: 'Salted SHA-256 Tracking' },
];

// ── Token colour semantics & non-color glyphs ──────────────────────────────
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

// ── Static scenario data with calibrated model outputs ──────────────────────
const SCENARIOS: TriageScenario[] = [
  {
    id: 'foreclosure',
    label: 'Critical Mortgage',
    topCategory: 'Mortgage',
    topProb: 0.891,
    runnerUp: 'Money transfer / service',
    runnerUpProb: 0.063,
    margin: 0.828,
    policyTrigger: 'CRITICAL_PRIORITY_POLICY: foreclosure + eviction threat',
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
    policyTrigger: 'SMALL_MARGIN: dual-class ambiguity < 0.15 margin',
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
  positive: 'bg-teal-500/25 text-teal-200 border border-teal-400/50',
  competing: 'bg-amber-500/25 text-amber-200 border border-amber-400/50',
  trigger:   'bg-rose-500/25  text-rose-200  border border-rose-400/50',
};

const TOKEN_GLYPH: Record<TokenType, string> = {
  positive: '+',
  competing: '~',
  trigger: '⚠',
};

const TOKEN_LABEL: Record<TokenType, string> = {
  positive: 'Positive attribution driver',
  competing: 'Competing class signal',
  trigger: 'Policy safety gate trigger',
};

const tokenListVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const tokenItemVariants: Variants = {
  hidden: { opacity: 0, y: 4, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
  },
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
  const active: TriageScenario = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0]!;

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % SCENARIOS.length;
      setActiveId(SCENARIOS[nextIndex]!.id);
      document.getElementById(`triage-tab-${SCENARIOS[nextIndex]!.id}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + SCENARIOS.length) % SCENARIOS.length;
      setActiveId(SCENARIOS[prevIndex]!.id);
      document.getElementById(`triage-tab-${SCENARIOS[prevIndex]!.id}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveId(SCENARIOS[0]!.id);
      document.getElementById(`triage-tab-${SCENARIOS[0]!.id}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveId(SCENARIOS[SCENARIOS.length - 1]!.id);
      document.getElementById(`triage-tab-${SCENARIOS[SCENARIOS.length - 1]!.id}`)?.focus();
    }
  };

  return (
    <section
      aria-label="Live Triage Engine Preview"
      className="rounded-2xl border border-slate-800 bg-[#0F172A] p-6 sm:p-8 lg:p-10 shadow-sm w-full text-slate-100"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* ── Left Column: Intro, Title, Telemetry Badges, Footnote (5 cols) ── */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-400/10 border border-teal-400/30 text-teal-300 text-xs font-bold tracking-wider uppercase mb-3">
              <Zap className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
              CivicResolve AI Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-sans leading-tight">
              AI-Powered CFPB Complaint Triage
            </h2>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Every submission is classified by our linear TF-IDF and deep sequence pipeline with
              mathematical feature attribution and multi-gate safety policies before human reviewer adjudication.
            </p>
          </div>

          {/* Telemetry badges */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Platform Architecture Telemetry
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TELEMETRY_BADGES.map((badge) => (
                <div
                  key={badge.label}
                  className="flex flex-col p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs font-semibold font-mono shadow-xs"
                >
                  <div className="flex items-center gap-2 text-teal-300">
                    <span>{badge.icon}</span>
                    <span>{badge.label}</span>
                  </div>
                  {badge.label.includes('Test Macro-F1') && (
                    <span className="text-[11px] text-slate-400 font-sans mt-0.5">
                      Held-out test split (0.7453 validation)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer Footnote */}
          <div className="pt-4 border-t border-slate-800 flex items-start gap-2.5 text-slate-300 text-xs leading-relaxed">
            <FlaskConical className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              Trained on CFPB public complaint records. Macro-F1 scores measured on held-out test splits.
              Sample decision function outputs reflect linear weights; all production decisions require reviewer sign-off.
            </p>
          </div>
        </div>

        {/* ── Right Column: Interactive Sample Preview Card (7 cols) ─────────── */}
        <div className="lg:col-span-7">
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-5 sm:p-6 shadow-inner space-y-5">
            {/* Header: Honest labeling */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Interactive Sample Preview • Calibrated Output
                </span>
              </div>
              <span className="text-xs text-slate-400">
                Probabilities are uncalibrated estimates • Preliminary AI assessment only
              </span>
            </div>

            {/* Scenario tab strip with keyboard navigation */}
            <div
              role="tablist"
              aria-label="Triage scenario selector"
              className="flex gap-2 flex-wrap"
            >
              {SCENARIOS.map((s, index) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === activeId}
                  aria-controls={`triage-panel-${s.id}`}
                  id={`triage-tab-${s.id}`}
                  type="button"
                  tabIndex={s.id === activeId ? 0 : -1}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onClick={() => setActiveId(s.id)}
                  className={[
                    'px-3.5 py-2 rounded-lg text-xs font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400',
                    s.id === activeId
                      ? 'bg-teal-500/25 border border-teal-400 text-white shadow-xs'
                      : 'bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800',
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
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                  Linear Attribution Tokens (Top-7 Feature Drivers)
                </p>
                <motion.div
                  key={active.id}
                  variants={tokenListVariants}
                  initial="hidden"
                  animate="show"
                  className="flex flex-wrap gap-2"
                  aria-label="Attribution tokens"
                >
                  {active.tokens.map((tok) => (
                    <motion.span
                      key={tok.word}
                      variants={tokenItemVariants}
                      title={`${TOKEN_LABEL[tok.type]} • weight ${tok.weight.toFixed(2)}`}
                      className={[
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold font-mono',
                        TOKEN_STYLES[tok.type],
                      ].join(' ')}
                    >
                      <span className="font-sans font-bold" aria-hidden="true">{TOKEN_GLYPH[tok.type]}</span>
                      <span>{tok.word}</span>
                      <span className="opacity-80 text-xs tabular-nums">+{tok.weight.toFixed(2)}</span>
                    </motion.span>
                  ))}
                </motion.div>

                {/* Accessible Legend with non-color glyphs */}
                <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-teal-300">
                    <span className="font-bold text-teal-400" aria-hidden="true">+</span>
                    <span>Positive Attribution (Teal)</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <span className="font-bold text-amber-400" aria-hidden="true">~</span>
                    <span>Competing Signal (Amber)</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-300">
                    <span className="font-bold text-rose-400" aria-hidden="true">⚠</span>
                    <span>Policy Trigger (Rose)</span>
                  </span>
                </div>
              </div>

              {/* Probability bars */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Classification Probability
                  <span className="ml-2 text-slate-400 font-normal normal-case">(uncalibrated decision score)</span>
                </p>
                <div className="space-y-3">
                  {/* Top-1 */}
                  <div>
                    <div className="flex justify-between text-xs mb-1 font-semibold">
                      <span className="text-teal-300 truncate max-w-[60%]">
                        Top-1: {active.topCategory}
                      </span>
                      <span className="text-teal-200 font-mono font-bold tabular-nums">
                        {(active.topProb * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700/50">
                      <motion.div
                        className="h-full rounded-full bg-linear-to-r from-teal-500 to-teal-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${active.topProb * 100}%` }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
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
                    <div className="flex justify-between text-xs mb-1 font-semibold">
                      <span className="text-amber-300 truncate max-w-[60%]">
                        Runner-up: {active.runnerUp}
                      </span>
                      <span className="text-amber-200 font-mono font-bold tabular-nums">
                        {(active.runnerUpProb * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700/50">
                      <motion.div
                        className="h-full rounded-full bg-linear-to-r from-amber-600 to-amber-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${active.runnerUpProb * 100}%` }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700">
                  <p className="text-xs text-slate-300 font-bold uppercase tracking-wider mb-1">
                    Decision Margin
                  </p>
                  <p className={[
                    'text-xl font-extrabold font-mono tabular-nums',
                    active.margin < 0.2 ? 'text-amber-300' : 'text-teal-300',
                  ].join(' ')}>
                    {active.margin.toFixed(3)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {active.margin < 0.2 ? '⚠ Narrow (<0.15) — flags for human review' : '✓ Clear (≥0.15) — eligible for auto-route'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-700/60">
                  <p className="text-xs text-rose-300 font-bold uppercase tracking-wider mb-1">
                    Active Policy Gate
                  </p>
                  <p className="text-xs text-rose-200 font-mono leading-relaxed mt-1">
                    {active.policyTrigger}
                  </p>
                </div>
              </div>

              {/* Load scenario CTA */}
              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onLoadScenario(active.narrativePresetId)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0F766E] text-white hover:bg-teal-700 text-xs font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400 shadow-sm cursor-pointer"
                  aria-label={`Load ${active.label} scenario into the intake form below`}
                >
                  Load "{active.label}" into Intake Form
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="text-xs text-slate-400">
                  Loads representative narrative into form above
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
