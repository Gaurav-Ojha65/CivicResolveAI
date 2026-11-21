import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Eye, EyeOff, KeyRound, Search } from 'lucide-react';
import { trackGrievance } from '../../lib/api/endpoints';
import { ApiError } from '../../lib/errors/api-error';
import {
  GrievanceTrackingResponse,
  GrievanceStatus,
} from '../../types/grievance';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_REGEX = /^trk_[A-Za-z0-9_-]{43}$/;

type TrackingState = 'idle' | 'loading' | 'success' | 'error';

const progressByStatus: Record<GrievanceStatus, string> = {
  PENDING_REVIEW: 'Your case is awaiting a reviewer.',
  AUTO_ROUTED: 'Your case was routed automatically.',
  APPROVED: 'A reviewer confirmed the routing.',
  OVERRIDDEN: 'A reviewer changed the category or priority.',
  REJECTED: 'A reviewer closed the case without routing it further.',
};

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

  const resetFocus = useRef(false);
  const referenceRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (state === 'success') resultRef.current?.focus();
    if (serverError) errorRef.current?.focus();
    if (state === 'idle' && resetFocus.current) {
      resetFocus.current = false;
      referenceRef.current?.focus();
    }
  }, [state, serverError]);

  useEffect(() => () => abortRef.current?.abort(), []);

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
      const field = !UUID_REGEX.test(referenceId.trim()) ? 'referenceId' : 'trackingSecret';
      document.getElementById(field)?.focus();
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState('loading');

    try {
      const response = await trackGrievance(
        {
          referenceId: referenceId.trim(),
          trackingSecret: trackingSecret.trim(),
        },
        controller.signal
      );

      if (controller.signal.aborted) return;
      setTrackingSecret('');
      setShowSecret(false);
      setTrackingData(response);
      setState('success');
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setServerError('Complaint not found or invalid tracking secret. Please verify your reference ID and tracking secret.');
        } else if (err.status === 429) {
          setServerError('Too many tracking attempts. Please wait a moment before trying again.');
        } else if (err.status === 400) {
          setServerError('Invalid tracking request format. Please check your credentials.');
        } else {
          setServerError('Unable to track complaint. Please try again later.');
        }
      } else {
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
    setCopyFailed(false);
    setShowSecret(false);
    resetFocus.current = true;
    setState('idle');
  };

  const handleCopyId = async () => {
    if (!trackingData?.referenceId) return;
    try {
      await navigator.clipboard.writeText(trackingData.referenceId);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
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

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl px-5 py-9 sm:px-8 sm:py-12">
      <h1 className="font-serif text-4xl tracking-tight text-ink sm:text-5xl">Track complaint status</h1>
      {state !== 'success' && <>
        <p className="mb-7 mt-3 max-w-xl text-base leading-relaxed text-ink-muted">Enter both details from your submission receipt to see your case status and recorded updates.</p>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <form onSubmit={handleTrack} noValidate aria-busy={state === 'loading'} aria-label="Complaint tracking search form"
            className="min-w-0 space-y-5 rounded-xl border border-line bg-white p-5 sm:p-8">
            <h2 className="flex items-center gap-2 text-xl font-semibold"><Search size={20} className="text-teal-trust" aria-hidden="true" />Look up a case</h2>
            {serverError && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-semantic-danger-border bg-semantic-danger-bg p-4 text-sm text-semantic-danger-fg">{serverError}</div>}
            <div>
              <Label htmlFor="referenceId" required>Reference ID</Label>
              <Input ref={referenceRef} id="referenceId" value={referenceId} required autoComplete="off" spellCheck={false} autoCapitalize="none"
                helperText="The 36-character identifier on your receipt." errorMessage={clientErrors.referenceId}
                disabled={state === 'loading'} className="mt-2 font-mono"
                onChange={event => { setReferenceId(event.target.value); setClientErrors(previous => ({ ...previous, referenceId: undefined })); }} />
            </div>
            <div>
              <Label htmlFor="trackingSecret" required>One-time tracking secret</Label>
              <div className="relative mt-2">
                <Input id="trackingSecret" value={trackingSecret} required type={showSecret ? 'text' : 'password'}
                  autoComplete="off" spellCheck={false} autoCapitalize="none" helperText="The secret begins with trk_ and is shown when you submit."
                  disabled={state === 'loading'} errorMessage={clientErrors.trackingSecret} className="pr-12 font-mono"
                  onChange={event => { setTrackingSecret(event.target.value); setClientErrors(previous => ({ ...previous, trackingSecret: undefined })); }} />
                <button type="button" disabled={state === 'loading'} aria-pressed={showSecret}
                  aria-label={showSecret ? 'Hide tracking secret' : 'Show tracking secret'} onClick={() => setShowSecret(value => !value)}
                  className="absolute right-0 top-0 grid size-10 place-items-center rounded-md text-ink-muted hover:text-teal-trust">
                  {showSecret ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <Button type="submit" isLoading={state === 'loading'}>{state === 'loading' ? 'Looking up case…' : 'Track complaint'}</Button>
          </form>
          <aside className="rounded-xl border border-line bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound size={18} className="text-teal-trust" aria-hidden="true" />Your tracking credentials</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">Anyone with both details can view the case status. Keep the receipt private. If you lose the secret, this service cannot recover it.</p>
          </aside>
        </div>
      </>}
      {state === 'success' && trackingData && <div className="mt-7 space-y-5">
        <section className="rounded-xl border border-line bg-white p-5 sm:p-8">
          <h2 ref={resultRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight">Case summary</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2"><StatusIndicator status={trackingData.status} /><StatusIndicator priority={trackingData.priority} /></div>
          <p className="mt-3 text-base">{progressByStatus[trackingData.status]}</p>
          <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-muted">Reference ID</dt><dd className="mt-1 flex items-center gap-2">
              <span className="break-all font-mono">{trackingData.referenceId}</span>
              <button type="button" onClick={handleCopyId} aria-label={copied ? 'Reference ID copied' : 'Copy reference ID'}
                className="grid size-9 shrink-0 place-items-center rounded-md text-teal-trust hover:bg-canvas">{copied ? <Check size={16}/> : <Copy size={16}/>}</button>
            </dd>{copyFailed && <dd role="alert" className="text-semantic-danger-fg">Copy failed. Select and copy the reference manually.</dd>}</div>
            <div><dt className="text-ink-muted">Assigned category</dt><dd className="mt-1 font-medium">{trackingData.assignedCategory || 'Unavailable'}</dd></div>
            <div><dt className="text-ink-muted">Submitted</dt><dd className="mt-1"><time dateTime={trackingData.submittedAt}>{formatDate(trackingData.submittedAt)}</time></dd></div>
            <div><dt className="text-ink-muted">Last updated</dt><dd className="mt-1"><time dateTime={trackingData.updatedAt}>{formatDate(trackingData.updatedAt)}</time></dd></div>
          </dl>
        </section>
        <section className="rounded-xl border border-line bg-white p-5 sm:p-8">
          <h2 className="text-xl font-semibold">Case history</h2>
          {trackingData.timeline.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No progress events recorded yet.</p>
            : <ol aria-label="Recorded updates" className="mt-5 divide-y divide-line border-t border-line">
              {trackingData.timeline.map((event, index) => <li key={`${event.timestamp}-${index}`} className="grid gap-1 py-4 sm:grid-cols-[1fr_13rem] sm:gap-4">
                <div><h3 className="font-semibold">{event.title}</h3><p className="mt-1 text-sm text-ink-muted">{event.description}</p></div>
                <time dateTime={event.timestamp} className="text-xs leading-6 text-ink-muted sm:text-right">{formatDate(event.timestamp)}</time>
              </li>)}
            </ol>}
        </section>
        <div className="flex flex-wrap items-center gap-4"><Button variant="secondary" onClick={handleReset}>Track another complaint</Button><Link to="/" className="font-semibold text-teal-trust underline">Return to home</Link></div>
      </div>}
    </main>
  );
};
