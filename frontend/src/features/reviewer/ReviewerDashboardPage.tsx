import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw,
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

const AnimatedKpiNumber: React.FC<{ value: number | string; className?: string }> = ({ value, className }) => {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.p
        key={String(value)}
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 26 }}
        className={className}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </motion.p>
    </AnimatePresence>
  );
};

function getSlaDurationMs(priority: TriagePriority): number {
  switch (priority) {
    case 'CRITICAL':
      return 24 * 60 * 60 * 1000;
    case 'HIGH':
      return 72 * 60 * 60 * 1000;
    case 'MEDIUM':
      return 5 * 24 * 60 * 60 * 1000;
    case 'LOW':
    default:
      return 10 * 24 * 60 * 60 * 1000;
  }
}

function getBreachTimestamp(grievance: GrievanceResponse): number {
  const submitted = new Date(grievance.submittedAt).getTime();
  return (isNaN(submitted) ? Date.now() : submitted) + getSlaDurationMs(grievance.priority);
}

function renderTimeToSla(grievance: GrievanceResponse) {
  const submitted = new Date(grievance.submittedAt).getTime();
  const slaDuration = getSlaDurationMs(grievance.priority);
  const now = Date.now();
  const elapsed = Math.max(0, now - (isNaN(submitted) ? now : submitted));
  const remaining = slaDuration - elapsed;
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / slaDuration) * 100)));

  if (remaining < 0) {
    const overdueMs = Math.abs(remaining);
    const daysOver = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
    const label = daysOver >= 1 ? `${daysOver} d over` : `${Math.max(1, Math.floor(overdueMs / (1000 * 60 * 60)))} h over`;
    return (
      <div className="flex items-center gap-2">
        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
          <div className="h-full bg-red-500 rounded-full w-full" />
        </div>
        <span className="text-[11px] font-bold text-red-700 font-mono tabular-nums whitespace-nowrap">
          {label}
        </span>
      </div>
    );
  }

  const daysLeft = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.max(1, Math.floor(remaining / (1000 * 60 * 60)));
  const label = daysLeft >= 1 ? `${daysLeft} d left` : `${hoursLeft} h left`;
  const railColor = pct > 75 ? 'bg-amber-500' : 'bg-teal-600';

  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
        <div className={`h-full ${railColor} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-medium text-slate-600 font-mono tabular-nums whitespace-nowrap">
        {label}
      </span>
    </div>
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

  // Filters & Search
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Keyboard navigation row index
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Last refreshed timestamp
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());

  // Slide-Over Quick Peek State & Cache
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [quickPeekCache, setQuickPeekCache] = useState<Map<string, GrievanceDetailResponse>>(() => new Map());
  const [quickPeekLoadingId, setQuickPeekLoadingId] = useState<string | null>(null);
  const [quickPeekError, setQuickPeekError] = useState<string | null>(null);
  const quickPeekTriggerRef = useRef<HTMLButtonElement | null>(null);

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 2000);
  };

  const handleToggleQuickPeek = async (id: string, triggerBtn?: HTMLButtonElement | null) => {
    if (triggerBtn) {
      quickPeekTriggerRef.current = triggerBtn;
    }

    if (expandedRowId === id) {
      setExpandedRowId(null);
      return;
    }

    setExpandedRowId(id);

    // If already in cache: 0 duplicate network calls
    if (quickPeekCache.has(id)) {
      return;
    }

    setQuickPeekLoadingId(id);
    setQuickPeekError(null);
    try {
      const detail = await getGrievanceById(id);
      setQuickPeekCache((prev) => {
        const next = new Map(prev);
        next.set(id, detail);
        return next;
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setQuickPeekError(err.message || 'Failed to load grievance details');
      } else if (err instanceof Error) {
        setQuickPeekError(err.message);
      } else {
        setQuickPeekError('An error occurred loading grievance details');
      }
    } finally {
      setQuickPeekLoadingId(null);
    }
  };

  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await getGrievanceStats(signal);
      setStats(data);
      setLastRefreshedAt(new Date());
    } catch (err) {
      if (err instanceof ApiError) {
        setStatsError(err.message || `Failed to load statistics (${err.status})`);
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setStatsError(err.message);
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchQueue = useCallback(
    async (page: number, status: string, priority: string, signal?: AbortSignal) => {
      setQueueLoading(true);
      setQueueError(null);
      try {
        const data = await listGrievances(
          {
            page,
            size: 20,
            status: status === 'ALL' ? undefined : (status as GrievanceStatus),
            priority: priority === 'ALL' ? undefined : (priority as TriagePriority),
          },
          signal
        );
        setPageData(data);
        setLastRefreshedAt(new Date());
        setSelectedRowIndex(0);
      } catch (err) {
        if (err instanceof ApiError) {
          setQueueError(err.message || `Failed to load queue (${err.status})`);
        } else if (err instanceof Error && err.name !== 'AbortError') {
          setQueueError(err.message);
        }
      } finally {
        setQueueLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal);
    return () => controller.abort();
  }, [fetchStats]);

  useEffect(() => {
    const controller = new AbortController();
    fetchQueue(currentPage, selectedStatus, selectedPriority, controller.signal);
    return () => controller.abort();
  }, [currentPage, selectedStatus, selectedPriority, fetchQueue]);

  const handleRefreshAll = () => {
    fetchStats();
    fetchQueue(currentPage, selectedStatus, selectedPriority);
  };

  const handleStatusFilterChange = (newStatus: string) => {
    setSelectedStatus(newStatus);
    setCurrentPage(0);
  };

  const handlePriorityFilterChange = (newPriority: string) => {
    setSelectedPriority(newPriority);
    setCurrentPage(0);
  };

  const handleResetFilters = () => {
    setSelectedStatus('ALL');
    setSelectedPriority('ALL');
    setSearchQuery('');
    setCurrentPage(0);
  };

  // Sort grievances by time to SLA breach (earliest breach first)
  const sortedGrievances = useMemo(() => {
    if (!pageData?.content) return [];
    return [...pageData.content].sort((a, b) => getBreachTimestamp(a) - getBreachTimestamp(b));
  }, [pageData?.content]);

  // Client-side text search over current page
  const filteredGrievances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedGrievances;
    return sortedGrievances.filter((g) => {
      const matchId = g.id.toLowerCase().includes(q);
      const matchCat = g.assignedCategory.toLowerCase().includes(q);
      return matchId || matchCat;
    });
  }, [sortedGrievances, searchQuery]);

  // Keyboard navigation handler (J / K / Enter / Space / Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isInput) return;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.min(Math.max(0, filteredGrievances.length - 1), prev + 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        if (!expandedRowId && filteredGrievances[selectedRowIndex]) {
          navigate(`/reviewer/grievances/${filteredGrievances[selectedRowIndex].id}`);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        if (filteredGrievances[selectedRowIndex]) {
          handleToggleQuickPeek(filteredGrievances[selectedRowIndex].id);
        }
      } else if (e.key === 'Escape') {
        if (expandedRowId) {
          setExpandedRowId(null);
        } else if (selectedStatus !== 'ALL' || selectedPriority !== 'ALL' || searchQuery) {
          handleResetFilters();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredGrievances, selectedRowIndex, expandedRowId, navigate, selectedStatus, selectedPriority, searchQuery]);

  const minutesSinceRefresh = Math.max(0, Math.floor((Date.now() - lastRefreshedAt.getTime()) / 60000));
  const refreshText = minutesSinceRefresh === 0 ? 'Updated just now' : `Updated ${minutesSinceRefresh} min ago`;

  const hasActiveFilters = selectedStatus !== 'ALL' || selectedPriority !== 'ALL' || Boolean(searchQuery.trim());

  return (
    <ReviewerLayout
      title="Triage & Queue Management"
      subtitle="Real-time consumer finance complaint intelligence & human-in-the-loop triage."
      onRefresh={handleRefreshAll}
      isRefreshing={statsLoading || queueLoading}
    >
      <div className="space-y-5">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight font-sans">
                Reviewer Workspace
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                Live Queue
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Human-in-the-loop queue for consumer grievance triage and adjudication.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-mono">
              {refreshText}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefreshAll}
              leftIcon={<RotateCcw size={13} className={statsLoading || queueLoading ? 'animate-spin' : ''} />}
              disabled={statsLoading || queueLoading}
              className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs text-xs font-semibold"
            >
              Refresh Data
            </Button>
          </div>
        </div>

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
            {/* 1. Total Volume */}
            <div
              onClick={() => handleResetFilters()}
              className="p-4 sm:p-5 flex flex-col justify-between hover:bg-slate-50/70 transition-colors cursor-pointer group"
              title="Click to reset filters and view all grievances"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider group-hover:text-slate-900 transition-colors">
                  Total Volume
                </p>
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Layers size={14} />
                </div>
              </div>
              <div className="mt-2">
                <AnimatedKpiNumber
                  value={stats.total}
                  className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono tabular-nums tracking-tight"
                />
                <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 inline-block shrink-0" />
                  <span>Active repository aggregate</span>
                </p>
              </div>
            </div>

            {/* 2. Pending Review */}
            <div
              onClick={() => handleStatusFilterChange('PENDING_REVIEW')}
              className="p-4 sm:p-5 flex flex-col justify-between hover:bg-amber-50/40 transition-colors cursor-pointer group"
              title="Click to filter by Pending Review"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider group-hover:text-amber-900 transition-colors">
                  Pending Review
                </p>
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center">
                  <Clock size={14} />
                </div>
              </div>
              <div className="mt-2">
                <AnimatedKpiNumber
                  value={stats.pendingReview}
                  className="text-2xl sm:text-3xl font-extrabold text-amber-800 font-mono tabular-nums tracking-tight"
                />
                <p className="mt-1 text-xs text-amber-800 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse inline-block shrink-0" />
                  <span>Requires reviewer attention</span>
                </p>
              </div>
            </div>

            {/* 3. Auto-Routed */}
            <div
              onClick={() => handleStatusFilterChange('AUTO_ROUTED')}
              className="p-4 sm:p-5 flex flex-col justify-between hover:bg-teal-50/40 transition-colors cursor-pointer group"
              title="Click to filter by Auto-Routed"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-800 uppercase tracking-wider group-hover:text-teal-900 transition-colors">
                  Auto-Routed
                </p>
                <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 flex items-center justify-center">
                  <CheckCircle2 size={14} />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <AnimatedKpiNumber
                    value={stats.byStatus['AUTO_ROUTED'] || 0}
                    className="text-2xl sm:text-3xl font-extrabold text-teal-800 font-mono tabular-nums tracking-tight"
                  />
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    /{' '}
                    <span className="tabular-nums">{(stats.byStatus['APPROVED'] || 0).toLocaleString()}</span>
                    {' '}Approved
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block shrink-0" />
                  <span>
                    {stats.total > 0
                      ? `${Math.round(((stats.byStatus['APPROVED'] || 0) / stats.total) * 100)}% confirmed rate`
                      : 'Confirmed classification'}
                  </span>
                </p>
              </div>
            </div>

            {/* 4. SLA Risk */}
            <div
              onClick={() => handlePriorityFilterChange('CRITICAL')}
              className="p-4 sm:p-5 flex flex-col justify-between hover:bg-red-50/40 transition-colors cursor-pointer group"
              title="Click to filter by Critical Priority"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-red-800 uppercase tracking-wider group-hover:text-red-900 transition-colors">
                  SLA Risk
                </p>
                <div className="w-7 h-7 rounded-lg bg-red-50 text-red-800 border border-red-200 flex items-center justify-center">
                  <ShieldAlert size={14} />
                </div>
              </div>
              <div className="mt-2">
                <AnimatedKpiNumber
                  value={(stats.byPriority['CRITICAL'] || 0) + (stats.byPriority['HIGH'] || 0)}
                  className="text-2xl sm:text-3xl font-extrabold text-red-800 font-mono tabular-nums tracking-tight"
                />
                <p className="mt-1 text-xs text-red-800 flex items-center gap-1.5 tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block shrink-0" />
                  <span>
                    Critical: {stats.byPriority['CRITICAL'] || 0} • High: {stats.byPriority['HIGH'] || 0}
                  </span>
                </p>
              </div>
            </div>
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
                  Complaint Review Queue
                </h2>
                <span className="text-xs text-slate-500 font-mono">
                  ({filteredGrievances.length} cases shown)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Keyboard Shortcuts Hint */}
                <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-500">
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

            {/* Row 2: Quick Filter Segmented Pills */}
            {stats && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                    selectedStatus === 'ALL' && selectedPriority === 'ALL' && !searchQuery
                      ? 'bg-slate-900 text-white font-semibold shadow-2xs'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  <span>All Complaints ({stats.total})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('PENDING_REVIEW')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                    selectedStatus === 'PENDING_REVIEW'
                      ? 'bg-amber-100 text-amber-900 font-semibold border border-amber-300 shadow-2xs'
                      : 'bg-amber-50/70 text-amber-800 hover:bg-amber-100/70'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>Pending Review ({stats.pendingReview})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('AUTO_ROUTED')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                    selectedStatus === 'AUTO_ROUTED'
                      ? 'bg-teal-100 text-teal-900 font-semibold border border-teal-300 shadow-2xs'
                      : 'bg-teal-50/70 text-teal-800 hover:bg-teal-100/70'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                  <span>Auto-Routed ({stats.byStatus['AUTO_ROUTED'] || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePriorityFilterChange('CRITICAL')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                    selectedPriority === 'CRITICAL'
                      ? 'bg-red-100 text-red-900 font-semibold border border-red-300 shadow-2xs'
                      : 'bg-red-50/70 text-red-800 hover:bg-red-100/70'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>Critical Priority ({stats.byPriority['CRITICAL'] || 0})</span>
                </button>
              </div>
            )}

            {/* Row 3: Search & Select Dropdowns Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {/* Category / Reference Search Input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter complaints by category or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white shadow-2xs transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
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
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="min-w-[130px] text-xs font-medium rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="AUTO_ROUTED">Auto-Routed</option>
                <option value="APPROVED">Approved</option>
                <option value="OVERRIDDEN">Overridden</option>
                <option value="REJECTED">Rejected</option>
              </select>

              {/* Priority Select Dropdown (Preserves existing ARIA label & tests) */}
              <select
                aria-label="Filter by Priority"
                value={selectedPriority}
                onChange={(e) => handlePriorityFilterChange(e.target.value)}
                className="min-w-[130px] text-xs font-medium rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {/* Reset Filters Button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
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
                  onRetry={() => fetchQueue(currentPage, selectedStatus, selectedPriority)}
                />
              </div>
            ) : !pageData || filteredGrievances.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No grievances match the filter criteria"
                  description={
                    hasActiveFilters
                      ? 'Try adjusting or resetting your filter criteria to view more complaints.'
                      : 'The review queue is currently empty. All grievances have been reviewed.'
                  }
                  action={
                    hasActiveFilters ? (
                      <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                        Reset Filters
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div>
                {/* ─── DUAL RESPONSIVE QUEUE: STACKED CARDS ON MOBILE / 42px TABLE ON DESKTOP ── */}
                <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs block md:table" data-testid="queue-table">
                    <thead className="hidden md:table-header-group sticky top-0 z-10 bg-white border-b border-slate-200 shadow-2xs">
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
                          Time to SLA
                        </th>
                        <th scope="col" className="py-2 px-3 w-24">
                          Models
                        </th>
                        <th scope="col" className="py-2 px-3 w-32">
                          Status
                        </th>
                        <th scope="col" className="py-2 px-3.5 text-right w-44">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="block md:table-row-group divide-y-0 md:divide-y md:divide-slate-100 space-y-3 md:space-y-0 p-3 md:p-0">
                      {filteredGrievances.map((grievance, idx) => {
                        const isSelected = selectedRowIndex === idx;
                        const isExpanded = expandedRowId === grievance.id;

                        return (
                          <tr
                            key={grievance.id}
                            data-testid={`queue-row-${grievance.id}`}
                            onClick={() => setSelectedRowIndex(idx)}
                            className={`grid grid-cols-2 gap-y-2.5 gap-x-2 p-3.5 md:p-0 bg-white md:bg-transparent rounded-xl md:rounded-none border border-slate-200/90 md:border-0 shadow-2xs md:shadow-none md:table-row md:h-[42px] transition-colors cursor-pointer group ${
                              isSelected
                                ? 'bg-teal-50/70 ring-1 ring-inset ring-teal-500/40 md:ring-0 md:bg-teal-50/70'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* 1. Reference (Mobile: Row 1 Left) */}
                            <td className="order-1 md:order-none col-span-1 md:col-auto md:table-cell py-0 md:py-1.5 px-0 md:px-3.5 font-mono font-medium text-slate-900">
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
                                  className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                >
                                  {copiedId === grievance.id ? (
                                    <Check size={12} className="text-emerald-600" />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                                {grievance.version != null && (
                                  <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                                    v{grievance.version}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 2. Category (Mobile: Row 2 Full Width) */}
                            <td className="order-3 md:order-none col-span-2 md:col-auto md:table-cell py-0 md:py-1.5 px-0 md:px-3 font-medium text-slate-900">
                              <div className="text-sm font-semibold md:text-xs md:font-medium text-slate-900 truncate max-w-full md:max-w-[180px]" title={grievance.assignedCategory}>
                                {grievance.assignedCategory}
                              </div>
                            </td>

                            {/* 3. Priority (Mobile: Row 1 Right) */}
                            <td className="order-2 md:order-none col-span-1 md:col-auto flex justify-end md:table-cell py-0 md:py-1.5 px-0 md:px-3">
                              <StatusIndicator priority={grievance.priority} size="sm" />
                            </td>

                            {/* 4. Time to SLA (Mobile: Row 3 Left) */}
                            <td className="order-4 md:order-none col-span-1 md:col-auto flex items-center md:table-cell py-0 md:py-1.5 px-0 md:px-3">
                              {renderTimeToSla(grievance)}
                            </td>

                            {/* 5. Models (Mobile: Row 4 Left) */}
                            <td className="order-6 md:order-none col-span-1 md:col-auto flex items-center pt-2.5 md:pt-0 border-t border-slate-100 md:border-0 md:table-cell py-0 md:py-1.5 px-0 md:px-3">
                              {grievance.reviewRequired ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                                  <span className="text-xs font-medium text-slate-700">Split</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                                  <span className="text-xs font-medium text-slate-700">Agree</span>
                                </div>
                              )}
                            </td>

                            {/* 6. Status (Mobile: Row 3 Right) */}
                            <td className="order-5 md:order-none col-span-1 md:col-auto flex justify-end md:table-cell py-0 md:py-1.5 px-0 md:px-3">
                              <StatusIndicator status={grievance.status} size="sm" />
                            </td>

                            {/* 7. Actions (Mobile: Row 4 Right) */}
                            <td className="order-7 md:order-none col-span-1 md:col-auto flex justify-end md:table-cell py-0 md:py-1.5 px-0 md:px-3.5 text-right pt-2.5 md:pt-0 border-t border-slate-100 md:border-0">
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
                                    className={isExpanded ? 'text-teal-700' : 'text-slate-400'}
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
                      {Math.min(
                        (pageData.number + 1) * pageData.size,
                        pageData.totalElements
                      )}
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
        onClose={() => setExpandedRowId(null)}
        grievanceId={expandedRowId}
        detail={expandedRowId ? quickPeekCache.get(expandedRowId) || null : null}
        isLoading={Boolean(quickPeekLoadingId)}
        error={quickPeekError}
        onRetry={() => expandedRowId && handleToggleQuickPeek(expandedRowId)}
        triggerRef={quickPeekTriggerRef}
      />
    </ReviewerLayout>
  );
};
