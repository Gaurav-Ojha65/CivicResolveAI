import React, { useState, useEffect, useCallback } from 'react';
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

function getSlaInfo(submittedAt: string, priority: TriagePriority) {
  const submitTime = new Date(submittedAt).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - submitTime);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  let targetHours = 24; // CRITICAL
  if (priority === 'HIGH') targetHours = 72;
  else if (priority === 'MEDIUM') targetHours = 120; // 5 days
  else if (priority === 'LOW') targetHours = 240; // 10 days

  const remainingHours = targetHours - elapsedHours;
  const isOverdue = remainingHours < 0;

  const days = Math.floor(elapsedHours / 24);
  const hours = Math.floor(elapsedHours % 24);
  const mins = Math.floor((elapsedHours * 60) % 60);
  const elapsedStr = days > 0 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;

  const absRemHours = Math.abs(remainingHours);
  const remDays = Math.floor(absRemHours / 24);
  const remH = Math.floor(absRemHours % 24);
  const remStr = remDays > 0 ? `${remDays}d ${remH}h` : `${remH}h left`;

  return {
    targetHours,
    elapsedStr,
    remainingStr: isOverdue ? `${remDays > 0 ? `${remDays}d ` : ''}${remH}h overdue` : remStr,
    isOverdue,
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

  const executeReviewSubmission = async (andNext: boolean = false) => {
    if (!id || !grievance) return;

    setSubmitError(null);
    setConflictError(null);
    setSuccessMessage(null);

    // Validation
    if (selectedAction === 'OVERRIDE') {
      if (!overrideCategory && !overridePriority) {
        setSubmitError('When overriding, you must specify a new category or a new priority.');
        return;
      }
      if (!reviewNote.trim()) {
        setSubmitError('A review explanation note is required when overriding triage recommendations.');
        return;
      }
    } else if (selectedAction === 'REJECT') {
      if (!reviewNote.trim()) {
        setSubmitError('A review explanation note is required when rejecting a grievance.');
        return;
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

    setIsSubmitting(true);
    try {
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeReviewSubmission(false);
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

  const sla = getSlaInfo(grievance.submittedAt, grievance.priority);
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

  return (
    <ReviewerLayout
      title={`Case #${grievance.id.substring(0, 8)}`}
      subtitle="Complete investigation audit, linear feature attribution, and reviewer adjudication."
      onRefresh={() => fetchDetail(false)}
      isRefreshing={isLoading}
    >
      <div className="space-y-6">
        {/* Navigation & Top Sticky Command Bar (Priority 1) */}
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
                type="button"
                onClick={() => setShowShortcutsHelp(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors shadow-2xs"
                title="View keyboard triage shortcuts"
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

            {/* SLA and Case Elapsed Info */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400">Elapsed: </span>
                <span className="font-bold text-slate-800 tabular-nums">{sla.elapsedStr}</span>
              </div>

              <div
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                  sla.isOverdue
                    ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold'
                    : 'bg-teal-50 border-teal-200 text-teal-900'
                }`}
              >
                <Clock size={13} className={sla.isOverdue ? 'text-rose-600' : 'text-teal-600'} />
                <span>Target: {sla.targetHours}h ({sla.remainingStr})</span>
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

        {/* ─── RESPONSIVE 2-COLUMN WORKBENCH (65% / 35%) ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left/Center Investigation Pane (65% width: lg:7 / xl:8 of 12 cols) */}
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
                    SLA: {sla.remainingStr}
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

            {/* Contextual In-Text Linear Attribution Highlighter */}
            <LinearAttributionHighlighter
              narrative={grievance.narrative}
              topPositiveFeatures={prediction?.explanation?.topPositiveFeatures}
              topNegativeFeatures={prediction?.explanation?.topNegativeFeatures}
              topDifferenceFeatures={prediction?.explanation?.topDifferenceFeatures}
              priorityReasons={prediction?.priorityReasons}
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
            {/* Decision Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 sticky top-36">
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
                {isTerminalState ? (
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
                ) : (
                  <form onSubmit={handleReviewSubmit} className="space-y-4">
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
                          <Label htmlFor="override-category" className="text-xs font-semibold text-slate-700">
                            New Category
                          </Label>
                          <select
                            id="override-category"
                            value={overrideCategory}
                            onChange={(e) => setOverrideCategory(e.target.value)}
                            className="mt-1 w-full text-xs font-medium rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 shadow-2xs"
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
                          <Label htmlFor="override-priority" className="text-xs font-semibold text-slate-700">
                            New Priority
                          </Label>
                          <select
                            id="override-priority"
                            value={overridePriority}
                            onChange={(e) => setOverridePriority(e.target.value as TriagePriority | '')}
                            className="mt-1 w-full text-xs font-medium rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 shadow-2xs"
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
                        <Label htmlFor="review-note" className="text-xs font-semibold text-slate-700">
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
                        id="review-note"
                        rows={3}
                        maxLength={1000}
                        placeholder={
                          selectedAction === 'APPROVE'
                            ? 'Optional rationale or audit comment...'
                            : 'Explain reason for override or rejection...'
                        }
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        className="mt-1 w-full text-xs rounded-lg border border-slate-200 bg-white p-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 resize-none shadow-2xs"
                      />
                    </div>

                    {/* Dual Action Buttons (Priority 2: High Velocity) */}
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
                        disabled={isSubmitting}
                      >
                        {selectedAction === 'APPROVE' && 'Approve Grievance'}
                        {selectedAction === 'OVERRIDE' && 'Apply Override'}
                        {selectedAction === 'REJECT' && 'Reject Grievance'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => executeReviewSubmission(true)}
                        className="w-full text-xs shadow-xs"
                        disabled={isSubmitting}
                      >
                        Submit &amp; Open Next Pending &rarr;
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Chronological Immutable Audit Timeline */}
            <AuditTimeline
              auditHistory={grievance.auditHistory}
              submittedAt={grievance.submittedAt}
              initialPriority={grievance.priority}
              initialCategory={grievance.assignedCategory}
            />
          </div>
        </div>
      </div>

      {/* Counterfactual What-If Sandbox Slide-Over Drawer */}
      <WhatIfSandboxDrawer
        isOpen={isWhatIfOpen}
        onClose={() => setIsWhatIfOpen(false)}
        originalNarrative={grievance.narrative}
        originalPrediction={grievance.originalPrediction}
      />

      {/* Keyboard Shortcuts Dialog Modal */}
      {showShortcutsHelp && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Keyboard size={16} className="text-teal-600" />
                Triage Keyboard Shortcuts
              </h3>
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                className="text-slate-400 hover:text-slate-600"
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
              onClick={() => setShowShortcutsHelp(false)}
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
