import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { submitGrievance } from '../../lib/api/endpoints';
import { ApiError } from '../../lib/errors/api-error';
import { GrievanceResponse, GrievanceSubmissionResponse } from '../../types/grievance';
import { Button } from '../../components/ui/Button';
import { Label } from '../../components/ui/Label';
import { SubmissionReceipt } from './SubmissionReceipt';
import { IntakeSafeguardInspector } from './components/IntakeSafeguardInspector';

/** Minimum and maximum description lengths enforced by backend. */
const MIN_LENGTH = 20;
const MAX_LENGTH = 5000;

const DEMO_PRESETS = [
  {
    id: 'foreclosure',
    label: 'Mortgage foreclosure',
    text: 'My mortgage loan servicer, Apex Lending, wrongfully initiated foreclosure proceedings against my primary home despite my approved loan modification application. I received an urgent notice of sheriff sale scheduled for next month. When I contacted the escrow department, they claimed my monthly payment was missing, but my bank statements clearly confirm direct wire transfers were processed on time. I am at immediate risk of eviction and homelessness.',
  },
  {
    id: 'debt-card',
    label: 'Debt collection',
    text: 'A third-party collection agency, Frontier Recovery, has been harassing me with daily phone calls regarding an alleged past-due balance of $1,850 on an old credit card account that was charged off four years ago. I mailed a formal debt validation notice requesting proof of ownership, but they refused to provide an itemized statement or the original credit agreement, yet they continue to report derogatory marks to credit bureaus.',
  },
  {
    id: 'credit-report',
    label: 'Credit reporting',
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
  | 'uncertain';

export const SubmitGrievancePage: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('ready');
  const [description, setDescription] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submissionResult, setSubmissionResult] = useState<
    GrievanceSubmissionResponse | GrievanceResponse | null
  >(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const [loadedPresetName, setLoadedPresetName] = useState<string | null>(null);

  const hasPii = useMemo(() => detectPii(description), [description]);
  const wordCount = useMemo(() => {
    const trimmed = description.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [description]);

  const handleLoadPreset = (text: string, label: string) => {
    setDescription(text);
    setLoadedPresetName(label);
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

  useEffect(() => () => abortRef.current?.abort(), []);

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
      if (controller.signal.aborted) return;
      setSubmissionResult(result);
      setDescription('');
      setPageState('success');
      // Guard remains locked — form unmounts on success, so release is not needed
    } catch (err: unknown) {
      if (controller.signal.aborted) return;

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
  const issues = [...validationErrors, ...serverErrors];

  const descriptionHasError =
    validationErrors.some((e) => e.toLowerCase().includes('description')) ||
    serverErrors.some((e) => e.toLowerCase().includes('description'));

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
      <div className="mb-7 max-w-2xl">
        <h1 className="font-serif text-4xl tracking-tight text-ink sm:text-5xl">
          {pageState === 'success' ? 'Submission receipt' : 'Submit a complaint'}
        </h1>
        {pageState !== 'success' && <p className="mt-3 text-base leading-relaxed text-ink-muted">
          Use a fictional example in this demonstration. Describe the product involved, what happened and what you would like to change.
        </p>}
      </div>
      {pageState === 'uncertain' ? (
        <div role="alert" className="max-w-2xl rounded-xl border border-semantic-warning-border bg-semantic-warning-bg p-6">
          <h2 className="text-xl font-semibold">Submission could not be confirmed</h2>
          <p className="mt-2 text-sm leading-relaxed">The connection ended before a receipt arrived. Your complaint may already have been recorded. Sending the same description again could create a duplicate.</p>
          <Link to="/" className="mt-4 inline-flex font-semibold text-teal-trust underline">Return to home</Link>
        </div>
      ) : submissionResult ? <SubmissionReceipt result={submissionResult} /> : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
          <form onSubmit={handleSubmit} noValidate aria-label="Complaint submission form" aria-busy={isSubmitting}
            className="min-w-0 rounded-xl border border-line bg-white p-5 sm:p-8">
            <h2 className="flex items-center gap-2 text-xl font-semibold"><FileText size={20} className="text-teal-trust" aria-hidden="true" />Complaint details</h2>
            {issues.length > 0 && <div id="submission-errors" ref={errorSummaryRef} tabIndex={-1} role="alert"
              className="mt-5 rounded-lg border border-semantic-danger-border bg-semantic-danger-bg p-4 text-sm text-semantic-danger-fg">
              <p className="font-semibold">Check your submission</p>
              <ul className="mt-1 list-inside list-disc">{issues.map(message => <li key={message}>{message}</li>)}</ul>
            </div>}
            <div className="mt-6">
              <Label htmlFor={descriptionId} required>Complaint description</Label>
              <p id="description-hint" className="mb-2 mt-1 text-sm text-ink-muted">Leave out names, account numbers and contact details. Enter 20 to 5,000 characters.</p>
              <textarea id={descriptionId} value={description} rows={7} required aria-required="true"
                disabled={isSubmitting} aria-invalid={descriptionHasError}
                aria-describedby={descriptionHasError ? 'description-hint submission-errors' : 'description-hint'}
                placeholder="For example, my credit card statement shows the same purchase twice. I contacted the card issuer about the extra charge."
                onChange={(event) => {
                  setDescription(event.target.value);
                  setLoadedPresetName(null);
                  setValidationErrors([]);
                  setServerErrors([]);
                }}
                className="block w-full resize-y rounded-lg border border-slate-400 bg-white p-3 text-base leading-relaxed text-ink placeholder:text-ink-muted focus:border-focus disabled:bg-canvas" />
              <p className="mt-1 text-right text-xs tabular-nums text-ink-muted">{description.length} / {MAX_LENGTH} characters</p>
            </div>
            {hasPii && <div role="status" className="mt-4 rounded-lg border border-semantic-warning-border bg-semantic-warning-bg p-4 text-sm text-semantic-warning-fg">
              <p className="font-semibold">Possible sensitive numbers detected</p>
              <p className="mt-1">Check your description. You can partially mask matching numbers before sending it.</p>
              <button type="button" disabled={isSubmitting} className="mt-2 min-h-9 font-semibold underline" onClick={handleMaskPii}>Mask sensitive numbers</button>
            </div>}
            <details className="mt-5 border-y border-line text-sm">
              <summary className="cursor-pointer py-3 font-semibold text-teal-trust">Use a fictional example</summary>
              <p className="text-ink-muted">Choosing an example replaces your draft. Edit it before submitting.</p>
              <div className="mt-2 flex flex-wrap gap-2 pb-4">
                {DEMO_PRESETS.map(preset => <button type="button" key={preset.id} disabled={isSubmitting}
                  onClick={() => handleLoadPreset(preset.text, preset.label)} className="min-h-10 rounded-md border border-line px-3 text-left font-medium hover:border-teal-trust">{preset.label}</button>)}
              </div>
            </details>
            <p role="status" aria-live="polite" className="text-sm text-teal-trust">{loadedPresetName && `Example loaded — ${loadedPresetName}`}</p>
            <div className="mt-6">
              <Button type="submit" isLoading={isSubmitting} rightIcon={<ArrowRight size={16} />}>{isSubmitting ? 'Submitting complaint…' : 'Submit complaint'}</Button>
              <p className="mt-3 text-sm text-ink-muted">Save the reference and secret on the next screen to track your case.</p>
            </div>
          </form>
          <IntakeSafeguardInspector wordCount={wordCount} hasPii={hasPii} />
        </div>
      )}
    </main>
  );
};
