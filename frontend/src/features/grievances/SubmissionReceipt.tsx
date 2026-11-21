import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Copy,
  Check,
  Printer,
  ShieldCheck,
  Key,
  AlertTriangle,
  ArrowRight,
  Lock,
  Download,
} from 'lucide-react';
import { GrievanceResponse, GrievanceSubmissionResponse } from '../../types/grievance';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { Button } from '../../components/ui/Button';
import { Divider } from '../../components/ui/Divider';

interface SubmissionReceiptProps {
  result: GrievanceSubmissionResponse | GrievanceResponse;
}

export const SubmissionReceipt: React.FC<SubmissionReceiptProps> = ({ result }) => {
  const receiptHeadingRef = React.useRef<HTMLHeadingElement | null>(null);

  React.useEffect(() => {
    receiptHeadingRef.current?.focus();
  }, []);

  const [secretVisible, setSecretVisible] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copyIdError, setCopyIdError] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copySecretError, setCopySecretError] = useState(false);
  const [downloadedReceipt, setDownloadedReceipt] = useState(false);

  const trackingSecret = 'trackingSecret' in result ? result.trackingSecret : undefined;
  const category =
    'assignedCategory' in result && result.assignedCategory
      ? result.assignedCategory
      : 'category' in result
      ? result.category || 'Unavailable'
      : 'Unavailable';

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(result.id);
      setCopiedId(true);
      setCopyIdError(false);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      setCopyIdError(true);
      setTimeout(() => setCopyIdError(false), 3000);
    }
  };

  const handleCopySecret = async () => {
    if (!trackingSecret) return;
    try {
      await navigator.clipboard.writeText(trackingSecret);
      setCopiedSecret(true);
      setCopySecretError(false);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      setCopySecretError(true);
      setTimeout(() => setCopySecretError(false), 3000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  /** Generate and trigger download of a private plain-text receipt. */
  const handleDownloadReceipt = () => {
    const submittedFormatted = formatDate(result.submittedAt);
    const lines = [
      '================================================================',
      '         CivicResolve AI — Demonstration complaint receipt',
      '================================================================',
      '',
      `Reference UUID        : ${result.id}`,
      `Submission Timestamp  : ${submittedFormatted}`,
      `Predicted Category    : ${category}`,
      `Priority (Preliminary): ${result.priority}`,
      `Review Status         : ${result.status}`,
      ...(trackingSecret
        ? [
            '',
            '--- One-Time Tracking Credential ---',
            `Tracking Token        : ${trackingSecret}`,
            '',
            'IMPORTANT: This one-time token will not be shown again.',
            'Store it securely to access your complaint status at:',
            new URL('/track', window.location.origin).href,
          ]
        : []),
      '',
      '--- Tracking Instructions ---',
      'Visit /track and enter your Reference UUID together with your',
      'one-time tracking token to view status updates.',
      '',
      '--- AI Disclosure ---',
      'Category and priority are preliminary routing decisions.',
      'Flagged cases enter the reviewer queue. Other cases can be routed automatically.',
      '',
      '================================================================',
      `Receipt generated     : ${new Date().toUTCString()}`,
      '================================================================',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CivicResolve_Receipt_${result.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedReceipt(true);
    setTimeout(() => setDownloadedReceipt(false), 3000);
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
    <div
      className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden"
    >
      <div className="bg-canvas border-b border-teal-trust/20 p-6 sm:p-7 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-teal-trust text-white flex items-center justify-center shrink-0 shadow-sm">
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2
            ref={receiptHeadingRef}
            tabIndex={-1}
            className="text-xl sm:text-2xl font-semibold text-ink-deep tracking-tight font-sans outline-none focus:ring-2 focus:ring-teal-600/30 rounded"
          >
            Your complaint has been received.
          </h2>
          <p role="status" aria-live="polite" className="text-sm text-ink-muted leading-relaxed">
            {trackingSecret ? 'Save your reference ID and tracking secret before leaving this page.' : 'Keep this receipt for your records.'}
          </p>
        </div>
      </div>

      {/* One-Time Tracking Secret Security Alert */}
      {trackingSecret && (
        <div className="mx-6 sm:mx-8 mt-6 p-4 sm:p-5 rounded-xl bg-semantic-warning-bg border border-semantic-warning-border shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-700 shrink-0">
              <AlertTriangle className="w-5 h-5 text-semantic-warning-fg" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-semantic-warning-fg">
                Save your tracking secret immediately
              </h3>
              <p className="text-xs text-ink leading-relaxed">
                This tracking secret is displayed <strong>only once</strong> and cannot be recovered or reissued if lost.
                You need both credentials to track your case. Printed and downloaded copies include the secret. Keep them private.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Fields (dl) styled as clean credentials vault */}
      <dl className="px-6 sm:px-8 py-6 space-y-5">
        {/* Reference ID */}
        <div className="p-4 rounded-xl bg-canvas text-ink border border-line shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <dt className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44 flex items-center gap-2">
            <Lock className="w-4 h-4 text-teal-trust" />
            <span>Reference</span>
          </dt>
          <dd className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xs sm:text-sm text-ink break-all select-all font-semibold">
              {result.id}
            </span>
            <button
              type="button"
              onClick={handleCopyId}
              aria-label={copiedId ? 'Reference copied' : 'Copy reference ID'}
              className="shrink-0 p-1.5 rounded-md print:hidden text-ink-muted hover:text-ink hover:bg-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
            >
              {copiedId ? (
                <Check className="w-4 h-4 text-teal-trust" aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
              <span className="sr-only">{copiedId ? 'Copied' : 'Copy'}</span>
            </button>
            {copiedId && (
              <span className="text-xs text-teal-trust font-medium font-mono" aria-live="polite">
                Copied!
              </span>
            )}
            {copyIdError && (
              <span className="text-xs text-semantic-danger-fg" role="alert">
                Copy failed. Please select and copy the reference manually.
              </span>
            )}
          </dd>
        </div>

        {/* Tracking Secret Field (when present) */}
        {trackingSecret && (
          <div className="p-4 rounded-xl bg-canvas text-ink border border-line shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <dt className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44 flex items-center gap-2">
              <Key className="w-4 h-4 text-teal-trust" />
              <span>Tracking Secret</span>
            </dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={secretVisible ? "break-all font-mono text-sm" : "hidden break-all font-mono text-sm print:inline"}>{trackingSecret}</span>
              {!secretVisible && <span aria-label="Secret hidden" className="text-ink-muted print:hidden">••••••••••••</span>}
              <button type="button" aria-pressed={secretVisible} onClick={() => setSecretVisible(value => !value)} className="min-h-9 px-2 text-sm font-semibold text-teal-trust underline print:hidden">{secretVisible ? "Hide secret" : "Show secret"}</button>
              <button
                type="button"
                onClick={handleCopySecret}
                aria-label={copiedSecret ? 'Tracking secret copied' : 'Copy tracking secret'}
                className="shrink-0 p-1.5 rounded-md print:hidden text-ink-muted hover:text-ink hover:bg-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
              >
                {copiedSecret ? (
                  <Check className="w-4 h-4 text-teal-trust" aria-hidden="true" />
                ) : (
                  <Copy className="w-4 h-4" aria-hidden="true" />
                )}
                <span className="sr-only">{copiedSecret ? 'Copied' : 'Copy'}</span>
              </button>
              {copiedSecret && (
                <span className="text-xs text-teal-trust font-medium font-mono" aria-live="polite">
                  Copied!
                </span>
              )}
              {copySecretError && (
                <span className="text-xs text-semantic-danger-fg" role="alert">
                  Copy failed. Please select and copy manually.
                </span>
              )}
            </dd>
          </div>
        )}

        <div aria-hidden="true"><Divider /></div>

        {/* Submitted at */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-1">
          <dt className="text-xs font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44">
            Submitted
          </dt>
          <dd className="text-xs sm:text-sm text-ink font-medium tabular-nums">
            <time dateTime={result.submittedAt}>{formatDate(result.submittedAt)}</time>
          </dd>
        </div>

        <div aria-hidden="true"><Divider /></div>

        {/* Assigned category */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-1">
          <dt className="text-xs font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44">
            Category
          </dt>
          <dd className="text-xs sm:text-sm text-ink font-bold font-sans">
            {category}
          </dd>
        </div>

        <div aria-hidden="true"><Divider /></div>

        {/* Priority */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-1">
          <dt className="text-xs font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44">
            Priority
          </dt>
          <dd>
            <StatusIndicator priority={result.priority} />
          </dd>
        </div>

        <div aria-hidden="true"><Divider /></div>

        {/* Review Status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-1">
          <dt className="text-xs font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44">
            Review status
          </dt>
          <dd>
            <StatusIndicator status={result.status} />
          </dd>
        </div>
      </dl>

      {/* Explain the scope of the recorded routing decision. */}
      <div className="mx-6 sm:mx-8 mb-6 p-4 rounded-xl bg-canvas border border-border">
        <p className="text-xs text-ink-muted leading-relaxed">
          The category and priority describe how this case was routed. Flagged cases enter the reviewer queue. These updates cannot confirm the outcome of a financial dispute.
        </p>
      </div>

      {/* Action Controls */}
      <div className="px-6 sm:px-8 pb-7 flex flex-wrap gap-3 print:hidden border-t border-border pt-5 bg-canvas/30">
        {trackingSecret && (
          <Link to="/track" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-trust px-3 text-sm font-semibold text-white hover:bg-teal-trust-hover">Track complaint progress <ArrowRight size={16} aria-hidden="true" /></Link>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleDownloadReceipt}
          leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
          className="border-border hover:bg-slate-50 font-semibold"
        >
          {downloadedReceipt ? 'Downloaded!' : 'Download receipt (.txt)'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handlePrint}
          leftIcon={<Printer className="w-4 h-4" aria-hidden="true" />}
          className="border-border hover:bg-slate-50 font-semibold"
        >
          Print / Save
        </Button>
        <Link to="/" className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-teal-trust underline">Return to home</Link>
      </div>
    </div>
  );
};
