import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  ShieldCheck,
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
 * Stage badge styling and icon mapping for sanitized consumer timeline events.
 */
function getStageMetadata(stage: string, _status?: GrievanceStatus) {
  switch (stage) {
    case 'SUBMITTED':
      return {
        icon: FileText,
        colorClass: 'text-ink-muted bg-canvas border-border',
        badgeVariant: 'default' as const,
        label: 'Intake Received',
      };
    case 'AUTOMATED_TRIAGE':
      return {
        icon: CheckCircle2,
        colorClass: 'text-teal-trust bg-teal-trust/10 border-teal-trust/30',
        badgeVariant: 'success' as const,
        label: 'Automated Routing',
      };
    case 'REVIEW_APPROVED':
      return {
        icon: CheckCircle2,
        colorClass: 'text-semantic-success-fg bg-semantic-success-bg border-semantic-success-border',
        badgeVariant: 'success' as const,
        label: 'Review Approved',
      };
    case 'REVIEW_OVERRIDDEN':
      return {
        icon: Layers,
        colorClass: 'text-semantic-info-fg bg-semantic-info-bg border-semantic-info-border',
        badgeVariant: 'info' as const,
        label: 'Classification Adjusted',
      };
    case 'REVIEW_REJECTED':
      return {
        icon: AlertCircle,
        colorClass: 'text-semantic-danger-fg bg-semantic-danger-bg border-semantic-danger-border',
        badgeVariant: 'danger' as const,
        label: 'Intake Rejected',
      };
    default:
      return {
        icon: Clock,
        colorClass: 'text-ink-muted bg-canvas border-border',
        badgeVariant: 'default' as const,
        label: 'Status Update',
      };
  }
}

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
    setState('idle');
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

  return (
    <>
      <main id="main-content" className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Navigation back */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted hover:text-teal-trust transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded px-2 py-1 bg-surface border border-border"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Return to home
          </Link>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-trust/10 text-teal-trust text-xs font-semibold mb-3 border border-teal-trust/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Encrypted Case Status Retrieval</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-ink-deep tracking-tight font-sans">
            Track Complaint Status
          </h1>
          <p className="mt-2 text-sm sm:text-base text-ink-muted leading-relaxed">
            Enter the Reference ID and one-time Tracking Secret provided when you submitted your complaint.
          </p>
        </div>

        {/* ── Tracking Search Form ────────────────────────────────────────────── */}
        {state !== 'success' && (
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-card">
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
                    <Label htmlFor="referenceId" required className="text-sm font-bold text-ink-deep">
                      Reference ID (UUID)
                    </Label>
                    <span className="text-[11px] font-mono text-ink-muted">Format: 36 chars</span>
                  </div>
                  <p id="referenceId-hint" className="text-xs text-ink-muted mb-2">
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
                    <Label htmlFor="trackingSecret" required className="text-sm font-bold text-ink-deep">
                      One-Time Tracking Secret
                    </Label>
                    <span className="text-[11px] font-mono text-ink-muted">Format: trk_... (47 chars)</span>
                  </div>
                  <p id="trackingSecret-hint" className="text-xs text-ink-muted mb-2">
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
                      className="absolute right-3 top-2.5 text-ink-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded p-1.5 transition-colors"
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
              <div className="mt-6 p-4 rounded-xl bg-canvas border border-border flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-teal-trust shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-ink-muted leading-relaxed">
                  <strong className="text-ink font-semibold">Privacy Protected:</strong> Your tracking credentials
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
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-7 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-border">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-trust block">
                    Complaint Status Record
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-ink-deep font-mono break-all mt-1">
                    {trackingData.referenceId}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIndicator status={trackingData.status} />
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-5">
                <div className="p-3.5 rounded-xl bg-canvas border border-border/80">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                    Assigned Product
                  </dt>
                  <dd className="text-sm font-bold text-ink-deep mt-1 font-sans">
                    {trackingData.assignedCategory}
                  </dd>
                </div>
                <div className="p-3.5 rounded-xl bg-canvas border border-border/80">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                    Triage Priority
                  </dt>
                  <dd className="mt-1">
                    <StatusIndicator priority={trackingData.priority} />
                  </dd>
                </div>
                <div className="p-3.5 rounded-xl bg-canvas border border-border/80">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                    Submitted Date
                  </dt>
                  <dd className="text-xs sm:text-sm font-medium text-ink-deep mt-1 tabular-nums">
                    <time dateTime={trackingData.submittedAt}>{formatDate(trackingData.submittedAt)}</time>
                  </dd>
                </div>
              </div>
            </div>

            {/* Timeline Card */}
            <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-card">
              <div className="flex items-center justify-between pb-6 border-b border-border">
                <div>
                  <h3 className="text-lg font-bold text-ink-deep font-sans">
                    Progress Timeline
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Chronological events recorded in the append-only audit trail.
                  </p>
                </div>
                <Badge variant="default" className="font-mono">
                  {trackingData.timeline.length} {trackingData.timeline.length === 1 ? 'Event' : 'Events'}
                </Badge>
              </div>

              {/* Timeline Items */}
              <div className="mt-6 flow-root">
                {trackingData.timeline.length === 0 ? (
                  <p className="text-sm text-ink-muted py-6 text-center">
                    No progress events recorded yet.
                  </p>
                ) : (
                  <ol className="relative border-l-2 border-slate-200 ml-3.5 space-y-8 py-2">
                    {trackingData.timeline.map((event: ConsumerTimelineEvent, index: number) => {
                      const meta = getStageMetadata(event.stage, event.status);
                      const IconComponent = meta.icon;
                      const isLatest = index === trackingData.timeline.length - 1;

                      return (
                        <li key={`${event.stage}-${event.timestamp}-${index}`} className="ml-7">
                          {/* Dot / Icon */}
                          <span
                            className={`absolute -left-3.5 flex h-7 w-7 items-center justify-center rounded-full border-2 ${meta.colorClass} shadow-xs`}
                            aria-hidden="true"
                          >
                            <IconComponent className="h-3.5 w-3.5" />
                          </span>

                          {/* Event content box */}
                          <div className="rounded-xl border border-border bg-canvas/70 p-4 sm:p-5 shadow-xs hover:border-slate-300 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={meta.badgeVariant}>
                                  {meta.label}
                                </Badge>
                                {event.title && (
                                  <h4 className="text-sm font-bold text-ink-deep font-sans">
                                    {event.title}
                                  </h4>
                                )}
                                {isLatest && (
                                  <Badge variant="info">Current</Badge>
                                )}
                              </div>
                              <time
                                dateTime={event.timestamp}
                                className="text-xs text-ink-muted tabular-nums font-mono"
                              >
                                {formatDate(event.timestamp)}
                              </time>
                            </div>
                            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                              {event.description}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
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
                className="font-semibold border-border hover:bg-slate-50"
              >
                Track Another Complaint
              </Button>
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-ink-muted hover:text-ink-deep">
                  Return to Home
                </Button>
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8 text-center print:hidden bg-surface">
        <p className="text-xs text-ink-muted px-4">
          CivicResolve AI anonymous tracking allows citizens to follow complaint resolution without logging in.
          All inquiries are authenticated through one-time cryptographic secrets.
        </p>
      </footer>
    </>
  );
};
