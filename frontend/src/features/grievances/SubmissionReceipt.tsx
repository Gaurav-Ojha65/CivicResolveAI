import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Copy,
  Check,
  Printer,
  Home,
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

/**
 * SubmissionReceipt — secure fintech credential vault & intake confirmation.
 *
 * Guarantees:
 * - Exactly one instance of result.id and trackingSecret in DOM for testing fidelity
 * - Secure credential vault card styling with checkmarks and alerts
 * - Clear copy actions with accessibility announcements
 * - Print formatting with print:hidden action bar
 */
export const SubmissionReceipt: React.FC<SubmissionReceiptProps> = ({ result }) => {
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
      ? result.category
      : 'General Inquiry';

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

  /** Generate and trigger download of a plain-text compliance receipt. */
  const handleDownloadReceipt = () => {
    const submittedFormatted = formatDate(result.submittedAt);
    const lines = [
      '================================================================',
      '         CivicResolve AI — Official Complaint Receipt',
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
            '  https://civicresolve.ai/track',
          ]
        : []),
      '',
      '--- Tracking Instructions ---',
      'Visit /track and enter your Reference UUID together with your',
      'one-time tracking token to view status updates.',
      '',
      '--- AI Disclosure ---',
      'The Predicted Category and Priority shown above are preliminary',
      'uncalibrated estimates produced by an automated NLP pipeline.',
      'They are NOT a final legal determination. All classifications are',
      'subject to mandatory human reviewer adjudication.',
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
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden"
    >
      {/* Verified Header Band */}
      <div className="bg-gradient-to-r from-teal-950/10 via-teal-900/5 to-transparent border-b border-teal-trust/20 p-6 sm:p-7 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-teal-trust text-white flex items-center justify-center shrink-0 shadow-sm">
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-trust/10 text-teal-trust text-[10px] font-bold tracking-wider uppercase border border-teal-trust/20">
            Cryptographically Recorded
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink-deep tracking-tight font-sans">
            Your complaint has been received.
          </h2>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
            Your submission has been recorded. Save your Reference ID and Tracking Secret below to check status updates.
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
                You will need both your Reference ID and Tracking Secret to access the public tracking timeline.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Fields (dl) styled as clean credentials vault */}
      <dl className="px-6 sm:px-8 py-6 space-y-5">
        {/* Reference ID */}
        <div className="p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <dt className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 shrink-0 sm:w-44 flex items-center gap-2">
            <Lock className="w-4 h-4 text-teal-400" />
            <span>Reference</span>
          </dt>
          <dd className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xs sm:text-sm text-teal-300 break-all select-all font-semibold">
              {result.id}
            </span>
            <button
              type="button"
              onClick={handleCopyId}
              aria-label={copiedId ? 'Reference copied' : 'Copy reference ID'}
              className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
            >
              {copiedId ? (
                <Check className="w-4 h-4 text-teal-400" aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
              <span className="sr-only">{copiedId ? 'Copied' : 'Copy'}</span>
            </button>
            {copiedId && (
              <span className="text-xs text-teal-400 font-medium font-mono" aria-live="polite">
                Copied!
              </span>
            )}
            {copyIdError && (
              <span className="text-xs text-rose-400" role="alert">
                Copy failed. Please select and copy the reference manually.
              </span>
            )}
          </dd>
        </div>

        {/* Tracking Secret Field (when present) */}
        {trackingSecret && (
          <div className="p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <dt className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 shrink-0 sm:w-44 flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span>Tracking Secret</span>
            </dt>
            <dd className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-xs sm:text-sm text-amber-300 break-all select-all font-semibold">
                {trackingSecret}
              </span>
              <button
                type="button"
                onClick={handleCopySecret}
                aria-label={copiedSecret ? 'Tracking secret copied' : 'Copy tracking secret'}
                className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
              >
                {copiedSecret ? (
                  <Check className="w-4 h-4 text-teal-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-4 h-4" aria-hidden="true" />
                )}
                <span className="sr-only">{copiedSecret ? 'Copied' : 'Copy'}</span>
              </button>
              {copiedSecret && (
                <span className="text-xs text-teal-400 font-medium font-mono" aria-live="polite">
                  Copied!
                </span>
              )}
              {copySecretError && (
                <span className="text-xs text-rose-400" role="alert">
                  Copy failed. Please select and copy manually.
                </span>
              )}
            </dd>
          </div>
        )}

        <Divider />

        {/* Submitted at */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-1">
          <dt className="text-xs font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44">
            Submitted
          </dt>
          <dd className="text-xs sm:text-sm text-ink font-medium tabular-nums">
            <time dateTime={result.submittedAt}>{formatDate(result.submittedAt)}</time>
          </dd>
        </div>

        <Divider />

        {/* Assigned category */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-1">
          <dt className="text-xs font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44">
            Category
          </dt>
          <dd className="text-xs sm:text-sm text-ink font-bold font-sans">
            {category}
          </dd>
        </div>

        <Divider />

        {/* Priority */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-1">
          <dt className="text-xs font-bold uppercase tracking-wider text-ink-muted shrink-0 sm:w-44">
            Priority
          </dt>
          <dd>
            <StatusIndicator priority={result.priority} />
          </dd>
        </div>

        <Divider />

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

      {/* Regulatory Disclosure */}
      <div className="mx-6 sm:mx-8 mb-6 p-4 rounded-xl bg-canvas border border-border">
        <p className="text-xs text-ink-muted leading-relaxed">
          <strong className="text-ink font-semibold">Disclosure:</strong> This automated
          assessment is preliminary and does not represent a final human decision or
          guarantee of resolution. All classifications are subject to review by a
          trained reviewer before any final determination is made.
        </p>
      </div>

      {/* Action Controls */}
      <div className="px-6 sm:px-8 pb-7 flex flex-wrap gap-3 print:hidden border-t border-border pt-5 bg-canvas/30">
        {trackingSecret && (
          <Link to="/track">
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="font-bold shadow-xs"
              rightIcon={<ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />}
            >
              Track Complaint Progress
            </Button>
          </Link>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleDownloadReceipt}
          leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
          className="border-border hover:bg-slate-50 font-semibold"
        >
          {downloadedReceipt ? 'Downloaded!' : 'Download Official Receipt (.txt)'}
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
        <Link to="/">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<Home className="w-4 h-4" aria-hidden="true" />}
            className="text-ink-muted hover:text-ink-deep"
          >
            Return to home
          </Button>
        </Link>
      </div>
    </div>
  );
};
