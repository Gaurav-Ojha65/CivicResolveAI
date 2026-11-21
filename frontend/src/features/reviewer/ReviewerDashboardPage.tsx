import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Eye,
  Copy,
  Check,
  Search,
  X,
} from 'lucide-react';
import { ReviewerLayout } from '../../components/layout/ReviewerLayout';
import { Button } from '../../components/ui/Button';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { QuickPeekDrawer } from './components/QuickPeekDrawer';
import { listGrievances, getGrievanceStats, getGrievanceById } from '../../lib/api/endpoints';
import {
  GrievanceResponse,
  GrievanceStatsResponse,
  GrievanceStatus,
  TriagePriority,
  SpringPage,
  GrievanceDetailResponse,
} from '../../types/grievance';
import { ApiError } from '../../lib/errors/api-error';

type StatusFilter = 'ALL' | GrievanceStatus;
type PriorityFilter = 'ALL' | TriagePriority;

const STATUS_OPTIONS: ReadonlyArray<[StatusFilter, string]> = [
  ['ALL', 'All Statuses'],
  ['PENDING_REVIEW', 'Pending Review'],
  ['AUTO_ROUTED', 'Auto-Routed'],
  ['APPROVED', 'Approved'],
  ['OVERRIDDEN', 'Overridden'],
  ['REJECTED', 'Rejected'],
];

const PRIORITY_OPTIONS: ReadonlyArray<[PriorityFilter, string]> = [
  ['ALL', 'All Priorities'],
  ['CRITICAL', 'Critical'],
  ['HIGH', 'High'],
  ['MEDIUM', 'Medium'],
  ['LOW', 'Low'],
];

function renderCaseAge(grievance: GrievanceResponse) {
  const submitted = new Date(grievance.submittedAt).getTime();
  if (Number.isNaN(submitted)) {
    return (
      <span className="text-[11px] font-medium text-slate-500 font-mono whitespace-nowrap">
        Unknown
      </span>
    );
  }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - submitted) / (1000 * 60)));
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const elapsedDays = Math.floor(elapsedHours / 24);
  const label = elapsedDays > 0
    ? `${elapsedDays}d ${elapsedHours % 24}h`
    : elapsedHours > 0
      ? `${elapsedHours}h ${elapsedMinutes % 60}m`
      : `${elapsedMinutes}m`;

  return (
    <span
      className="text-[11px] font-medium text-slate-600 font-mono tabular-nums whitespace-nowrap"
      title={`Submitted ${new Date(grievance.submittedAt).toLocaleString()}`}
    >
      {label}
    </span>
  );
}

export const ReviewerDashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // Stats state
  const [stats, setStats] = useState<GrievanceStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Queue state
  const [pageData, setPageData] = useState<SpringPage<GrievanceResponse> | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueRefresh, setQueueRefresh] = useState(0);

  // Filters & Search
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<PriorityFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchTerm = searchQuery.trim();
  const [settledSearch, setSettledSearch] = useState('');
  useEffect(() => {
    if (!searchTerm) {
      setSettledSearch('');
      return;
    }
    const timeout = window.setTimeout(() => setSettledSearch(searchTerm), 250);
    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  // Keyboard navigation row index
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Last refreshed timestamp
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  // Slide-Over Quick Peek State & Cache
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [quickPeekCache, setQuickPeekCache] = useState<Map<string, GrievanceDetailResponse>>(() => new Map());
  const [quickPeekLoadingId, setQuickPeekLoadingId] = useState<string | null>(null);
  const [quickPeekError, setQuickPeekError] = useState<string | null>(null);
  const quickPeekTriggerRef = useRef<HTMLButtonElement | null>(null);

  const handleCopyId = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!navigator.clipboard) return;
    try { await navigator.clipboard.writeText(id); } catch { return; }
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 2000);
  };

  const [peekAttempt, setPeekAttempt] = useState(0);
  const closeQuickPeek = useCallback(() => setExpandedRowId(null), []);
  const handleToggleQuickPeek = (id: string, trigger?: HTMLButtonElement | null) => {
    if (trigger) quickPeekTriggerRef.current = trigger;
    setExpandedRowId(current => current === id ? null : id);
  };

  useEffect(() => {
    setQuickPeekError(null);
    if (!expandedRowId || quickPeekCache.has(expandedRowId)) {
      setQuickPeekLoadingId(null);
      return;
    }
    const controller = new AbortController();
    setQuickPeekLoadingId(expandedRowId);
    getGrievanceById(expandedRowId, controller.signal)
      .then(detail => {
        if (!controller.signal.aborted) {
          setQuickPeekCache(previous => new Map(previous).set(expandedRowId, detail));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setQuickPeekError(error instanceof Error ? error.message : 'Could not load this case.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuickPeekLoadingId(null);
      });
    return () => controller.abort();
  }, [expandedRowId, peekAttempt, quickPeekCache]);

  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await getGrievanceStats(signal);
      if (signal?.aborted) return;
      setStats(data);
      setLastRefreshedAt(new Date());
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiError) {
        setStatsError(err.message || `Failed to load statistics (${err.status})`);
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setStatsError(err.message);
      }
    } finally {
      if (!signal?.aborted) setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal);
    return () => controller.abort();
  }, [fetchStats, queueRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setQueueLoading(true);
    setQueueError(null);

    // Abort the old request immediately while waiting for the new search to settle.
    if (searchTerm !== settledSearch) return () => controller.abort();

    async function fetchQueue() {
      try {
        const data = await listGrievances(
          {
            page: currentPage,
            size: 20,
            status: selectedStatus === 'ALL' ? undefined : selectedStatus,
            priority: selectedPriority === 'ALL' ? undefined : selectedPriority,
            search: searchTerm || undefined,
          },
          signal
        );
        if (signal.aborted) return;
        if (data.empty && currentPage > 0 && currentPage >= data.totalPages) {
          setPageData(null);
          setCurrentPage(Math.max(0, data.totalPages - 1));
          return;
        }
        setPageData(data);
        setLastRefreshedAt(new Date());
        setSelectedRowIndex(0);
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof ApiError) {
          setQueueError(err.message || `Failed to load queue (${err.status})`);
        } else {
          setQueueError(err instanceof Error ? err.message : 'Failed to load queue');
        }
      } finally {
        if (!signal.aborted) setQueueLoading(false);
      }
    }

    void fetchQueue();
    return () => controller.abort();
  }, [currentPage, selectedStatus, selectedPriority, searchTerm, settledSearch, queueRefresh]);

  const refreshQueue = () => setQueueRefresh((previous) => previous + 1);

  const handleRefreshAll = () => {
    setQuickPeekCache(new Map());
    refreshQueue();
  };

  const handleStatusFilterChange = (newStatus: StatusFilter) => {
    setSelectedStatus(newStatus);
    setCurrentPage(0);
  };

  const handlePriorityFilterChange = (newPriority: PriorityFilter) => {
    setSelectedPriority(newPriority);
    setCurrentPage(0);
  };

  const selectSummary = (status: StatusFilter = 'ALL', priority: PriorityFilter = 'ALL') => {
    setSelectedStatus(status);
    setSelectedPriority(priority);
    setSearchQuery('');
    setCurrentPage(0);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(0);
  };

  // The backend owns filtering, pagination, and ordering. Preserve its page order exactly.
  const visibleGrievances = queueLoading || queueError ? [] : (pageData?.content ?? []);

  // Keyboard navigation handler (J / K / Enter / Space / Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isInput || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey ||
          document.querySelector('[aria-modal="true"]')) return;
      if ((e.key === 'Enter' || e.key === ' ') &&
          activeEl?.closest('button, a[href], summary')) return;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.min(Math.max(0, visibleGrievances.length - 1), prev + 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        if (!expandedRowId && visibleGrievances[selectedRowIndex]) {
          navigate(`/reviewer/grievances/${visibleGrievances[selectedRowIndex].id}`);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        if (visibleGrievances[selectedRowIndex]) {
          handleToggleQuickPeek(visibleGrievances[selectedRowIndex].id);
        }
      } else if (e.key === 'Escape') {
        if (expandedRowId) {
          setExpandedRowId(null);
        } else if (selectedStatus !== 'ALL' || selectedPriority !== 'ALL' || searchTerm) {
          selectSummary();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleGrievances, selectedRowIndex, expandedRowId, navigate, selectedStatus, selectedPriority, searchTerm]);

  const refreshText = lastRefreshedAt
    ? `Updated ${lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const hasActiveFilters = selectedStatus !== 'ALL' || selectedPriority !== 'ALL' || Boolean(searchTerm);

  return (
    <ReviewerLayout
      title="Complaint queue"
      onRefresh={handleRefreshAll}
      isRefreshing={statsLoading || queueLoading}
    >
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Complaint queue</h1>
            <p className="mt-2 text-sm text-ink-muted">Review incoming complaints and their routing decisions, newest first.</p>
          </div>
          {refreshText && <p className="text-xs text-ink-muted">{refreshText}</p>}
        </header>

        {/* ─── 1. TOP RIBBON: CONNECTED KPI STRIP ─────────────────────────── */}
        {statsLoading && !stats ? (
          <div data-testid="stats-skeleton" className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 sm:p-5 animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-slate-200 rounded w-20"></div>
                  <div className="w-6 h-6 rounded bg-slate-200"></div>
                </div>
                <div className="h-7 bg-slate-200 rounded w-14"></div>
                <div className="h-2.5 bg-slate-200 rounded w-24"></div>
              </div>
            ))}
          </div>
        ) : statsError ? (
          <ErrorState
            title="Unable to load statistics"
            message={statsError}
            onRetry={() => fetchStats()}
          />
        ) : stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
            {[
              { label: 'Total volume', count: stats.total, hint: 'All submitted complaints', icon: Layers, select: () => selectSummary() },
              { label: 'Pending review', count: stats.pendingReview, hint: 'Awaiting a decision', icon: Clock, select: () => selectSummary('PENDING_REVIEW') },
              { label: 'Auto-routed', count: stats.byStatus.AUTO_ROUTED ?? 0, hint: 'Routed automatically', icon: CheckCircle2, select: () => selectSummary('AUTO_ROUTED') },
              { label: 'Critical Priority', count: stats.byPriority.CRITICAL ?? 0, hint: 'Across all complaints', icon: ShieldAlert, select: () => selectSummary('ALL', 'CRITICAL') },
            ].map(({ label, count, hint, icon: Icon, select }) => (
              <button type="button" key={label} onClick={select} className="group p-4 text-left hover:bg-canvas focus-visible:outline-offset-[-3px] sm:p-5">
                <span className="flex items-center justify-between gap-2 text-sm font-medium text-ink-muted">{label}<Icon size={16} aria-hidden="true" /></span>
                <span className="mt-2 block text-3xl font-semibold tabular-nums text-ink">{count.toLocaleString()}</span>
                <span className="mt-1 block text-xs text-ink-muted">{hint}</span>
              </button>
            ))}
          </div>
        ) : null}

        {/* ─── 2. HIGH-DENSITY ENTERPRISE QUEUE TABLE & FACETED FILTERS ──── */}
        <div id="queue" className="w-full rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden flex flex-col">
          {/* Faceted Filter Bar (Linear / Stripe style) */}
          <div className="p-4 border-b border-slate-200/90 bg-white space-y-3.5">
            {/* Row 1: Title, Shortcuts Helper & AI Audit Link */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Cases
                </h2>
                {!queueLoading && !queueError && (
                  <span className="text-xs text-slate-500 font-mono">
                    {pageData?.totalElements.toLocaleString()} matching
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Keyboard Shortcuts Hint */}
                <div className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-500">
                  <span>J / K</span>
                  <span className="text-slate-400">•</span>
                  <span>Space Peek</span>
                  <span className="text-slate-400">•</span>
                  <span>↵ Open</span>
                </div>
                <Link
                  to="/reviewer/audit"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 transition-colors"
                >
                  <Sparkles size={12} className="text-teal-600" />
                  <span>AI Audit &amp; Benchmark</span>
                </Link>
              </div>
            </div>

            {/* Row 3: Search & Select Dropdowns Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {/* Category / Reference Search Input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search complaints by category or reference"
                  placeholder="Search by category or ID prefix…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white shadow-2xs transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear complaint search"
                    onClick={() => handleSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Status Select Dropdown (Preserves existing ARIA label & tests) */}
              <select
                aria-label="Filter by Status"
                value={selectedStatus}
                onChange={(event) => {
                  const option = STATUS_OPTIONS.find(([value]) => value === event.currentTarget.value);
                  if (option) handleStatusFilterChange(option[0]);
                }}
                className="min-w-[130px] text-xs font-medium rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>

              {/* Priority Select Dropdown (Preserves existing ARIA label & tests) */}
              <select
                aria-label="Filter by Priority"
                value={selectedPriority}
                onChange={(event) => {
                  const option = PRIORITY_OPTIONS.find(([value]) => value === event.currentTarget.value);
                  if (option) handlePriorityFilterChange(option[0]);
                }}
                className="min-w-[130px] text-xs font-medium rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                {PRIORITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>

              {/* Reset Filters Button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => selectSummary()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1.5 rounded-lg transition-colors shrink-0 shadow-2xs"
                >
                  <X size={12} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>

          {/* Table / Card List Content */}
          <div>
            {queueLoading ? (
              <div data-testid="queue-skeleton" className="p-4 space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 animate-pulse"
                  >
                    <div className="h-4 bg-slate-200 rounded w-24"></div>
                    <div className="h-4 bg-slate-200 rounded w-32"></div>
                    <div className="h-4 bg-slate-200 rounded w-20"></div>
                    <div className="h-4 bg-slate-200 rounded w-24"></div>
                    <div className="h-4 bg-slate-200 rounded w-16"></div>
                    <div className="h-6 bg-slate-200 rounded-lg w-20"></div>
                  </div>
                ))}
              </div>
            ) : queueError ? (
              <div className="p-6">
                <ErrorState
                  title="Failed to load queue"
                  message={queueError}
                  onRetry={refreshQueue}
                />
              </div>
            ) : !pageData || visibleGrievances.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title={hasActiveFilters ? "No matching complaints" : "No complaints yet"}
                  description={
                    hasActiveFilters
                      ? 'Try adjusting or resetting your filter criteria to view more complaints.'
                      : 'Submitted complaints will appear here.'
                  }
                  action={
                    hasActiveFilters ? (
                      <Button variant="secondary" size="sm" onClick={() => selectSummary()}>
                        Reset Filters
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div>
                {/* ─── DUAL RESPONSIVE QUEUE: STACKED CARDS ON MOBILE / 42px TABLE ON DESKTOP ── */}
                <div className="xl:overflow-x-auto xl:max-h-[640px] xl:overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs block xl:table" data-testid="queue-table">
                    <thead className="hidden xl:table-header-group sticky top-0 z-10 bg-white border-b border-slate-200 shadow-2xs">
                      <tr className="text-slate-500 font-semibold uppercase tracking-wider text-[11px] h-9">
                        <th scope="col" className="py-2 px-3.5 w-40">
                          Reference
                        </th>
                        <th scope="col" className="py-2 px-3">
                          Category
                        </th>
                        <th scope="col" className="py-2 px-3 w-32">
                          Priority
                        </th>
                        <th scope="col" className="py-2 px-3 w-36">
                          Case age
                        </th>
                        <th scope="col" className="py-2 px-3 w-24">
                          Review flag
                        </th>
                        <th scope="col" className="py-2 px-3 w-32">
                          Status
                        </th>
                        <th scope="col" className="py-2 px-3.5 text-right w-44">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="block xl:table-row-group divide-y-0 xl:divide-y xl:divide-slate-100 space-y-3 xl:space-y-0 p-3 xl:p-0">
                      {visibleGrievances.map((grievance, idx) => {
                        const isSelected = selectedRowIndex === idx;
                        const isExpanded = expandedRowId === grievance.id;

                        return (
                          <tr
                            key={grievance.id}
                            data-testid={`queue-row-${grievance.id}`}
                            onClick={() => setSelectedRowIndex(idx)}
                            className={`grid grid-cols-2 gap-y-2.5 gap-x-2 p-3.5 xl:p-0 bg-white xl:bg-transparent rounded-xl xl:rounded-none border border-slate-200/90 xl:border-0 shadow-2xs xl:shadow-none xl:table-row xl:h-[42px] transition-colors cursor-pointer group ${
                              isSelected
                                ? 'bg-teal-50/70 ring-1 ring-inset ring-teal-500/40 xl:ring-0 xl:bg-teal-50/70'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* 1. Reference (Mobile: Row 1 Left) */}
                            <td className="order-1 xl:order-none col-span-1 xl:col-auto xl:table-cell py-0 xl:py-1.5 px-0 xl:px-3.5 font-mono font-medium text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span
                                  title={grievance.id}
                                  className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums"
                                >
                                  {grievance.id.substring(0, 8)}...
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyId(e, grievance.id)}
                                  aria-label={`Copy reference ${grievance.id.substring(0, 8)}`}
                                  title="Copy full reference ID"
                                  className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                >
                                  {copiedId === grievance.id ? (
                                    <Check size={12} className="text-emerald-600" />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                                {grievance.version != null && (
                                  <span className="text-[10px] text-slate-600 font-mono tabular-nums">
                                    v{grievance.version}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 2. Category (Mobile: Row 2 Full Width) */}
                            <td className="order-3 xl:order-none col-span-2 xl:col-auto xl:table-cell py-0 xl:py-1.5 px-0 xl:px-3 font-medium text-slate-900">
                              <div className="text-sm font-semibold xl:text-xs xl:font-medium text-slate-900 truncate max-w-full xl:max-w-[180px]" title={grievance.assignedCategory}>
                                {grievance.assignedCategory}
                              </div>
                            </td>

                            {/* 3. Priority (Mobile: Row 1 Right) */}
                            <td className="order-2 xl:order-none col-span-1 xl:col-auto flex justify-end xl:table-cell py-0 xl:py-1.5 px-0 xl:px-3">
                              <StatusIndicator priority={grievance.priority} size="sm" />
                            </td>

                            {/* 4. Case age (Mobile: Row 3 Left) */}
                            <td className="order-4 xl:order-none col-span-1 xl:col-auto flex items-center xl:table-cell py-0 xl:py-1.5 px-0 xl:px-3">
                              {renderCaseAge(grievance)}
                            </td>

                            {/* 5. Review flag (Mobile: Row 4 Left) */}
                            <td className="order-6 xl:order-none col-span-1 xl:col-auto flex items-center pt-2.5 xl:pt-0 border-t border-slate-100 xl:border-0 xl:table-cell py-0 xl:py-1.5 px-0 xl:px-3">
                              {grievance.reviewRequired ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                                  <span className="text-xs font-medium text-slate-700">Flagged for review</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                                  <span className="text-xs font-medium text-slate-700">No review flag</span>
                                </div>
                              )}
                            </td>

                            {/* 6. Status (Mobile: Row 3 Right) */}
                            <td className="order-5 xl:order-none col-span-1 xl:col-auto flex justify-end xl:table-cell py-0 xl:py-1.5 px-0 xl:px-3">
                              <StatusIndicator status={grievance.status} size="sm" />
                            </td>

                            {/* 7. Actions (Mobile: Row 4 Right) */}
                            <td className="order-7 xl:order-none col-span-2 xl:col-auto flex justify-end xl:table-cell py-0 xl:py-1.5 px-0 xl:px-3.5 text-right pt-2.5 xl:pt-0 border-t border-slate-100 xl:border-0">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleQuickPeek(grievance.id, e.currentTarget);
                                  }}
                                  aria-expanded={isExpanded}
                                  aria-label={
                                    isExpanded
                                      ? `Collapse quick peek for ${grievance.id.substring(0, 8)}`
                                      : `Quick peek for ${grievance.id.substring(0, 8)}`
                                  }
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
                                    isExpanded
                                      ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-inner'
                                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                                  }`}
                                >
                                  <Eye
                                    size={12}
                                    className={isExpanded ? 'text-teal-700' : 'text-slate-600'}
                                  />
                                  <span>{isExpanded ? 'Collapse' : 'Quick Peek'}</span>
                                </button>
                                <Link
                                  to={`/reviewer/grievances/${grievance.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-2xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 shrink-0"
                                >
                                  <span>Review</span>
                                  <ArrowRight size={11} />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 text-xs text-slate-600">
                  <div className="tabular-nums">
                    Showing{' '}
                    <span className="font-semibold text-slate-900">
                      {pageData.number * pageData.size + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-semibold text-slate-900">
                      {pageData.number * pageData.size + visibleGrievances.length}
                    </span>{' '}
                    of{' '}
                    <span className="font-semibold text-slate-900">
                      {pageData.totalElements}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                      disabled={pageData.first || queueLoading}
                      leftIcon={<ChevronLeft size={13} />}
                      className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs text-xs px-2.5 py-1 font-semibold"
                    >
                      Previous
                    </Button>

                    <span className="px-2 font-mono font-medium text-slate-700 text-xs tabular-nums">
                      Page {pageData.number + 1} of {Math.max(1, pageData.totalPages)}
                    </span>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => prev + 1)}
                      disabled={pageData.last || queueLoading}
                      rightIcon={<ChevronRight size={13} />}
                      className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs text-xs px-2.5 py-1 font-semibold"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 3. SLIDE-OVER QUICK PEEK DRAWER ──────────────────────────────── */}
      <QuickPeekDrawer
        isOpen={Boolean(expandedRowId)}
        onClose={closeQuickPeek}
        grievanceId={expandedRowId}
        detail={expandedRowId ? quickPeekCache.get(expandedRowId) || null : null}
        isLoading={Boolean(quickPeekLoadingId)}
        error={quickPeekError}
        onRetry={() => setPeekAttempt(current => current + 1)}
        triggerRef={quickPeekTriggerRef}
      />
    </ReviewerLayout>
  );
};
