import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowRight,
  FileText,
  Cpu,
  Users,
  Lock,
  Eye,
  AlertCircle,
  Menu,
  X,
  Scale,
  Sparkles,
  CheckCircle2,
  Fingerprint,
  Shield,
  Layers,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface DemoScenario {
  id: string;
  tabLabel: string;
  category: string;
  confidence: number;
  margin: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  highlightedWords: string[];
  features: { feature: string; contribution: number; direction: 'pos' | 'neg' }[];
  routeReason: string;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'credit-reporting',
    tabLabel: 'Credit Dispute',
    category: 'Credit reporting, repair, or other',
    confidence: 96.4,
    margin: 88.2,
    priority: 'HIGH',
    description:
      'I submitted an official dispute to Equifax regarding an erroneous debt collection tradeline of $1,840 that does not belong to me. Over 35 days have passed without the required investigation results or consumer disclosure, causing severe credit score reduction.',
    highlightedWords: ['equifax', 'dispute', 'tradeline', 'investigation', 'debt', 'erroneous'],
    features: [
      { feature: 'dispute', contribution: 0.384, direction: 'pos' },
      { feature: 'tradeline', contribution: 0.312, direction: 'pos' },
      { feature: 'equifax', contribution: 0.287, direction: 'pos' },
      { feature: 'score reduction', contribution: 0.194, direction: 'pos' },
    ],
    routeReason: 'Flagged for FCRA 30-day investigation statutory violation review',
  },
  {
    id: 'banking-overdraft',
    tabLabel: 'Unauthorized Fee',
    category: 'Checking or savings account',
    confidence: 94.1,
    margin: 81.5,
    priority: 'MEDIUM',
    description:
      'My bank reordered debits from largest to smallest overnight, creating three sequential $35 overdraft fees on settled transactions while my available ledger balance remained positive throughout the settlement cycle.',
    highlightedWords: ['bank', 'overdraft', 'fees', 'ledger', 'balance', 'debits'],
    features: [
      { feature: 'overdraft', contribution: 0.421, direction: 'pos' },
      { feature: 'fees', contribution: 0.305, direction: 'pos' },
      { feature: 'ledger balance', contribution: 0.264, direction: 'pos' },
      { feature: 'settlement', contribution: 0.182, direction: 'pos' },
    ],
    routeReason: 'Automated fee reordering violation detection with account audit',
  },
  {
    id: 'mortgage-servicing',
    tabLabel: 'Escrow Shortfall',
    category: 'Mortgage',
    confidence: 97.8,
    margin: 91.0,
    priority: 'CRITICAL',
    description:
      'Loan servicer abruptly increased my monthly escrow payment by $640 without issuing the required annual escrow analysis statement. They threaten foreclosure proceedings despite verified automatic mortgage payments.',
    highlightedWords: ['servicer', 'escrow', 'mortgage', 'foreclosure', 'statement'],
    features: [
      { feature: 'escrow', contribution: 0.458, direction: 'pos' },
      { feature: 'servicer', contribution: 0.379, direction: 'pos' },
      { feature: 'foreclosure', contribution: 0.341, direction: 'pos' },
      { feature: 'mortgage', contribution: 0.295, direction: 'pos' },
    ],
    routeReason: 'Critical foreclosure exposure flagged for expedited human adjudication',
  },
];

/**
 * LandingPage — high-trust, fintech-grade public front door for CivicResolve AI.
 *
 * Visual System & Structure:
 * 1. Precision navigation bar with brand mark, route anchors, and CTA
 * 2. High-impact editorial Hero with live interactive grievance triage simulator
 * 3. 3-step lifecycle pipeline with connected step cards and micro-indicators
 * 4. Asymmetric bento-grid value proposition with technical proofs
 * 5. Transparent AI compliance card with mathematical disclosure
 * 6. High-trust privacy & credential security matrix
 * 7. Comprehensive dark navy footer with legal disclaimers and navigation
 */
export const LandingPage: React.FC = () => {
  const defaultScenario: DemoScenario = DEMO_SCENARIOS[0]!;
  const [navOpen, setNavOpen] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState(defaultScenario.id);

  const activeScenario: DemoScenario =
    DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) ?? defaultScenario;

  return (
    <>
      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <nav
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-18"
          aria-label="Main navigation"
        >
          {/* Brand mark */}
          <Link
            to="/"
            className="flex items-center gap-3 text-ink-deep font-semibold text-lg tracking-tight hover:text-teal-trust transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded-lg py-1 px-1.5 -ml-1.5"
            aria-label="CivicResolve AI — home"
          >
            <div className="w-9 h-9 rounded-xl bg-ink-deep flex items-center justify-center text-teal-trust shadow-sm border border-slate-700/60">
              <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-ink-deep text-base tracking-tight font-sans">
                  CivicResolve
                </span>
                <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-teal-trust/10 text-teal-trust border border-teal-trust/20">
                  AI
                </span>
              </div>
              <span className="text-[11px] text-ink-muted -mt-0.5 hidden sm:inline">
                Fintech Grievance Intelligence
              </span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#how-it-works"
              className="text-xs font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-deep transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
            >
              How It Works
            </a>
            <a
              href="#transparency"
              className="text-xs font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-deep transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
            >
              About
            </a>
            <Link
              to="/track"
              className="text-xs font-semibold uppercase tracking-wider text-ink-muted hover:text-teal-trust transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
            >
              Track Complaint
            </Link>
            <Link
              to="/reviewer/login"
              className="text-xs font-semibold uppercase tracking-wider text-ink-muted hover:text-teal-trust transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
            >
              Reviewer Portal
            </Link>
            <Link to="/submit">
              <Button size="sm" variant="primary" className="shadow-xs font-semibold">
                Submit Complaint
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
              </Button>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas transition-colors border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            onClick={() => setNavOpen((o) => !o)}
            aria-expanded={navOpen}
            aria-controls="mobile-nav"
            aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {navOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </nav>

        {/* Mobile nav drawer */}
        {navOpen && (
          <div
            id="mobile-nav"
            className="md:hidden border-t border-border bg-surface px-4 py-4 flex flex-col gap-3 shadow-lg"
          >
            <a
              href="#how-it-works"
              className="text-sm font-medium text-ink-muted hover:text-ink py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
              onClick={() => setNavOpen(false)}
            >
              How It Works
            </a>
            <a
              href="#transparency"
              className="text-sm font-medium text-ink-muted hover:text-ink py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
              onClick={() => setNavOpen(false)}
            >
              About
            </a>
            <Link
              to="/track"
              className="text-sm font-medium text-ink-muted hover:text-teal-trust py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
              onClick={() => setNavOpen(false)}
            >
              Track Complaint
            </Link>
            <Link
              to="/reviewer/login"
              className="text-sm font-medium text-ink-muted hover:text-teal-trust py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
              onClick={() => setNavOpen(false)}
            >
              Reviewer Portal
            </Link>
            <Link to="/submit" onClick={() => setNavOpen(false)}>
              <Button size="sm" variant="primary" className="w-full justify-center mt-2">
                Submit Complaint
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        )}
      </header>

      {/* ── Main content landmark ───────────────────────────────────────────── */}
      <main id="main-content">
        {/* ── Hero Section with Live Interactive Triage Simulation ──────────── */}
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-hidden bg-gradient-to-b from-canvas via-surface to-canvas border-b border-border pt-16 pb-20 sm:pt-24 sm:pb-28"
        >
          {/* Subtle architectural background grid */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(#0F172A 1px, transparent 1px), radial-gradient(#0F172A 1px, #F8FAFC 1px)',
              backgroundSize: '32px 32px',
              backgroundPosition: '0 0, 16px 16px',
            }}
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              {/* Left Column: Editorial Value Pitch */}
              <div className="lg:col-span-6 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-trust/10 text-teal-trust text-xs font-semibold border border-teal-trust/20 tracking-wide">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Fintech-Grade Grievance Intelligence</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse ml-0.5" />
                </div>

                <h1
                  id="hero-heading"
                  className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-ink-deep leading-[1.12] tracking-tight font-sans"
                  style={{ textWrap: 'balance' }}
                >
                  Bring clarity to your
                  <br />
                  <span className="text-teal-trust bg-gradient-to-r from-teal-700 via-teal-600 to-teal-500 bg-clip-text text-transparent">
                    financial grievance.
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-ink-muted leading-relaxed max-w-xl">
                  CivicResolve AI uses automated classification and human oversight to help
                  route your consumer-finance complaint to the right place. Submit your
                  concern and receive an immediate preliminary assessment.
                </p>

                {/* Primary CTA Row */}
                <div className="pt-2 flex flex-col sm:flex-row gap-3.5">
                  <Link to="/submit">
                    <Button size="lg" variant="primary" className="shadow-md shadow-teal-900/10 font-bold w-full sm:w-auto">
                      Submit Your Complaint
                      <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
                    </Button>
                  </Link>
                  <Link to="/track">
                    <Button size="lg" variant="secondary" className="border-border hover:bg-slate-50 font-semibold w-full sm:w-auto">
                      Track Existing Complaint
                    </Button>
                  </Link>
                </div>

                {/* Micro Trust Proofs */}
                <div className="pt-4 grid grid-cols-3 gap-4 border-t border-border/80">
                  <div>
                    <span className="block text-xl sm:text-2xl font-extrabold text-ink-deep font-mono">
                      8
                    </span>
                    <span className="text-[11px] font-medium text-ink-muted">
                      CFPB Taxonomies
                    </span>
                  </div>
                  <div>
                    <span className="block text-xl sm:text-2xl font-extrabold text-teal-trust font-mono">
                      100%
                    </span>
                    <span className="text-[11px] font-medium text-ink-muted">
                      Human in the Loop
                    </span>
                  </div>
                  <div>
                    <span className="block text-xl sm:text-2xl font-extrabold text-ink-deep font-mono">
                      SHA-256
                    </span>
                    <span className="text-[11px] font-medium text-ink-muted">
                      Model Provenance
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Interactive Triage Simulation */}
              <div className="lg:col-span-6">
                <div className="rounded-2xl border border-border bg-surface shadow-card-hover overflow-hidden">
                  {/* Terminal Header */}
                  <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-300">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                      </div>
                      <span className="text-xs font-mono font-medium text-slate-400 ml-2">
                        nlp-triage-pipeline: live preview
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-teal-400 border border-slate-700">
                      <Sparkles className="w-3 h-3" />
                      LINEAR XAI
                    </div>
                  </div>

                  {/* Interactive Scenario Tabs */}
                  <div className="px-5 pt-4 pb-2 bg-canvas/70 border-b border-border flex items-center gap-2 overflow-x-auto">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted shrink-0 mr-1">
                      Sample Case:
                    </span>
                    {DEMO_SCENARIOS.map((scenario) => (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => setActiveScenarioId(scenario.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shrink-0 cursor-pointer ${
                          activeScenarioId === scenario.id
                            ? 'bg-surface text-ink-deep border border-border shadow-xs'
                            : 'text-ink-muted hover:text-ink-deep hover:bg-surface/60'
                        }`}
                      >
                        {scenario.tabLabel}
                      </button>
                    ))}
                  </div>

                  {/* Grievance Narrative with Real-time Token Attribution Highlights */}
                  <div className="p-5 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                          Citizen Grievance Narrative:
                        </span>
                        <span className="text-[10px] font-mono text-ink-muted">
                          token highlights active
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-canvas border border-border text-xs leading-relaxed text-ink-deep font-sans">
                        {activeScenario.description.split(' ').map((word, idx) => {
                          const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
                          const isHighlighted = activeScenario.highlightedWords.includes(cleanWord);
                          return (
                            <span
                              key={idx}
                              className={
                                isHighlighted
                                  ? 'bg-teal-trust/20 text-teal-900 font-bold px-1 py-0.5 rounded border border-teal-trust/30 mx-0.5'
                                  : 'mx-0.5'
                              }
                            >
                              {word}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Output Triage Classification Panel */}
                    <div className="p-4 rounded-xl bg-surface border border-slate-200/90 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block">
                            Predicted CFPB Category
                          </span>
                          <span className="text-sm font-extrabold text-ink-deep font-sans">
                            {activeScenario.category}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block">
                            Confidence
                          </span>
                          <span className="text-base font-extrabold text-teal-trust font-mono">
                            {activeScenario.confidence}%
                          </span>
                        </div>
                      </div>

                      {/* Linear Feature Attribution Bar */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-semibold text-ink-muted mb-1.5">
                          <span className="flex items-center gap-1">
                            <Scale className="w-3 h-3 text-teal-trust" />
                            Top Positive Feature Attributions:
                          </span>
                          <span className="font-mono text-[10px]">Decision Margin: {activeScenario.margin}%</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {activeScenario.features.map((feat) => (
                            <div
                              key={feat.feature}
                              className="p-2 rounded-lg bg-canvas border border-border flex items-center justify-between text-[11px] font-mono"
                            >
                              <span className="font-semibold text-ink-deep truncate pr-1">
                                {feat.feature}
                              </span>
                              <span className="text-semantic-success-fg font-bold shrink-0">
                                +{feat.contribution.toFixed(3)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Human Routing Notice */}
                      <div className="pt-1 flex items-start gap-2 text-xs text-ink-muted bg-teal-trust/5 p-2.5 rounded-lg border border-teal-trust/15">
                        <Users className="w-4 h-4 text-teal-trust shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-ink-deep">Triage Recommendation:</span>{' '}
                          {activeScenario.routeReason}.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works (3 Steps Lifecycle Pipeline) ───────────────────────── */}
        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="bg-surface border-b border-border py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-trust">
                Structured Lifecycle
              </span>
              <h2
                id="how-it-works-heading"
                className="text-3xl sm:text-4xl font-extrabold text-ink-deep tracking-tight mt-2"
                style={{ textWrap: 'balance' }}
              >
                How It Works
              </h2>
              <p className="mt-3 text-base text-ink-muted leading-relaxed">
                Your complaint is handled in three steps — from submission through
                automated classification to human review.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Step 1 */}
              <article className="relative bg-canvas rounded-2xl border border-border p-8 flex flex-col justify-between hover:border-teal-trust/40 transition-colors shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className="w-12 h-12 rounded-xl bg-ink-deep text-white flex items-center justify-center font-bold text-base shadow-sm"
                      aria-hidden="true"
                    >
                      1
                    </div>
                    <div className="p-2.5 rounded-xl bg-teal-trust/10 text-teal-trust border border-teal-trust/20">
                      <FileText className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-ink-deep mb-2 font-sans">
                    Submit Your Complaint
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Describe your consumer-finance issue in plain language. No account is
                    required. Your complaint is handled securely and confidentially.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs font-semibold text-teal-trust">
                  <span>Intake Received</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </article>

              {/* Step 2 */}
              <article className="relative bg-canvas rounded-2xl border border-border p-8 flex flex-col justify-between hover:border-teal-trust/40 transition-colors shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className="w-12 h-12 rounded-xl bg-teal-trust text-white flex items-center justify-center font-bold text-base shadow-sm"
                      aria-hidden="true"
                    >
                      2
                    </div>
                    <div className="p-2.5 rounded-xl bg-teal-trust/10 text-teal-trust border border-teal-trust/20">
                      <Cpu className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-ink-deep mb-2 font-sans">
                    AI Classification
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Our NLP pipeline assigns your complaint to one of eight
                    consumer-finance product categories and assesses triage priority
                    automatically.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs font-semibold text-teal-trust">
                  <span>Linear Feature Attribution</span>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </article>

              {/* Step 3 */}
              <article className="relative bg-canvas rounded-2xl border border-border p-8 flex flex-col justify-between hover:border-teal-trust/40 transition-colors shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className="w-12 h-12 rounded-xl bg-ink-deep text-white flex items-center justify-center font-bold text-base shadow-sm"
                      aria-hidden="true"
                    >
                      3
                    </div>
                    <div className="p-2.5 rounded-xl bg-teal-trust/10 text-teal-trust border border-teal-trust/20">
                      <Users className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-ink-deep mb-2 font-sans">
                    Human Review
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    A trained reviewer examines the classification before any final
                    decision is made. Automated assessments are never applied without
                    human oversight.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs font-semibold text-teal-trust">
                  <span>Mandatory Adjudication</span>
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ── Comprehensive Asymmetric Bento-Grid Value Proposition ────────────── */}
        <section className="bg-canvas border-b border-border py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-14">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-trust">
                Fintech Governance Architecture
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-ink-deep tracking-tight mt-2">
                Engineered for regulatory transparency and consumer trust
              </h2>
              <p className="text-base text-ink-muted mt-3 leading-relaxed">
                Modern machine learning must withstand statutory audit. CivicResolve AI replaces opaque neural embeddings with reproducible, linear attribution vectors.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Bento Card 1: 8 CFPB Categories (span 7) */}
              <div className="md:col-span-7 bg-surface rounded-2xl border border-border p-8 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-teal-trust/10 text-teal-trust flex items-center justify-center mb-5">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-deep mb-2">
                    8 Standard CFPB Regulatory Taxonomies
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    Our model is trained on the Consumer Financial Protection Bureau complaint corpus, classifying into credit reporting, mortgages, student loans, debt collection, banking accounts, vehicle loans, and money services.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-border text-xs font-medium text-ink-muted">
                  <div className="p-2 rounded bg-canvas border border-border/80 text-center">Credit Reporting</div>
                  <div className="p-2 rounded bg-canvas border border-border/80 text-center">Debt Collection</div>
                  <div className="p-2 rounded bg-canvas border border-border/80 text-center">Mortgages</div>
                  <div className="p-2 rounded bg-canvas border border-border/80 text-center">Bank Accounts</div>
                </div>
              </div>

              {/* Bento Card 2: Cryptographic Audit Trail (span 5) */}
              <div className="md:col-span-5 bg-surface rounded-2xl border border-border p-8 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-ink-deep text-teal-400 flex items-center justify-center mb-5">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-deep mb-2">
                    Cryptographic Audit Trail
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Every inference logs a SHA-256 model provenance checksum, decision score margin, runner-up category, and token attribution map into PostgreSQL JSONB.
                  </p>
                </div>
                <div className="mt-6 p-3 rounded-xl bg-slate-900 text-slate-300 font-mono text-[11px] border border-slate-800">
                  <span className="text-slate-500">model_provenance_sha256:</span><br />
                  <span className="text-teal-400">c6f4a21087e9...cf82</span>
                </div>
              </div>

              {/* Bento Card 3: In-Memory Zero-Storage Reviewer Auth (span 5) */}
              <div className="md:col-span-5 bg-surface rounded-2xl border border-border p-8 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center mb-5">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-deep mb-2">
                    Strict In-Memory Session Security
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Zero persistence of reviewer credentials or citizen tracking secrets in localStorage, sessionStorage, or browser cookies. Sessions terminate instantly upon tab close.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>Enforces Ephemeral State Hygiene</span>
                </div>
              </div>

              {/* Bento Card 4: Optimistic Lock Human Oversight (span 7) */}
              <div className="md:col-span-7 bg-surface rounded-2xl border border-border p-8 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center mb-5">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-deep mb-2">
                    Optimistic Lock Adjudication
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed mb-4">
                    Reviewers can approve, override, or reject AI recommendations with mandatory justification notes. Simultaneous reviews are guarded by version-checked optimistic locking (`HTTP 409 Conflict`).
                  </p>
                </div>
                <div className="pt-4 border-t border-border flex flex-wrap gap-2 text-xs">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">APPROVE</span>
                  <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">OVERRIDE (with note)</span>
                  <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-200">REJECT (with note)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── AI Transparency Section ─────────────────────────────────────────── */}
        <section
          id="transparency"
          aria-labelledby="transparency-heading"
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28"
        >
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-trust/10 text-teal-trust flex items-center justify-center">
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
              </div>
              <h2
                id="transparency-heading"
                className="text-2xl sm:text-3xl font-extrabold text-ink-deep tracking-tight"
              >
                AI Transparency
              </h2>
            </div>
            <p className="text-ink-muted mb-10 leading-relaxed text-sm sm:text-base">
              CivicResolve AI uses machine learning to assist classification. We are
              committed to being clear about what our system can and cannot do.
            </p>

            <ul className="space-y-4" role="list">
              {[
                {
                  heading: 'Assessments are preliminary',
                  body: 'Every classification produced by our NLP model is an initial estimate only. It does not constitute a final determination.',
                },
                {
                  heading: 'Accuracy is not guaranteed',
                  body: 'Machine learning models can produce incorrect classifications. All outputs are subject to correction by a human reviewer.',
                },
                {
                  heading: 'Human oversight is mandatory',
                  body: 'No complaint is processed solely on the basis of automated classification. A trained reviewer approves, overrides, or rejects every AI recommendation.',
                },
                {
                  heading: 'This is not legal advice',
                  body: 'CivicResolve AI is a complaint triage tool. Nothing produced by this platform constitutes legal advice or representation.',
                },
              ].map(({ heading, body }) => (
                <li
                  key={heading}
                  className="flex gap-4 p-5 rounded-2xl border border-border bg-surface shadow-xs hover:border-slate-300 transition-colors"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full bg-teal-trust mt-2 shrink-0 ring-4 ring-teal-trust/15"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-bold text-ink-deep mb-1 font-sans">{heading}</p>
                    <p className="text-sm text-ink-muted leading-relaxed">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Privacy & Trust Section ────────────────────────────────────────── */}
        <section
          aria-labelledby="privacy-heading"
          className="bg-surface border-t border-border py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-teal-trust/10 text-teal-trust flex items-center justify-center">
                  <Lock className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2
                  id="privacy-heading"
                  className="text-2xl sm:text-3xl font-extrabold text-ink-deep tracking-tight"
                >
                  Privacy &amp; Trust
                </h2>
              </div>
              <p className="text-sm sm:text-base text-ink-muted mb-10 leading-relaxed">
                Consumer grievance data requires institutional security standards and clear regulatory boundaries.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  {
                    icon: Lock,
                    heading: 'Secure transmission',
                    body: 'Complaints are submitted using standard web protocols. When deployed in production, HTTPS encryption is applied. This prototype should not be used to submit real personal or financial information.',
                  },
                  {
                    icon: Eye,
                    heading: 'Access-controlled review',
                    body: 'Review access is restricted to authorised staff. Automated triage classifications are subject to human oversight before any determination is made.',
                  },
                  {
                    icon: ShieldCheck,
                    heading: 'No consumer profiling',
                    body: 'CivicResolve AI does not intentionally build consumer profiles or integrate with advertising systems. This is a demonstration platform and is not subject to production privacy audits.',
                  },
                  {
                    icon: AlertCircle,
                    heading: 'Limitation of scope',
                    body: 'This platform handles complaint classification only. We do not provide legal services, financial advice, or dispute resolution.',
                  },
                ].map(({ icon: Icon, heading, body }) => (
                  <div
                    key={heading}
                    className="flex gap-4 p-6 rounded-2xl border border-border bg-canvas shadow-xs hover:border-slate-300 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-teal-trust shrink-0 shadow-xs">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink-deep mb-1 font-sans">{heading}</p>
                      <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950 text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
            {/* Brand column */}
            <div className="flex flex-col gap-3.5 max-w-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
                  <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                </div>
                <span className="text-white font-bold text-lg tracking-tight">CivicResolve AI</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Automated consumer-finance complaint triage with mandatory human oversight.
              </p>
            </div>

            {/* Navigation links */}
            <nav aria-label="Footer navigation">
              <ul className="flex flex-wrap gap-6 sm:gap-8 text-xs font-semibold uppercase tracking-wider text-slate-300" role="list">
                <li>
                  <Link
                    to="/"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <a
                    href="#how-it-works"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    How It Works
                  </a>
                </li>
                <li>
                  <a
                    href="#transparency"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    About
                  </a>
                </li>
                <li>
                  <Link
                    to="/submit"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    Submit Complaint
                  </Link>
                </li>
                <li>
                  <Link
                    to="/track"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    Track Complaint
                  </Link>
                </li>
                <li>
                  <Link
                    to="/reviewer/login"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    Reviewer Portal
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          {/* Legal Disclaimers */}
          <div className="mt-12 pt-8 border-t border-slate-800/80 text-xs leading-relaxed text-slate-400 space-y-2">
            <p>
              CivicResolve AI provides preliminary complaint classification. This is not
              legal advice. AI assessments are subject to human review.
            </p>
            <p>
              CivicResolve AI is a demonstration platform. Complaint submissions are
              processed for classification purposes only and do not constitute formal
              regulatory filings.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
};
