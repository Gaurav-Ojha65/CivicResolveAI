import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Info,
  Edit3,
  Copy,
  Check,
  Clock,
  Sparkles,
  Keyboard,
  RefreshCw,
  FileCheck,
  ShieldAlert,
  X,
} from 'lucide-react';
import { ReviewerLayout } from '../../components/layout/ReviewerLayout';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { ErrorState } from '../../components/ui/ErrorState';
import { Alert } from '../../components/ui/Alert';
import { Label } from '../../components/ui/Label';
import { ExplainableAiCard } from './components/ExplainableAiCard';
import { LinearAttributionHighlighter } from './components/LinearAttributionHighlighter';
import { DivergingFeatureBarChart } from './components/DivergingFeatureBarChart';
import { ProbabilityMarginMeter } from './components/ProbabilityMarginMeter';
import { AuditTimeline } from './components/AuditTimeline';
import { WhatIfSandboxDrawer } from './components/WhatIfSandboxDrawer';
import { DecisionIntelligenceLab } from './components/DecisionIntelligenceLab';
import { useTriageShortcuts } from './hooks/useTriageShortcuts';
import {
  getGrievanceById,
  reviewGrievance,
  getProductCategories,
  listGrievances,
} from '../../lib/api/endpoints';
import {
  GrievanceDetailResponse,
  ReviewAction,
  ReviewRequest,
  TriagePriority,
} from '../../types/grievance';
import { ApiError } from '../../lib/errors/api-error';

function getCaseAgeInfo(submittedAt: string) {
  const submitTime = new Date(submittedAt).getTime();
  const now = Date.now();
  const elapsedMs = Number.isNaN(submitTime) ? 0 : Math.max(0, now - submitTime);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  const days = Math.floor(elapsedHours / 24);
  const hours = Math.floor(elapsedHours % 24);
  const mins = Math.floor((elapsedHours * 60) % 60);
  const elapsedStr = days > 0 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;

  return {
    elapsedStr,
    submittedLabel: Number.isNaN(submitTime)
      ? 'Unknown submission time'
      : new Date(submittedAt).toLocaleString(),
  };
}

export const ReviewerGrievanceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Detail & Categories State
  const [grievance, setGrievance] = useState<GrievanceDetailResponse | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Review Form State
  const [selectedAction, setSelectedAction] = useState<ReviewAction>('APPROVE');
  const [overrideCategory, setOverrideCategory] = useState<string>('');
  const [overridePriority, setOverridePriority] = useState<TriagePriority | ''>('');
  const [reviewNote, setReviewNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Interactive UI State
  const [copiedId, setCopiedId] = useState(false);
  const [isWhatIfOpen, setIsWhatIfOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Interactive XAI State
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [isFeaturePinned, setIsFeaturePinned] = useState(false);

  // Mobile Decision Sheet State
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  // Synchronous submission in-flight mutex guard
  const isSubmittingRef = useRef(false);

  // Focus management refs for dialogs and trigger restoration
  const mobileSheetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileDialogRef = useRef<HTMLDivElement | null>(null);
  const shortcutsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shortcutsDialogRef = useRef<HTMLDivElement | null>(null);

  // Focus management and Escape handler for Mobile Adjudication Sheet
  useEffect(() => {
    if (!isMobileSheetOpen) return;

    const dialog = mobileDialogRef.current;
    if (!dialog) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = dialog.querySelectorAll<HTMLElement>(focusableSelector);
    const firstElement = focusableElements[0];

    // Move focus into the opened sheet
    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsMobileSheetOpen(false);
        mobileSheetTriggerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        const currentElements = dialog.querySelectorAll<HTMLElement>(focusableSelector);
        if (currentElements.length === 0) return;
        const first = currentElements[0];
        const last = currentElements[currentElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileSheetOpen]);

  // Focus management and Escape handler for Shortcuts Help Dialog
  useEffect(() => {
    if (!showShortcutsHelp) return;

    const dialog = shortcutsDialogRef.current;
    if (!dialog) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = dialog.querySelectorAll<HTMLElement>(focusableSelector);
    const firstElement = focusableElements[0];

    // Move focus into dialog
    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowShortcutsHelp(false);
        shortcutsTriggerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        const currentElements = dialog.querySelectorAll<HTMLElement>(focusableSelector);
        if (currentElements.length === 0) return;
        const first = currentElements[0];
        const last = currentElements[currentElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showShortcutsHelp]);

  // Reset interactive XAI on case switch
  useEffect(() => {
    setActiveFeature(null);
    setIsFeaturePinned(false);
    setIsMobileSheetOpen(false);
  }, [id]);

  const handleFeatureSelect = useCallback((feature: string | null) => {
    setActiveFeature((prev) => {
      if (prev === feature && isFeaturePinned) {
        setIsFeaturePinned(false);
        return null;
      }
      setIsFeaturePinned(Boolean(feature));
      return feature;
    });
  }, [isFeaturePinned]);

  const handleFeatureHover = useCallback((feature: string | null) => {
    if (!isFeaturePinned) {
      setActiveFeature(feature);
    }
  }, [isFeaturePinned]);

  const handleResetFeature = useCallback(() => {
    setActiveFeature(null);
    setIsFeaturePinned(false);
  }, []);

  const fetchDetail = useCallback(
    async (showLoadingSpinner = true, signal?: AbortSignal) => {
      if (!id) return;
      if (showLoadingSpinner) {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        const [detailData, catData] = await Promise.all([
          getGrievanceById(id, signal),
          getProductCategories(signal).catch(() => ({ categories: [] })),
        ]);
        setGrievance(detailData);
        if (catData.categories && catData.categories.length > 0) {
          setCategories(catData.categories);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setLoadError(err.message || `Failed to load grievance details (${err.status})`);
        } else if (err instanceof Error && err.name !== 'AbortError') {
          setLoadError(err.message);
        }
      } finally {
        if (showLoadingSpinner) {
          setIsLoading(false);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchDetail(true, controller.signal);
    return () => controller.abort();
  }, [fetchDetail]);

  const handleCopyId = () => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleActionChange = (action: ReviewAction) => {
    setSelectedAction(action);
    setSubmitError(null);
    setConflictError(null);
    setSuccessMessage(null);
  };

  // Find next pending case in queue
  const navigateNextPending = async () => {
    try {
      const page = await listGrievances({ status: 'PENDING_REVIEW', size: 20 });
      const nextCase = page.content.find((g) => g.id !== id);
      if (nextCase) {
        navigate(`/reviewer/grievances/${nextCase.id}`);
      } else {
        navigate('/reviewer');
      }
    } catch {
      navigate('/reviewer');
    }
  };

  const navigatePreviousPending = async () => {
    try {
      const page = await listGrievances({ status: 'PENDING_REVIEW', size: 20 });
      const currentIndex = page.content.findIndex((g) => g.id === id);
      if (currentIndex > 0) {
        const prevCase = page.content[currentIndex - 1];
        if (prevCase) {
          navigate(`/reviewer/grievances/${prevCase.id}`);
        }
      }
    } catch {
      // ignore
    }
  };

  // Register safe keyboard shortcuts (Priority 2)
  useTriageShortcuts({
    onNext: navigateNextPending,
    onPrevious: navigatePreviousPending,
    onSelectApprove: () => handleActionChange('APPROVE'),
    onSelectOverride: () => handleActionChange('OVERRIDE'),
    onSelectReject: () => handleActionChange('REJECT'),
    onToggleHelp: () => setShowShortcutsHelp((prev) => !prev),
    enabled: !isWhatIfOpen && !isLoading,
  });

  const executeReviewSubmission = async (andNext: boolean = false): Promise<boolean> => {
    if (!id || !grievance) return false;

    // Synchronous mutex guard: reject concurrent submissions immediately
    if (isSubmittingRef.current) {
      return false;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    setSubmitError(null);
    setConflictError(null);
    setSuccessMessage(null);

    try {
      // Validation
      if (selectedAction === 'OVERRIDE') {
        if (!overrideCategory && !overridePriority) {
          setSubmitError('When overriding, you must specify a new category or a new priority.');
          return false;
        }
        if (!reviewNote.trim()) {
          setSubmitError('A review explanation note is required when overriding triage recommendations.');
          return false;
        }
      } else if (selectedAction === 'REJECT') {
        if (!reviewNote.trim()) {
          setSubmitError('A review explanation note is required when rejecting a grievance.');
          return false;
        }
      }

      const payload: ReviewRequest = {
        action: selectedAction,
        expectedVersion: grievance.version,
        reviewNote: reviewNote.trim() ? reviewNote.trim() : undefined,
      };

      if (selectedAction === 'OVERRIDE') {
        if (overrideCategory) {
          payload.newCategory = overrideCategory;
        }
        if (overridePriority) {
          payload.newPriority = overridePriority;
        }
      }

      await reviewGrievance(id, payload);
      setSuccessMessage(`Successfully submitted decision: ${selectedAction}`);

      if (andNext) {
        await navigateNextPending();
      } else {
        await fetchDetail(false);
        setReviewNote('');
        setOverrideCategory('');
        setOverridePriority('');
      }
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(
          'Conflict (HTTP 409): Another reviewer has updated this grievance while you were reviewing it. The grievance details have been refreshed with the latest version. Please review the updated information and submit your decision again.'
        );
        await fetchDetail(false);
        setReviewNote('');
        setOverrideCategory('');
        setOverridePriority('');
      } else if (err instanceof ApiError) {
        setSubmitError(err.message || `Review submission failed (${err.status})`);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('An unexpected error occurred while submitting review.');
      }
      return false;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent, isMobile: boolean = false) => {
    e.preventDefault();
    const success = await executeReviewSubmission(false);
    if (success && isMobile) {
      setIsMobileSheetOpen(false);
    }
  };

  const handleExecuteReviewAndNext = async (isMobile: boolean = false) => {
    const success = await executeReviewSubmission(true);
    if (success && isMobile) {
      setIsMobileSheetOpen(false);
    }
  };

  if (!id) {
    return (
      <ReviewerLayout title="Case Investigation">
        <ErrorState
          title="Invalid Case Reference"
          message="No grievance identifier was provided in the route URL."
        />
      </ReviewerLayout>
    );
  }

  if (isLoading) {
    return (
      <ReviewerLayout title="Loading Case...">
        <div className="py-24 flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200/80 p-8 shadow-xs">
          <LoadingIndicator label="Loading grievance details and prediction audit..." />
          <span className="text-xs text-slate-500 font-medium">
            Loading grievance details and prediction audit...
          </span>
        </div>
      </ReviewerLayout>
    );
  }

  if (loadError || !grievance) {
    return (
      <ReviewerLayout title="Case Error">
        <div className="space-y-4">
          <Link
            to="/reviewer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900"
          >
            <ArrowLeft size={14} /> Back to Complaint Queue
          </Link>
          <ErrorState
            title="Failed to Load Grievance"
            message={loadError || 'The requested grievance could not be retrieved.'}
            onRetry={() => fetchDetail(true)}
          />
        </div>
      </ReviewerLayout>
    );
  }

  const isTerminalState =
    grievance.status === 'APPROVED' ||
    grievance.status === 'OVERRIDDEN' ||
    grievance.status === 'REJECTED' ||
    grievance.status === 'AUTO_ROUTED';

  const caseAge = getCaseAgeInfo(grievance.submittedAt);
  const prediction = grievance.originalPrediction;

  // Review triggers
  const triggers: Array<{ label: string; isDanger: boolean }> = [];
  if (prediction) {
    if (prediction.confidence < 0.55) {
      triggers.push({ label: 'LOW_CONFIDENCE (<55%)', isDanger: false });
    }
    if (prediction.margin < 0.15) {
      triggers.push({ label: 'SMALL_MARGIN (<15%)', isDanger: false });
    }
    if (grievance.priority === 'CRITICAL') {
      triggers.push({ label: 'CRITICAL_PRIORITY_POLICY', isDanger: true });
    }
    if (!grievance.reviewRequired) {
      triggers.push({ label: 'AUTO_ROUTED', isDanger: false });
    }
  }

  const renderDecisionForm = (isMobile: boolean) => {
    const isInactiveDesktopForm = !isMobile && isMobileSheetOpen;

    if (isTerminalState) {
      return (
        <div className="p-6 bg-slate-50 rounded-xl border border-slate-200/80 text-center space-y-2.5">
          <CheckCircle2 size={28} className="mx-auto text-emerald-600" />
          <p className="text-sm font-bold text-slate-900">
            Decision Recorded
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            This case has already been adjudicated to{' '}
            <span className="font-bold text-slate-800">{grievance.status}</span>.
            Further modifications are locked under current policy.
          </p>
        </div>
      );
    }

    return (
      <form
        id={isMobile ? 'mobile-decision-form' : 'desktop-decision-form'}
        onSubmit={(e) => {
          if (isInactiveDesktopForm) {
            e.preventDefault();
            return;
          }
          handleReviewSubmit(e, isMobile);
        }}
        className="space-y-4"
        aria-hidden={isInactiveDesktopForm ? 'true' : undefined}
      >
        {submitError && (
          <Alert variant="danger" title="Validation Error">
            {submitError}
          </Alert>
        )}

        {/* Action Selector Buttons */}
        <div>
          <Label className="text-xs font-semibold text-slate-700">
            Adjudication Action
          </Label>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            <button
              type="button"
              disabled={isSubmitting || isInactiveDesktopForm}
              tabIndex={isInactiveDesktopForm ? -1 : undefined}
              onClick={() => handleActionChange('APPROVE')}
              className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all text-center ${
                selectedAction === 'APPROVE'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs ring-1 ring-emerald-400'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Approve
            </button>

            <button
              type="button"
              disabled={isSubmitting || isInactiveDesktopForm}
              tabIndex={isInactiveDesktopForm ? -1 : undefined}
              onClick={() => handleActionChange('OVERRIDE')}
              className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all text-center ${
                selectedAction === 'OVERRIDE'
                  ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-xs ring-1 ring-amber-400'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Override
            </button>

            <button
              type="button"
              disabled={isSubmitting || isInactiveDesktopForm}
              tabIndex={isInactiveDesktopForm ? -1 : undefined}
              onClick={() => handleActionChange('REJECT')}
              className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all text-center ${
                selectedAction === 'REJECT'
                  ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-xs ring-1 ring-rose-400'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Reject
            </button>
          </div>
        </div>

        {/* Action Explanation Hint */}
        <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200/60 flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5 text-teal-600" />
          <div>
            {selectedAction === 'APPROVE' && (
              <span>
                Confirms automated triage: <strong>{grievance.assignedCategory}</strong> ({grievance.priority}).
              </span>
            )}
            {selectedAction === 'OVERRIDE' && (
              <span>
                Manually change category or priority. Explanatory note mandatory.
              </span>
            )}
            {selectedAction === 'REJECT' && (
              <span>
                Rejects the complaint (e.g. spam, duplicate, out of scope). Explanatory note mandatory.
              </span>
            )}
          </div>
        </div>

        {/* OVERRIDE Specific Inputs */}
        {selectedAction === 'OVERRIDE' && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <Label
                htmlFor={isMobile ? 'mobile-override-category' : 'override-category'}
                className="text-xs font-semibold text-slate-700"
              >
                New Category
              </Label>
              <select
                id={isMobile ? 'mobile-override-category' : 'override-category'}
                value={overrideCategory}
                disabled={isSubmitting || isInactiveDesktopForm}
                tabIndex={isInactiveDesktopForm ? -1 : undefined}
                onChange={(e) => setOverrideCategory(e.target.value)}
                className="mt-1 w-full text-xs font-medium rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 shadow-2xs disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">-- Keep Current ({grievance.assignedCategory}) --</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label
                htmlFor={isMobile ? 'mobile-override-priority' : 'override-priority'}
                className="text-xs font-semibold text-slate-700"
              >
                New Priority
              </Label>
              <select
                id={isMobile ? 'mobile-override-priority' : 'override-priority'}
                value={overridePriority}
                disabled={isSubmitting || isInactiveDesktopForm}
                tabIndex={isInactiveDesktopForm ? -1 : undefined}
                onChange={(e) => setOverridePriority(e.target.value as TriagePriority | '')}
                className="mt-1 w-full text-xs font-medium rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 shadow-2xs disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">-- Keep Current ({grievance.priority}) --</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
        )}

        {/* Reviewer Note Textarea */}
        <div>
          <div className="flex items-center justify-between">
            <Label
              htmlFor={isMobile ? 'mobile-review-note' : 'review-note'}
              className="text-xs font-semibold text-slate-700"
            >
              Review Note{' '}
              {selectedAction === 'APPROVE' ? (
                <span className="text-slate-400 text-[11px] font-normal">(Optional)</span>
              ) : (
                <span className="text-rose-600 text-[11px]">*</span>
              )}
            </Label>
            <span className="text-[11px] text-slate-400 font-mono">
              {reviewNote.length}/1000
            </span>
          </div>
          <textarea
            id={isMobile ? 'mobile-review-note' : 'review-note'}
            rows={3}
            maxLength={1000}
            disabled={isSubmitting || isInactiveDesktopForm}
            tabIndex={isInactiveDesktopForm ? -1 : undefined}
            placeholder={
              selectedAction === 'APPROVE'
                ? 'Optional rationale or audit comment...'
                : 'Explain reason for override or rejection...'
            }
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            className="mt-1 w-full text-xs rounded-lg border border-slate-200 bg-white p-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 resize-none shadow-2xs disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {/* Dual Action Buttons */}
        <div className="space-y-2 pt-1">
          <Button
            type="submit"
            variant={
              selectedAction === 'REJECT'
                ? 'destructive'
                : selectedAction === 'OVERRIDE'
                ? 'secondary'
                : 'primary'
            }
            className="w-full shadow-xs"
            isLoading={isSubmitting}
            disabled={isSubmitting || isInactiveDesktopForm}
            tabIndex={isInactiveDesktopForm ? -1 : undefined}
          >
            {selectedAction === 'APPROVE' && 'Approve Grievance'}
            {selectedAction === 'OVERRIDE' && 'Apply Override'}
            {selectedAction === 'REJECT' && 'Reject Grievance'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleExecuteReviewAndNext(isMobile)}
            className="w-full text-xs shadow-xs"
            disabled={isSubmitting || isInactiveDesktopForm}
            tabIndex={isInactiveDesktopForm ? -1 : undefined}
          >
            Submit &amp; Open Next Pending &rarr;
          </Button>
        </div>
      </form>
    );
  };

  return (
    <ReviewerLayout
      title={`Case #${grievance.id.substring(0, 8)}`}
      subtitle="Complete investigation audit, linear feature attribution, and reviewer adjudication."
      onRefresh={() => fetchDetail(false)}
      isRefreshing={isLoading}
    >
      <div className="space-y-6 pb-28 lg:pb-0">
        {/* Navigation & Top Sticky Command Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Link
              to="/reviewer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 transition-colors"
            >
              <ArrowLeft size={14} /> Back to Complaint Queue
            </Link>

            <div className="flex items-center gap-2">
              <button
                ref={shortcutsTriggerRef}
                type="button"
                onClick={() => setShowShortcutsHelp(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors shadow-2xs"
                title="View keyboard triage shortcuts"
                aria-haspopup="dialog"
                aria-expanded={showShortcutsHelp}
              >
                <Keyboard size={13} />
                Shortcuts [?]
              </button>

              <button
                type="button"
                onClick={() => setIsWhatIfOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-all shadow-2xs"
              >
                <Sparkles size={14} className="text-teal-600" />
                What-If Sandbox
              </button>
            </div>
          </div>

          {/* Sticky Command Bar Header */}
          <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md rounded-2xl p-4 md:p-5 border border-slate-200/90 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 font-mono">
                  Case #{grievance.id.substring(0, 8)}
                </h1>

                <button
                  type="button"
                  onClick={handleCopyId}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
                  title="Copy full UUID"
                >
                  {copiedId ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>

                <Badge variant="default" size="sm" className="font-mono bg-slate-100 text-slate-700">
                  v{grievance.version}
                </Badge>
                <StatusIndicator status={grievance.status} size="sm" />
                <StatusIndicator priority={grievance.priority} size="sm" />

                {/* Reset badge in command bar if activeFeature is set */}
                {activeFeature && (
                  <button
                    type="button"
                    onClick={handleResetFeature}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-300 hover:bg-teal-200 transition-colors shadow-2xs"
                    title="Click to reset active feature filter"
                    aria-label="Reset active feature"
                  >
                    <span>XAI: {activeFeature}</span>
                    <span className="text-teal-600 font-bold">&times;</span>
                  </button>
                )}
              </div>

              {/* Review Trigger Badges */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {triggers.map((t, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      t.isDanger
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Case age is descriptive only; no legal or contractual deadline is configured. */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400">Case age: </span>
                <span className="font-bold text-slate-800 tabular-nums">{caseAge.elapsedStr}</span>
              </div>

              <div className="px-3 py-1.5 rounded-xl border flex items-center gap-1.5 bg-slate-50 border-slate-200 text-slate-700">
                <Clock size={13} className="text-slate-500" />
                <span title={caseAge.submittedLabel}>No review deadline configured</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feedback Alerts */}
        {conflictError && (
          <Alert variant="danger" title="Concurrent Modification Conflict (HTTP 409)">
            <div className="space-y-2">
              <p>{conflictError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fetchDetail(false)}
                className="inline-flex items-center gap-1.5"
              >
                <RefreshCw size={13} /> Reload Latest State
              </Button>
            </div>
          </Alert>
        )}

        {successMessage && (
          <Alert variant="success" title="Decision Recorded">
            {successMessage}
          </Alert>
        )}

        {/* ─── RESPONSIVE 2-COLUMN WORKBENCH (lg:grid-cols-12 gap-6) ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Investigation Pane (lg:col-span-7 xl:col-span-8 space-y-6) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            {/* ZONE A — Immutable Original Case (Baseline Anchor) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                    <FileCheck size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">
                        Zone A — Original Complaint Narrative
                      </h2>
                      <Badge variant="success" size="sm" className="font-mono text-[10px]">
                        IMMUTABLE PERSISTED RECORD
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Baseline persisted intake record. Invariant across counterfactual simulations.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full border border-slate-200">
                    Version #{grievance.version}
                  </span>
                  <span className="bg-teal-50 text-teal-800 px-2.5 py-0.5 rounded-full border border-teal-200">
                    Case age: {caseAge.elapsedStr}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-xl text-slate-900 text-sm leading-relaxed whitespace-pre-wrap font-sans selection:bg-teal-100 shadow-2xs">
                  {grievance.narrative}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-[11px] text-slate-600 font-mono">
                  <span>Model Provenance: {prediction?.modelUsed || 'TF-IDF + Logistic Regression'}</span>
                  <span>Artifact: {prediction?.modelVersion?.substring(0, 16) || 'active-checkpoint'}</span>
                </div>

                <div className="flex items-start gap-2.5 p-3.5 bg-amber-50/70 text-xs text-amber-800 rounded-xl border border-amber-200/70">
                  <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-900">Confidentiality Protocol:</span>{' '}
                    Narrative content contains citizen disclosures. Restricted to authorized staff for adjudication.
                  </div>
                </div>
              </div>
            </div>

            {/* Active XAI Feature Reset Badge */}
            {activeFeature && (
              <div
                data-testid="xai-active-feature-badge"
                className="flex items-center justify-between p-3 bg-teal-50/90 border border-teal-200/90 rounded-xl text-xs text-teal-900 transition-all shadow-2xs"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-teal-950">Active XAI Focus:</span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded-md border border-teal-300 font-bold text-teal-800 shadow-2xs">
                    {activeFeature}
                  </span>
                  <span className="text-slate-500 text-[11px] hidden sm:inline">
                    (Highlighted across narrative and contribution chart)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleResetFeature}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:text-teal-950 bg-white hover:bg-teal-100 rounded-lg border border-teal-300 transition-all shadow-2xs"
                  aria-label="Reset active feature"
                >
                  <X size={13} />
                  Reset Filter
                </button>
              </div>
            )}

            {/* Contextual In-Text Linear Attribution Highlighter */}
            <LinearAttributionHighlighter
              narrative={grievance.narrative}
              topPositiveFeatures={prediction?.explanation?.topPositiveFeatures}
              topNegativeFeatures={prediction?.explanation?.topNegativeFeatures}
              topDifferenceFeatures={prediction?.explanation?.topDifferenceFeatures}
              priorityReasons={prediction?.priorityReasons}
              activeFeature={activeFeature}
              onFeatureHover={handleFeatureHover}
              onFeatureSelect={handleFeatureSelect}
            />

            {/* Explainable AI Prediction & Triage Analysis */}
            <ExplainableAiCard prediction={prediction} />

            {/* Diverging Feature Contribution Profile */}
            {prediction?.explanation && (
              <DivergingFeatureBarChart
                positiveFeatures={prediction.explanation.topPositiveFeatures}
                negativeFeatures={prediction.explanation.topNegativeFeatures}
                predictedClass={prediction.explanation.predictedClass}
                runnerUpClass={prediction.explanation.runnerUpClass}
                activeFeature={activeFeature}
                onFeatureHover={handleFeatureHover}
                onFeatureSelect={handleFeatureSelect}
              />
            )}

            {/* 8-Class Probability & Top-2 Margin Meter */}
            {prediction && (
              <ProbabilityMarginMeter
                probabilities={prediction.probabilities || {}}
                predictedCategory={prediction.predictedCategory}
                confidence={prediction.confidence}
                margin={prediction.margin}
              />
            )}

            {/* ─── FLAGSHIP SUITE: Decision Intelligence Lab (Zone B & Zone C) ─── */}
            <DecisionIntelligenceLab
              originalNarrative={grievance.narrative}
              originalPrediction={grievance.originalPrediction}
              grievanceId={grievance.id}
              onAppendReviewNote={(text) => {
                setReviewNote((prev) => (prev ? `${prev}\n\n${text}` : text));
              }}
            />
          </div>

          {/* Right Sticky Decision & Audit Dock (35% width: lg:5 / xl:4 of 12 cols) */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            {/* Sticky Review Decision Dock (sticky top-20 below header) */}
            <div
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 sticky top-20 z-20"
              aria-hidden={isMobileSheetOpen ? 'true' : undefined}
              {...(isMobileSheetOpen ? { inert: '' } : {})}
            >
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Review Decision Dock
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Adjudicate case status and routing assignments.
                  </p>
                </div>
              </div>

              <div className="pt-4">
                {renderDecisionForm(false)}
              </div>
            </div>

            {/* Chronological Immutable Audit Timeline wrapped with max-h-[380px] overflow-y-auto */}
            <div className="max-h-[380px] overflow-y-auto pr-1 rounded-2xl">
              <AuditTimeline
                auditHistory={grievance.auditHistory}
                submittedAt={grievance.submittedAt}
                initialPriority={grievance.priority}
                initialCategory={grievance.assignedCategory}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pinned Bottom Decision Bar for Mobile (<1024px) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
        <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <StatusIndicator status={grievance.status} size="sm" />
            <StatusIndicator priority={grievance.priority} size="sm" />
          </div>

          <Button
            ref={mobileSheetTriggerRef}
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsMobileSheetOpen(true)}
            className="shrink-0 flex items-center gap-1.5 shadow-sm text-xs font-bold"
            aria-haspopup="dialog"
            aria-expanded={isMobileSheetOpen}
          >
            <Edit3 size={14} />
            {isTerminalState ? 'View Decision' : 'Adjudicate Case'}
          </Button>
        </div>
      </div>

      {/* Expandable Mobile Decision Sheet */}
      {isMobileSheetOpen && (
        <div
          ref={mobileDialogRef}
          className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Adjudicate Case"
        >
          {/* Clickable backdrop overlay to dismiss */}
          <div
            className="fixed inset-0 -z-10"
            onClick={() => {
              setIsMobileSheetOpen(false);
              mobileSheetTriggerRef.current?.focus();
            }}
            aria-hidden="true"
          />

          <div className="bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto border-t border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Review Decision Dock
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Mobile Adjudication Sheet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileSheetOpen(false);
                  mobileSheetTriggerRef.current?.focus();
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close sheet"
              >
                <X size={16} />
              </button>
            </div>

            <div className="pt-2">
              {renderDecisionForm(true)}
            </div>
          </div>
        </div>
      )}

      {/* Counterfactual What-If Sandbox Slide-Over Drawer */}
      <WhatIfSandboxDrawer
        isOpen={isWhatIfOpen}
        onClose={() => setIsWhatIfOpen(false)}
        originalNarrative={grievance.narrative}
        originalPrediction={grievance.originalPrediction}
      />

      {/* Keyboard Shortcuts Dialog Modal */}
      {showShortcutsHelp && (
        <div
          ref={shortcutsDialogRef}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-dialog-title"
        >
          {/* Clickable backdrop overlay */}
          <div
            className="fixed inset-0 -z-10"
            onClick={() => {
              setShowShortcutsHelp(false);
              shortcutsTriggerRef.current?.focus();
            }}
            aria-hidden="true"
          />

          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 id="shortcuts-dialog-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Keyboard size={16} className="text-teal-600" />
                Triage Keyboard Shortcuts
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowShortcutsHelp(false);
                  shortcutsTriggerRef.current?.focus();
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Close shortcuts dialog"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-sans">Next Pending Case</span>
                <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded text-slate-900 font-bold shadow-2xs">
                  J or ]
                </kbd>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-sans">Previous Case</span>
                <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded text-slate-900 font-bold shadow-2xs">
                  K or [
                </kbd>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-sans">Select Approve</span>
                <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded text-emerald-800 font-bold shadow-2xs">
                  A
                </kbd>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-sans">Select Override</span>
                <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded text-amber-800 font-bold shadow-2xs">
                  O
                </kbd>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-sans">Select Reject</span>
                <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded text-rose-800 font-bold shadow-2xs">
                  R
                </kbd>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-sans">Toggle Shortcuts Help</span>
                <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded text-slate-900 font-bold shadow-2xs">
                  ?
                </kbd>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Shortcuts are safely ignored when typing inside notes or text inputs.
            </p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowShortcutsHelp(false);
                shortcutsTriggerRef.current?.focus();
              }}
              className="w-full text-xs"
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </ReviewerLayout>
  );
};
