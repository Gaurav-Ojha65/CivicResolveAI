import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import {
  Search,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Layers,
  HelpCircle,
  FileText,
  RotateCcw,
  Lock,
  Copy,
  Check,
} from 'lucide-react';
import { trackGrievance } from '../../lib/api/endpoints';
import { ApiError } from '../../lib/errors/api-error';
import {
  GrievanceTrackingResponse,
  ConsumerTimelineEvent,
  GrievanceStatus,
} from '../../types/grievance';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { Badge } from '../../components/ui/Badge';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_REGEX = /^trk_[A-Za-z0-9_-]{43}$/;

type TrackingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Stage definitions for the 4-step consumer progress stepper.
 */
interface StepperStep {
  id: string;
  label: string;
  description: string;
}

const STEPS: StepperStep[] = [
  { id: 'received', label: 'Received', description: 'Intake recorded' },
  { id: 'triaged', label: 'Auto-Triaged', description: 'AI classification' },
  { id: 'review', label: 'Specialist review (if needed)', description: 'Human evaluation' },
  { id: 'resolved', label: 'Resolved', description: 'Final determination' },
];

/**
 * Maps the backend grievance status to the active progress step (0-3)
 * via an exhaustive switch over GrievanceStatus.
 */
function getActiveStepIndex(status: GrievanceStatus): number {
  switch (status) {
    case 'PENDING_REVIEW':
      return 1; // Stage 2 of 4: Auto-Triaged (awaiting human specialist)
    case 'AUTO_ROUTED':
      return 1; // Stage 2 of 4: Auto-Triaged (automated routing complete)
    case 'UNDER_REVIEW':
      return 2; // Stage 3 of 4: Specialist review (if needed)
    case 'APPROVED':
    case 'OVERRIDDEN':
    case 'REJECTED':
    case 'DISMISSED':
      return 3; // Stage 4 of 4: Resolved / Closed
    default: {
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

/**
 * Returns the contextual label for the step based on grievance status.
 * For DISMISSED or REJECTED cases, renders "Closed" rather than "Resolved".
 */
function getStepLabel(stepIndex: number, status?: GrievanceStatus): string {
  if (stepIndex === 3) {
    if (status === 'DISMISSED' || status === 'REJECTED') {
      return 'Closed';
    }
    return 'Resolved';
  }
  return STEPS[stepIndex]?.label ?? 'Received';
}

/**
 * Stage badge styling and icon mapping for sanitized consumer timeline events.
 */
function getStageMetadata(stage: string, _status?: GrievanceStatus) {
  switch (stage) {
    case 'SUBMITTED':
      return {
        icon: FileText,
        colorClass: 'text-slate-700 bg-slate-100 border-slate-300',
        badgeVariant: 'default' as const,
        label: 'Intake Received',
      };
    case 'AUTOMATED_TRIAGE':
      return {
        icon: CheckCircle2,
        colorClass: 'text-teal-700 bg-teal-50 border-teal-300',
        badgeVariant: 'success' as const,
        label: 'Automated Routing',
      };
    case 'REVIEW_APPROVED':
      return {
        icon: CheckCircle2,
        colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300',
        badgeVariant: 'success' as const,
        label: 'Review Approved',
      };
    case 'REVIEW_OVERRIDDEN':
      return {
        icon: Layers,
        colorClass: 'text-sky-700 bg-sky-50 border-sky-300',
        badgeVariant: 'info' as const,
        label: 'Classification Adjusted',
      };
    case 'REVIEW_REJECTED':
      return {
        icon: AlertCircle,
        colorClass: 'text-rose-700 bg-rose-50 border-rose-300',
        badgeVariant: 'danger' as const,
        label: 'Intake Rejected',
      };
    default:
      return {
        icon: Clock,
        colorClass: 'text-slate-700 bg-slate-100 border-slate-300',
        badgeVariant: 'default' as const,
        label: 'Status Update',
      };
  }
}

/**
 * Framer Motion physics for chronological timeline staggered cascading.
 */
const listVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 30,
    },
  },
};

/**
 * TrackGrievancePage — Public complaint status and timeline tracking.
 *
 * Security Guarantees:
 * - Submits credentials strictly via POST body over TLS (/api/grievances/track).
 * - Never reflects secret in GET requests, query params, or browser storage.
 * - Uniform error messages prevent reference enumeration.
 * - Rate limiting (429) handled gracefully without leaking internal counts.
 */
export const TrackGrievancePage: React.FC = () => {
  const [referenceId, setReferenceId] = useState('');
  const [trackingSecret, setTrackingSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [state, setState] = useState<TrackingState>('idle');
  const [trackingData, setTrackingData] = useState<GrievanceTrackingResponse | null>(null);
  const [clientErrors, setClientErrors] = useState<{ referenceId?: string; trackingSecret?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // Security: clear in-memory secret and cancel requests on unmount
  useEffect(() => {
    return () => {
      setTrackingSecret('');
      setTrackingData(null);
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const validate = (): boolean => {
    const errors: { referenceId?: string; trackingSecret?: string } = {};
    const trimmedId = referenceId.trim();
    const trimmedSecret = trackingSecret.trim();

    if (!trimmedId) {
      errors.referenceId = 'Reference ID is required.';
    } else if (!UUID_REGEX.test(trimmedId)) {
      errors.referenceId = 'Reference ID must be a valid UUID (e.g. 123e4567-e89b-12d3-a456-426614174000).';
    }

    if (!trimmedSecret) {
      errors.trackingSecret = 'Tracking Secret is required.';
    } else if (!SECRET_REGEX.test(trimmedSecret)) {
      errors.trackingSecret = 'Tracking secret must start with trk_ followed by 43 URL-safe characters.';
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    setState('loading');

    try {
      const response = await trackGrievance(
        {
          referenceId: referenceId.trim(),
          trackingSecret: trackingSecret.trim(),
        },
        abortRef.current.signal
      );

      setTrackingData(response);
      setState('success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setServerError('Complaint not found or invalid tracking secret. Please verify your reference ID and tracking secret.');
        } else if (err.status === 429) {
          setServerError('Too many tracking attempts. Please wait a moment before trying again.');
        } else if (err.status === 400) {
          setServerError('Invalid tracking request format. Please check your credentials.');
        } else {
          setServerError(err.message || 'Unable to track complaint. Please try again later.');
        }
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setServerError('Network error. Please check your connection and try again.');
      }
      setState('error');
    }
  };

  const handleReset = () => {
    setTrackingData(null);
    setTrackingSecret('');
    setReferenceId('');
    setClientErrors({});
    setServerError(null);
    setCopied(false);
    setState('idle');
  };

  const handleCopyId = async () => {
    if (!trackingData?.referenceId) return;
    try {
      await navigator.clipboard.writeText(trackingData.referenceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy reference ID:', err);
    }
  };

  const formatDate = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const activeStepIndex = trackingData
    ? getActiveStepIndex(trackingData.status)
    : 0;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900">
      <main id="main-content" className="flex-1 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 md:py-12 w-full">
        {/* Navigation back */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:text-teal-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded px-2.5 py-1 bg-white border border-slate-200 shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Return to home
          </Link>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-teal-800 text-xs font-semibold mb-3 border border-teal-200 shadow-2xs">
            <Lock className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
            <span>Secure Case Lookup</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-sans">
            Track Complaint Status
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
            Enter the Reference ID and one-time Tracking Secret provided when you submitted your complaint.
          </p>
        </div>

        {/* ── Tracking Search Form ────────────────────────────────────────────── */}
        {state !== 'success' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <form onSubmit={handleTrack} noValidate aria-label="Complaint tracking search form">
              {/* Server error alert */}
              {serverError && (
                <div
                  ref={errorRef}
                  role="alert"
                  aria-live="assertive"
                  tabIndex={-1}
                  className="mb-6 rounded-xl border border-semantic-danger-border bg-semantic-danger-bg p-4 shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-semantic-danger-fg shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h2 className="text-sm font-bold text-semantic-danger-fg">
                        Lookup Unsuccessful
                      </h2>
                      <p className="text-xs sm:text-sm text-semantic-danger-fg mt-0.5 leading-relaxed">
                        {serverError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {/* Reference ID Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="referenceId" required className="text-sm font-bold text-slate-900">
                      Reference ID (UUID)
                    </Label>
                    <span className="text-[11px] font-mono text-slate-500">Format: 36 chars</span>
                  </div>
                  <p id="referenceId-hint" className="text-xs text-slate-600 mb-2">
                    The 36-character identifier assigned on your submission receipt.
                  </p>
                  <Input
                    id="referenceId"
                    type="text"
                    value={referenceId}
                    onChange={(e) => {
                      setReferenceId(e.target.value);
                      if (clientErrors.referenceId) {
                        setClientErrors((prev) => ({ ...prev, referenceId: undefined }));
                      }
                    }}
                    placeholder="e.g. 7b1d9c24-5e3a-4a2e-8a12-872f9d8a5431"
                    aria-describedby="referenceId-hint"
                    isInvalid={Boolean(clientErrors.referenceId)}
                    errorMessage={clientErrors.referenceId}
                    disabled={state === 'loading'}
                    autoComplete="off"
                    autoFocus
                    className="font-mono text-sm"
                  />
                </div>

                {/* Tracking Secret Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="trackingSecret" required className="text-sm font-bold text-slate-900">
                      One-Time Tracking Secret
                    </Label>
                    <span className="text-[11px] font-mono text-slate-500">Format: trk_... (47 chars)</span>
                  </div>
                  <p id="trackingSecret-hint" className="text-xs text-slate-600 mb-2">
                    The 47-character secret shown exclusively on your initial submission receipt.
                  </p>
                  <div className="relative">
                    <Input
                      id="trackingSecret"
                      type={showSecret ? 'text' : 'password'}
                      value={trackingSecret}
                      onChange={(e) => {
                        setTrackingSecret(e.target.value);
                        if (clientErrors.trackingSecret) {
                          setClientErrors((prev) => ({ ...prev, trackingSecret: undefined }));
                        }
                      }}
                      placeholder="trk_..."
                      aria-describedby="trackingSecret-hint"
                      isInvalid={Boolean(clientErrors.trackingSecret)}
                      errorMessage={clientErrors.trackingSecret}
                      disabled={state === 'loading'}
                      autoComplete="off"
                      className="pr-12 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => !s)}
                      aria-label={showSecret ? 'Hide tracking secret' : 'Show tracking secret'}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded p-1.5 transition-colors"
                    >
                      {showSecret ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Security info box */}
              <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-slate-700 leading-relaxed">
                  <strong className="text-slate-900 font-semibold">Privacy Protected:</strong> Your tracking credentials
                  are transmitted over encrypted HTTPS directly to the backend. The tracking timeline exposes only
                  customer-safe status updates, never disclosing personal details, reviewer notes, or internal staff accounts.
                </p>
              </div>

              {/* Submit CTA */}
              <div className="mt-6 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={state === 'loading'}
                  disabled={state === 'loading'}
                  leftIcon={<Search className="w-4 h-4" aria-hidden="true" />}
                  className="font-bold shadow-xs px-6"
                >
                  {state === 'loading' ? 'Verifying…' : 'Track Complaint'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ── Tracking Result View ────────────────────────────────────────────── */}
        {state === 'success' && trackingData && (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
                <div className="max-w-full overflow-hidden">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800 block">
                    Complaint Status Record
                  </span>
                  <div className="flex items-center gap-2 mt-1 max-w-full">
                    <h2
                      title={trackingData.referenceId}
                      className="text-base sm:text-xl font-bold text-slate-900 font-mono truncate break-all"
                    >
                      {trackingData.referenceId}
                    </h2>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      title={copied ? 'Reference ID copied!' : 'Copy Reference ID'}
                      aria-label={copied ? 'Reference ID copied to clipboard' : 'Copy Reference ID to clipboard'}
                      className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-2xs transition-all shrink-0 focus-visible:outline-teal-600"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <Copy className="w-4 h-4 text-slate-500" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusIndicator status={trackingData.status} />
                </div>
              </div>

              {/* Details grid - responsive 1-col on mobile, 3-col on desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Assigned Product
                  </dt>
                  <dd className="text-sm font-bold text-slate-900 mt-1 font-sans">
                    {trackingData.assignedCategory}
                  </dd>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Triage Priority
                  </dt>
                  <dd className="mt-1">
                    <StatusIndicator priority={trackingData.priority} />
                  </dd>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Submitted Date
                  </dt>
                  <dd className="text-sm font-semibold text-slate-900 mt-1 tabular-nums font-mono">
                    <time dateTime={trackingData.submittedAt}>{formatDate(trackingData.submittedAt)}</time>
                  </dd>
                </div>
              </div>
            </div>

            {/* ── Progress Stepper Card ────────────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-600" aria-hidden="true" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Resolution Progress
                  </h3>
                </div>
                <span className="text-xs font-mono font-semibold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                  Stage {Math.min(activeStepIndex + 1, 4)} of 4: {getStepLabel(activeStepIndex, trackingData.status)}
                </span>
              </div>

              <ol aria-label="Complaint Progress Stepper" className="flex flex-col sm:flex-row sm:items-center w-full">
                {STEPS.map((step, idx) => {
                  const isCompleted = idx < activeStepIndex;
                  const isCurrent = idx === activeStepIndex;
                  const isLast = idx === STEPS.length - 1;
                  const isDismissed = trackingData.status === 'DISMISSED';
                  const stepLabel = idx === 3 && (isDismissed || trackingData.status === 'REJECTED') ? 'Closed' : step.label;

                  return (
                    <li
                      key={step.id}
                      className={`relative flex sm:flex-col sm:items-center flex-1 ${
                        !isLast ? 'pb-6 sm:pb-0' : ''
                      }`}
                    >
                      {/* Connector Line */}
                      {!isLast && (
                        <>
                          {/* Vertical connector on mobile */}
                          <div
                            className={`sm:hidden absolute left-4 top-8 -bottom-1 w-0.5 ${
                              isCompleted ? 'bg-teal-600' : 'bg-slate-200'
                            }`}
                            aria-hidden="true"
                          />
                          {/* Horizontal connector on desktop */}
                          <div
                            className={`hidden sm:block absolute top-4 left-1/2 w-full h-0.5 -z-0 ${
                              isCompleted ? 'bg-teal-600' : 'bg-slate-200'
                            }`}
                            aria-hidden="true"
                          />
                        </>
                      )}

                      {/* Step Circle & Label Node */}
                      <div className="flex sm:flex-col items-center gap-3 sm:gap-2 z-10 w-full sm:text-center">
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 transition-all ${
                            isCompleted
                              ? 'bg-teal-600 text-white shadow-xs'
                              : isCurrent
                              ? isDismissed
                                ? 'bg-slate-100 text-slate-800 border-2 border-slate-500 ring-4 ring-slate-400/20 shadow-xs'
                                : 'bg-teal-50 text-teal-700 border-2 border-teal-600 ring-4 ring-teal-500/15 shadow-xs'
                              : 'bg-slate-100 text-slate-500 border border-slate-300'
                          }`}
                        >
                          {isCompleted ? (
                            <Check className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>

                        <div className="flex flex-col sm:items-center">
                          <span
                            className={`text-xs font-bold ${
                              isCurrent
                                ? isDismissed
                                  ? 'text-slate-900 font-extrabold'
                                  : 'text-teal-900 font-extrabold'
                                : isCompleted
                                ? 'text-slate-900'
                                : 'text-slate-500'
                            }`}
                          >
                            {stepLabel}
                          </span>
                          <span
                            className={`text-[11px] font-mono ${
                              isCurrent
                                ? isDismissed
                                  ? 'text-slate-600 font-bold'
                                  : 'text-teal-700 font-bold'
                                : isCompleted
                                ? 'text-slate-500'
                                : 'text-slate-400'
                            }`}
                          >
                            {isDismissed && idx === 3
                              ? 'Closed'
                              : isCompleted
                              ? 'Complete'
                              : isCurrent
                              ? 'In Progress'
                              : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* ── Chronological Timeline Card ─────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between pb-6 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 font-sans">
                    Progress Timeline
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Chronological events recorded in the append-only audit trail.
                  </p>
                </div>
                <Badge variant="default" className="font-mono text-xs">
                  {trackingData.timeline.length} {trackingData.timeline.length === 1 ? 'Event' : 'Events'}
                </Badge>
              </div>

              {/* Timeline List */}
              <div className="mt-6 flow-root">
                {trackingData.timeline.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No progress events recorded yet.
                  </p>
                ) : (
                  <motion.ol
                    variants={listVariants}
                    initial="hidden"
                    animate="show"
                    className="relative border-l-2 border-slate-200 ml-3.5 space-y-8 py-2"
                  >
                    {trackingData.timeline.map((event: ConsumerTimelineEvent, index: number) => {
                      const meta = getStageMetadata(event.stage, event.status);
                      const IconComponent = meta.icon;
                      const isLatest = index === trackingData.timeline.length - 1;

                      return (
                        <motion.li
                          key={`${event.stage}-${event.timestamp}-${index}`}
                          variants={itemVariants}
                          className="ml-7 relative"
                        >
                          {/* Dot / Icon */}
                          <span
                            className={`absolute -left-[42px] top-4.5 flex h-7 w-7 items-center justify-center rounded-full border-2 ${meta.colorClass} shadow-xs bg-white`}
                            aria-hidden="true"
                          >
                            <IconComponent className="h-3.5 w-3.5" />
                          </span>

                          {/* Event content box */}
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 shadow-xs hover:border-slate-300 transition-colors">
                            {/* Top row: Left (Badge + Title) | Right (Current Badge + Timestamp) */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 pb-2 border-b border-slate-200/60">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={meta.badgeVariant}>
                                  {meta.label}
                                </Badge>
                                {event.title && (
                                  <h4 className="text-sm font-bold text-slate-900 font-sans">
                                    {event.title}
                                  </h4>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 sm:self-center">
                                {isLatest && (
                                  <Badge variant="info">Current</Badge>
                                )}
                                <time
                                  dateTime={event.timestamp}
                                  className="text-xs text-slate-600 tabular-nums font-mono"
                                >
                                  {formatDate(event.timestamp)}
                                </time>
                              </div>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                              {event.description}
                            </p>
                          </div>
                        </motion.li>
                      );
                    })}
                  </motion.ol>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleReset}
                leftIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
                className="font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
              >
                Track Another Complaint
              </Button>
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900">
                  Return to Home
                </Button>
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-auto py-8 text-center print:hidden bg-white">
        <p className="text-xs text-slate-600 px-4">
          CivicResolve AI anonymous tracking allows citizens to follow complaint resolution without logging in.
          All inquiries are authenticated through one-time cryptographic secrets.
        </p>
      </footer>
    </div>
  );
};
