import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowLeft,
  AlertTriangle,
  FileText,
  Lock,
  Sparkles,
  Info,
  Shield,
  EyeOff,
  CheckCircle2,
  ChevronDown,
  X,
} from 'lucide-react';
import { submitGrievance } from '../../lib/api/endpoints';
import { ApiError } from '../../lib/errors/api-error';
import { GrievanceResponse, GrievanceSubmissionResponse } from '../../types/grievance';
import { Button } from '../../components/ui/Button';
import { Label } from '../../components/ui/Label';
import { SubmissionReceipt } from './SubmissionReceipt';
import { InteractiveTriageHero } from './components/InteractiveTriageHero';
import { IntakeSafeguardInspector } from './components/IntakeSafeguardInspector';

/** Minimum and maximum description lengths enforced by backend. */
const MIN_LENGTH = 20;
const MAX_LENGTH = 5000;

const DEMO_PRESETS = [
  {
    id: 'foreclosure',
    label: 'Critical Mortgage Foreclosure',
    badge: 'Critical Urgency',
    text: 'My mortgage loan servicer, Apex Lending, wrongfully initiated foreclosure proceedings against my primary home despite my approved loan modification application. I received an urgent notice of sheriff sale scheduled for next month. When I contacted the escrow department, they claimed my monthly payment was missing, but my bank statements clearly confirm direct wire transfers were processed on time. I am at immediate risk of eviction and homelessness.',
  },
  {
    id: 'debt-card',
    label: 'Ambiguous Debt vs. Credit Card',
    badge: 'Dual Class',
    text: 'A third-party collection agency, Frontier Recovery, has been harassing me with daily phone calls regarding an alleged past-due balance of $1,850 on an old credit card account that was charged off four years ago. I mailed a formal debt validation notice requesting proof of ownership, but they refused to provide an itemized statement or the original credit agreement, yet they continue to report derogatory marks to credit bureaus.',
  },
  {
    id: 'credit-report',
    label: 'Credit Reporting Dispute',
    badge: 'Standard Triage',
    text: 'I obtained copies of my credit reports from Equifax, Experian, and TransUnion and discovered an inaccurate 90-day delinquent derogatory mark on a vehicle auto loan that I paid off in full six months ago. I possess the official lien release and payoff confirmation letter from the financing company, but the credit reporting agencies refuse to delete the inaccurate late marks after my written disputes.',
  },
];

function detectPii(text: string): boolean {
  if (!text) return false;
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/;
  const cardRegex = /\b(?:\d{4}[ -]?){3}\d{4}\b/;
  const phoneRegex = /\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/;
  return ssnRegex.test(text) || cardRegex.test(text) || phoneRegex.test(text);
}

function maskSensitiveData(text: string): string {
  let masked = text;
  // Mask SSN: 123-45-6789 -> XXX-XX-6789
  masked = masked.replace(/\b(\d{3})-(\d{2})-(\d{4})\b/g, 'XXX-XX-$3');
  // Mask 16-digit cards: 1234-5678-9012-3456 -> XXXX-XXXX-XXXX-3456
  masked = masked.replace(/\b(?:\d{4}[ -]?){3}(\d{4})\b/g, 'XXXX-XXXX-XXXX-$1');
  // Mask Phone numbers: (555) 123-4567 -> (XXX) XXX-4567
  masked = masked.replace(/\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g, '(XXX) XXX-$3');
  return masked;
}

type PageState =
  | 'ready'
  | 'submitting'
  | 'success'
  | 'network-error'
  | 'uncertain';

/**
 * SubmitGrievancePage — elevated consumer complaint intake flow.
 *
 * Design & Security Guarantees:
 * - Unified max-w-6xl container across dark hero, stepper, and intake form.
 * - Bento-box pure white cards (border-slate-200, shadow-sm, rounded-xl) on bg-slate-50 canvas.
 * - Sends { description } ONLY to POST /api/grievances.
 * - Backend NLP pipeline classifies the CFPB category automatically.
 * - Narrative is never logged or stored in localStorage/sessionStorage.
 * - No auto-retry on any error state.
 * - Synchronous submission guard (submittingRef) prevents duplicate API calls.
 */
export const SubmitGrievancePage: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('ready');
  const [description, setDescription] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submissionResult, setSubmissionResult] = useState<
    GrievanceSubmissionResponse | GrievanceResponse | null
  >(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const [loadedPresetName, setLoadedPresetName] = useState<string | null>(null);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);

  const hasPii = useMemo(() => detectPii(description), [description]);
  const wordCount = useMemo(() => {
    const trimmed = description.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [description]);

  const handleLoadPreset = (text: string, label?: string) => {
    setDescription(text);
    if (label) {
      setLoadedPresetName(label);
    } else {
      const found = DEMO_PRESETS.find((p) => p.text === text);
      setLoadedPresetName(found ? found.label : 'Sample CFPB Scenario');
    }
    setValidationErrors([]);
    setServerErrors([]);
  };

  const handleMaskPii = () => {
    setDescription((prev) => maskSensitiveData(prev));
  };

  const abortRef = useRef<AbortController | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  // Synchronous guard — prevents duplicate submissions even on rapid double-clicks
  const submittingRef = useRef(false);

  // Security: Clean up in-memory tracking secret on unmount
  useEffect(() => {
    return () => {
      setSubmissionResult(null);
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // ── Focus error summary after validation failure ────────────────────────
  useEffect(() => {
    if (
      (validationErrors.length > 0 || serverErrors.length > 0) &&
      errorSummaryRef.current
    ) {
      errorSummaryRef.current.focus();
    }
  }, [validationErrors, serverErrors]);

  // ── Client-side validation ──────────────────────────────────────────────
  const validate = (): string[] => {
    const errors: string[] = [];
    const trimmed = description.trim();

    if (trimmed.length === 0) {
      errors.push('Complaint description is required.');
    } else if (trimmed.length < MIN_LENGTH) {
      errors.push(
        `Complaint description must be at least ${MIN_LENGTH} characters (currently ${trimmed.length}).`
      );
    } else if (description.length > MAX_LENGTH) {
      errors.push(
        `Complaint description must not exceed ${MAX_LENGTH} characters (currently ${description.length}).`
      );
    }

    return errors;
  };

  // ── Form submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Synchronous duplicate-click guard — must be checked before any async work
    if (submittingRef.current) return;
    submittingRef.current = true;

    // Clear prior error state
    setValidationErrors([]);
    setServerErrors([]);

    const errors = validate();
    if (errors.length > 0) {
      setValidationErrors(errors);
      // Release guard so user can fix and resubmit
      submittingRef.current = false;
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPageState('submitting');

    try {
      // Backend only accepts { description }. Category is assigned by NLP pipeline.
      const result = await submitGrievance({ description }, controller.signal);
      setSubmissionResult(result);
      setPageState('success');
      // Guard remains locked — form unmounts on success, so release is not needed
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;

      if (err instanceof ApiError) {
        if (err.isValidationError) {
          // 400 — keep form data intact, show validation errors from server
          const msgs =
            err.validationErrors && err.validationErrors.length > 0
              ? err.validationErrors
              : [err.userMessage];
          setServerErrors(msgs);
          setPageState('ready');
          // Release guard so user can correct and resubmit
          submittingRef.current = false;
        } else if (err.status >= 500 && err.status < 600) {
          // All HTTP 5xx — uncertain state; keep guard locked
          setPageState('uncertain');
        } else if (err.status === 0 || err.status === undefined || err.status === null) {
          // Network error — uncertain state; keep guard locked
          setPageState('uncertain');
        } else {
          // Other 4xx client errors — show message, allow resubmit
          setServerErrors([err.userMessage]);
          setPageState('ready');
          submittingRef.current = false;
        }
      } else {
        // Unknown error type — treat as uncertain; keep guard locked
        setPageState('uncertain');
      }
    }
  };

  const isSubmitting = pageState === 'submitting';
  const descriptionId = 'complaint-description';
  const descErrorId = 'description-error';
  const serverErrorId = 'server-error-summary';

  const descriptionHasError =
    validationErrors.some((e) => e.toLowerCase().includes('description')) ||
    serverErrors.some((e) => e.toLowerCase().includes('description'));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 w-full">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-slate-900 font-semibold text-base hover:text-teal-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 rounded-lg py-1 px-1.5"
            aria-label="CivicResolve AI — return to home"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-teal-400 flex items-center justify-center border border-slate-800 shadow-xs">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-extrabold tracking-tight font-sans">CivicResolve AI</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 rounded-lg px-3 py-1.5 bg-white border border-slate-200 shadow-xs"
            aria-label="Return to home"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </header>

      {/* Main Content Landmark */}
      <main id="main-content" className="flex-1 w-full">
        {/* Unified Container: Dark hero, Stepper, and Form Cards sharing exact same max-w-6xl */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-8 pb-16">
          {/* ── Page Header: Form-First Experience ─────────────────────────── */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-slate-200">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold mb-2.5 border border-teal-200">
                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                  <span>Public Intake Gateway</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-sans">
                  Submit a Complaint
                </h1>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed max-w-2xl">
                  Describe your consumer-finance concern below. Your complaint will be
                  classified automatically and then reviewed by a trained member of staff.
                  No personal account is required.
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsHeroExpanded(true);
                      setTimeout(() => {
                        document.getElementById('triage-engine-preview')?.scrollIntoView({ behavior: 'smooth' });
                      }, 50);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors cursor-pointer group"
                  >
                    <span>See how automated triage works</span>
                    <ChevronDown className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Uncertain Network/5xx State ─────────────────────────────────── */}
          {pageState === 'uncertain' && (
            <div
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 p-6 sm:p-8 flex flex-col sm:flex-row gap-4 shadow-sm"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
                <AlertTriangle className="w-5 h-5 text-amber-700" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h2 className="text-base font-bold text-slate-900">
                  Submission could not be confirmed
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your submission could not be confirmed. It may or may not have been
                  recorded by the server. Do not resubmit — contact support if this
                  issue persists.
                </p>
                <div className="pt-2">
                  <Link to="/">
                    <Button variant="secondary" size="sm">
                      Return to home
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* ── Success State: Show Receipt ───────────────────────────────── */}
          {pageState === 'success' && submissionResult && (
            <SubmissionReceipt result={submissionResult} />
          )}

          {/* ── Complaint Intake Form — 12-col split-screen ───────────────── */}
          {(pageState === 'ready' || pageState === 'submitting') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left column: complaint editor — 7 of 12 columns */}
              <div className="lg:col-span-7">
                <form
                  onSubmit={handleSubmit}
                  noValidate
                  aria-label="Complaint submission form"
                  className="space-y-6"
                >
                  {/* Server/General Error Summary */}
                  {serverErrors.length > 0 && (
                    <div
                      id={serverErrorId}
                      role="alert"
                      aria-live="assertive"
                      tabIndex={-1}
                      ref={errorSummaryRef}
                      className="rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-xs"
                    >
                      <p className="text-sm font-bold text-rose-800 mb-1">
                        Please correct the following:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs text-rose-700">
                        {serverErrors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Client Validation Error Summary */}
                  {validationErrors.length > 0 && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      tabIndex={-1}
                      ref={errorSummaryRef}
                      className="rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-xs"
                    >
                      <p className="text-sm font-bold text-rose-800 mb-1">
                        Please correct the following:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs text-rose-700">
                        {validationErrors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Auto-Classification Notice */}
                  <div className="p-4 rounded-xl bg-teal-50 border border-teal-200/80 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-[#0F766E] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">Automated CFPB Category Assignment</p>
                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        CivicResolve AI will automatically assign a preliminary product category
                        from your description.
                      </p>
                    </div>
                  </div>

                  {/* Bento-Box Narrative Card: pure white, border-slate-200, rounded-xl, shadow-sm, p-6 sm:p-8 */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
                    <div>
                      <Label htmlFor={descriptionId} required className="text-sm font-bold text-slate-900 mb-1">
                        Complaint description
                      </Label>
                      <p className="text-xs text-slate-500 leading-relaxed mb-3.5">
                        Describe your complaint in detail. Include relevant dates, amounts, and
                        actions taken. Do not include passwords, PINs, or full account numbers.
                      </p>

                      {/* 3 Labeled Demo Preset Chips */}
                      <div className="mb-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                            Load Sample CFPB Scenario:
                          </span>
                          <span className="text-xs text-slate-500">
                            Click to populate test narrative
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {DEMO_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleLoadPreset(preset.text, preset.label)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-200 bg-teal-50/70 text-teal-800 hover:bg-teal-100 hover:border-teal-300 transition-all shadow-2xs cursor-pointer"
                            >
                              <span>{preset.label}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-teal-200 text-teal-700 font-mono font-bold">
                                {preset.badge}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Visible Banner when Sample Scenario is Loaded */}
                      {loadedPresetName && (
                        <div className="mb-4 p-3 rounded-xl bg-teal-50/80 border border-teal-200 flex items-center justify-between gap-3 text-xs text-teal-900 shadow-2xs animate-in fade-in duration-150">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded bg-teal-200/90 border border-teal-300 text-teal-950 font-bold font-mono text-[10px] uppercase tracking-wider shrink-0">
                              Demo Scenario Loaded
                            </span>
                            <span className="font-semibold truncate">
                              {loadedPresetName}
                            </span>
                            <span className="text-teal-700 text-xs hidden sm:inline">
                              (Demo Purpose Only)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDescription('');
                              setLoadedPresetName(null);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-bold text-teal-800 hover:text-teal-950 underline shrink-0 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Clear sample text</span>
                          </button>
                        </div>
                      )}

                      <textarea
                        id={descriptionId}
                        name="description"
                        value={description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDescription(val);
                          if (!val.trim()) {
                            setLoadedPresetName(null);
                          }
                          if (descriptionHasError && val.trim().length >= MIN_LENGTH) {
                            setValidationErrors((prev) =>
                              prev.filter((err) => !err.toLowerCase().includes('description'))
                            );
                            setServerErrors((prev) =>
                              prev.filter((err) => !err.toLowerCase().includes('description'))
                            );
                          }
                        }}
                        rows={8}
                        maxLength={MAX_LENGTH}
                        disabled={isSubmitting}
                        required
                        aria-required="true"
                        aria-invalid={descriptionHasError}
                        aria-describedby={
                          [
                            'description-hint',
                            descriptionHasError ? descErrorId : '',
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                        placeholder="Please describe your complaint clearly and concisely… For example: 'I submitted an official dispute to Equifax regarding an erroneous mortgage tradeline of $1,840 that does not belong to me...'"
                        className={[
                          'w-full rounded-xl border bg-slate-50/50 hover:bg-white focus:bg-white px-4 py-3 text-sm text-slate-900 resize-y leading-relaxed font-sans',
                          'transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-[#0F766E]',
                          'placeholder:text-slate-400',
                          'disabled:opacity-60 disabled:cursor-not-allowed',
                          descriptionHasError
                            ? 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-500'
                            : 'border-slate-200 hover:border-slate-300',
                        ].join(' ')}
                      />

                      {/* Non-Blocking PII Redaction Assistant Banner */}
                      {hasPii && (
                        <div className="mt-3.5 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-200">
                          <div className="flex items-start gap-2.5">
                            <EyeOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-amber-900">
                                Sensitive Numbers Detected:
                              </span>{' '}
                              <span>
                                We noticed potential Social Security, card, or phone numbers. To protect your privacy, we recommend masking them before submitting.
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleMaskPii}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition-colors shrink-0 shadow-xs cursor-pointer"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            Mask Sensitive Numbers as XXXX
                          </button>
                        </div>
                      )}

                      {/* Character & Word Counter + Completeness Guide */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          {descriptionHasError && (
                            <p
                              id={descErrorId}
                              className="text-xs font-semibold text-rose-600"
                              aria-live="polite"
                            >
                              {validationErrors.find((e) => e.toLowerCase().includes('description')) ||
                                serverErrors.find((e) => e.toLowerCase().includes('description'))}
                            </p>
                          )}
                          {!descriptionHasError && description.trim().length > 0 && (
                            <span className="text-xs text-slate-600 flex items-center gap-1">
                              {wordCount < 20 ? (
                                <span className="text-amber-700 font-medium">
                                  Brief narrative &bull; More details help AI routing.
                                </span>
                              ) : wordCount < 100 ? (
                                <span className="text-teal-700 font-medium flex items-center gap-1">
                                  <CheckCircle2 size={13} /> Good level of detail for triage.
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-medium flex items-center gap-1">
                                  <CheckCircle2 size={13} /> Comprehensive narrative for reviewer verification.
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0 tabular-nums font-mono text-xs">
                          <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {wordCount} word{wordCount !== 1 ? 's' : ''}
                          </span>
                          <span
                            id="description-hint"
                            aria-live="polite"
                            className={[
                              description.length > MAX_LENGTH
                                ? 'text-rose-600 font-bold'
                                : description.length > MAX_LENGTH * 0.9
                                ? 'text-amber-600 font-semibold'
                                : 'text-slate-600',
                            ].join(' ')}
                          >
                            {description.length} / {MAX_LENGTH} chars (min {MIN_LENGTH})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Guidelines Box */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-[#0F766E]" />
                        Helpful intake guidelines:
                      </span>
                      <ul className="list-disc list-inside space-y-1 pl-1 text-xs leading-relaxed">
                        <li>Identify the financial institution (e.g., bank, servicer, credit bureau).</li>
                        <li>State the exact transaction dates and disputed dollar amounts.</li>
                        <li>Do not enter actual Social Security numbers, debit card PINs, or passwords.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Privacy Notice Box: pure white bento-card */}
                  <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-start gap-3.5">
                    <Lock className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <strong className="text-slate-900 font-semibold">Privacy Notice:</strong> Complaints are
                      submitted using standard web protocols. When deployed in production, HTTPS
                      encryption is applied. Complaint descriptions are used for preliminary triage
                      and stored securely for authorized reviewer assessment. This prototype should
                      not be used to submit real personal or financial information. Never enter real
                      account numbers, Social Security numbers, or sensitive financial data into this prototype.
                    </p>
                  </div>

                  {/* Submit Button: full width, Trust Teal #0F766E, rounded-lg */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      isLoading={isSubmitting}
                      disabled={isSubmitting}
                      aria-describedby="submit-guidance"
                      className="w-full bg-[#0F766E] hover:bg-teal-800 text-white rounded-lg shadow-sm font-bold justify-center py-3 cursor-pointer"
                    >
                      {isSubmitting ? 'Submitting…' : 'Submit Complaint'}
                    </Button>
                    <p id="submit-guidance" className="text-center text-xs text-slate-500 mt-2.5 leading-relaxed">
                      Submitting routes your complaint through preliminary automated triage followed by human reviewer verification. Minimum {MIN_LENGTH} characters required.
                    </p>
                  </div>
                </form>
              </div>

              {/* Right column: sticky safeguard inspector — 5 of 12 columns */}
              <div className="lg:col-span-5 lg:sticky lg:top-20">
                <IntakeSafeguardInspector
                  wordCount={wordCount}
                  hasPii={hasPii}
                  charCount={description.length}
                  maxLength={MAX_LENGTH}
                />
              </div>
            </div>
          )}

          {/* ── Collapsible Engine Preview: "See How Automated Triage Works" ── */}
          {(pageState === 'ready' || pageState === 'submitting') && (
            <section
              id="triage-engine-preview"
              aria-labelledby="triage-engine-heading"
              className="mt-14 pt-10 border-t border-slate-200 scroll-mt-20"
            >
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold mb-2 border border-slate-200">
                      <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                      <span>Interactive Architecture & Calibrated Output</span>
                    </div>
                    <h2
                      id="triage-engine-heading"
                      className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight font-sans"
                    >
                      See How Automated Triage Works
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                      Explore token-level attribution, calibrated confidence scoring, and safety gating across held-out scenario fixtures before submitting.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsHeroExpanded((prev) => !prev)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors shrink-0 shadow-2xs cursor-pointer self-start sm:self-auto"
                    aria-expanded={isHeroExpanded}
                    aria-controls="hero-triage-panel"
                  >
                    <span>{isHeroExpanded ? 'Collapse Engine Preview' : 'Expand Engine Preview'}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isHeroExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>

                {isHeroExpanded && (
                  <div id="hero-triage-panel" className="mt-6 pt-6 border-t border-slate-100">
                    <InteractiveTriageHero
                      onLoadScenario={(presetId) => {
                        const preset = DEMO_PRESETS.find((p) => p.id === presetId);
                        if (preset) {
                          handleLoadPreset(preset.text, preset.label);
                          const el = document.getElementById(descriptionId);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.focus();
                          }
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 text-center print:hidden bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
          CivicResolve AI provides preliminary complaint classification. This is not
          legal advice. AI assessments are subject to human review.
        </div>
      </footer>
    </div>
  );
};
