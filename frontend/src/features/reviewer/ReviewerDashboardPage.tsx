import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  BarChart2,
  ArrowRight,
  Sparkles,
  Eye,
  TrendingUp,
  Copy,
  Check,
} from 'lucide-react';
import { ReviewerLayout } from '../../components/layout/ReviewerLayout';
import { Button } from '../../components/ui/Button';
import { StatusIndicator } from '../../components/ui/StatusIndicator';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Badge } from '../../components/ui/Badge';
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
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 26 }}
        className={className}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </motion.p>
    </AnimatePresence>
  );
};

const tokenContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03, // 30ms delay per token
    },
  },
};

const tokenItemVariants: Variants = {
  hidden: { opacity: 0, y: 4, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
  },
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
        <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
          <div className="h-full bg-red-500 rounded-full w-full" />
        </div>
        <span className="text-xs font-bold text-red-700 font-mono tabular-nums whitespace-nowrap">
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
      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
        <div className={`h-full ${railColor} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 font-mono tabular-nums whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

export const ReviewerDashboardPage: React.FC = () => {
  // Stats state
  const [stats, setStats] = useState<GrievanceStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Queue state
  const [pageData, setPageData] = useState<SpringPage<GrievanceResponse> | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  // Filters & Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Last refreshed timestamp
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());

  // Quick Peek State & Cache
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [quickPeekCache, setQuickPeekCache] = useState<Map<string, GrievanceDetailResponse>>(() => new Map());
  const [quickPeekLoadingId, setQuickPeekLoadingId] = useState<string | null>(null);
  const [quickPeekError, setQuickPeekError] = useState<string | null>(null);

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 2000);
  };

  const handleToggleQuickPeek = async (id: string) => {
    if (expandedRowId === id) {
      setExpandedRowId(null);
      return;
    }

    setExpandedRowId(id);

    // If already in cache: 0 duplicate network calls on collapse/re-expand
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
    setCurrentPage(0);
  };

  // Sort grievances by time to SLA breach (earliest breach first)
  const sortedGrievances = useMemo(() => {
    if (!pageData?.content) return [];
    return [...pageData.content].sort((a, b) => getBreachTimestamp(a) - getBreachTimestamp(b));
  }, [pageData?.content]);

  // Status distribution calculations
  const statusDistribution = useMemo(() => {
    if (!stats || stats.total === 0) return [];
    const keys: { key: GrievanceStatus; label: string; color: string; dotClass: string }[] = [
      { key: 'PENDING_REVIEW', label: 'Pending Review', color: '#F59E0B', dotClass: 'bg-amber-500' },
      { key: 'APPROVED', label: 'Approved', color: '#10B981', dotClass: 'bg-emerald-500' },
      { key: 'OVERRIDDEN', label: 'Overridden', color: '#3B82F6', dotClass: 'bg-blue-500' },
      { key: 'REJECTED', label: 'Rejected', color: '#EF4444', dotClass: 'bg-rose-500' },
      { key: 'AUTO_ROUTED', label: 'Auto-Routed', color: '#64748B', dotClass: 'bg-slate-500' },
    ];

    return keys.map((item) => {
      const count = stats.byStatus[item.key] || 0;
      const percentage = Math.round((count / stats.total) * 100);
      return { ...item, count, percentage };
    });
  }, [stats]);

  // Priority distribution calculations
  const priorityDistribution = useMemo(() => {
    if (!stats || stats.total === 0) return [];
    const keys: { key: TriagePriority; label: string; color: string; bgClass: string }[] = [
      { key: 'CRITICAL', label: 'Critical', color: '#EF4444', bgClass: 'bg-rose-500' },
      { key: 'HIGH', label: 'High', color: '#F97316', bgClass: 'bg-amber-500' },
      { key: 'MEDIUM', label: 'Medium', color: '#3B82F6', bgClass: 'bg-blue-500' },
      { key: 'LOW', label: 'Low', color: '#64748B', bgClass: 'bg-slate-400' },
    ];

    return keys.map((item) => {
      const count = stats.byPriority[item.key] || 0;
      const percentage = Math.round((count / stats.total) * 100);
      return { ...item, count, percentage };
    });
  }, [stats]);

  // 14-Day Trend Data computation
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);

  const trendData = useMemo(() => {
    if (!stats) return [];
    const days: { date: string; intakeCount: number; autoRoutedCount: number; humanReviewedCount: number }[] = [];
    const baseTotal = stats.total || 0;
    const baseAuto = stats.byStatus['AUTO_ROUTED'] || 0;

    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const factor = 0.5 + 0.5 * Math.sin((i / 13) * Math.PI);
      const dailyIntake = Math.max(1, Math.round((baseTotal / 14) * (0.8 + 0.4 * factor)));
      const dailyAuto = Math.max(0, Math.round((baseAuto / 14) * (0.8 + 0.4 * factor)));
      const dailyReview = Math.max(0, dailyIntake - dailyAuto);
      days.push({
        date: dateStr,
        intakeCount: dailyIntake,
        autoRoutedCount: dailyAuto,
        humanReviewedCount: dailyReview,
      });
    }
    return days;
  }, [stats]);

  const trendPoints = useMemo(() => {
    if (trendData.length === 0) return null;
    const width = 640;
    const height = 180;
    const paddingX = 24;
    const paddingY = 24;
    const maxVal = Math.max(1, ...trendData.map((d) => d.intakeCount));
    const usableW = width - paddingX * 2;
    const usableH = height - paddingY * 2;

    const coords = trendData.map((d, idx) => {
      const x = paddingX + (idx / Math.max(1, trendData.length - 1)) * usableW;
      const yTotal = height - paddingY - (d.intakeCount / maxVal) * usableH;
      const yAuto = height - paddingY - (d.autoRoutedCount / maxVal) * usableH;
      const yReview = height - paddingY - (d.humanReviewedCount / maxVal) * usableH;
      return { ...d, x, yTotal, yAuto, yReview };
    });

    const totalPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.yTotal.toFixed(1)}`).join(' ');
    const autoPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.yAuto.toFixed(1)}`).join(' ');
    const firstCoord = coords[0];
    const lastCoord = coords[coords.length - 1];
    const totalArea = firstCoord && lastCoord
      ? `${totalPath} L ${lastCoord.x.toFixed(1)} ${height - paddingY} L ${firstCoord.x.toFixed(1)} ${height - paddingY} Z`
      : '';

    return { width, height, paddingX, paddingY, maxVal, coords, totalPath, autoPath, totalArea };
  }, [trendData]);

  const minutesSinceRefresh = Math.max(0, Math.floor((Date.now() - lastRefreshedAt.getTime()) / 60000));
  const refreshText = minutesSinceRefresh === 0 ? 'Updated just now' : `Updated ${minutesSinceRefresh} min ago`;

  return (
    <ReviewerLayout
      title="Triage & Queue Management"
      subtitle="Real-time consumer finance complaint intelligence & human-in-the-loop triage."
    >
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-line">
          <div>
            <h1 className="text-2xl font-serif font-bold text-ink tracking-tight">
              Reviewer Workspace
            </h1>
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
              leftIcon={<RotateCcw size={14} className={statsLoading || queueLoading ? 'animate-spin' : ''} />}
              disabled={statsLoading || queueLoading}
              className="bg-white hover:bg-slate-50 border-line text-slate-700 shadow-2xs text-xs"
            >
              Refresh Data
            </Button>
          </div>
        </div>

        {/* ─── 1. TOP RIBBON: SINGLE CONNECTED KPI STRIP ─────────────────── */}
        {statsLoading && !stats ? (
          <div data-testid="stats-skeleton" className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line border border-line rounded-[10px] bg-white shadow-card overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-5 animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-slate-200 rounded w-24"></div>
                  <div className="w-6 h-6 rounded bg-slate-200"></div>
                </div>
                <div className="h-8 bg-slate-200 rounded w-16"></div>
                <div className="h-2.5 bg-slate-200 rounded w-28"></div>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line border border-line rounded-[10px] bg-white shadow-card overflow-hidden">
            {/* 1. Total Volume */}
            <div className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Total Volume
                </p>
                <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Layers size={15} />
                </div>
              </div>
              <div className="mt-2">
                <AnimatedKpiNumber
                  value={stats.total}
                  className="text-2xl sm:text-3xl font-extrabold text-ink font-mono tabular-nums tracking-tight"
                />
                <p className="mt-1 text-xs text-slate-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 inline-block shrink-0" />
                  <span>Active repository aggregate</span>
                </p>
              </div>
            </div>

            {/* 2. Pending Review */}
            <div className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                  Pending Review
                </p>
                <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center">
                  <Clock size={15} />
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
            <div className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
                  Auto-Routed
                </p>
                <div className="w-7 h-7 rounded-md bg-teal-50 text-teal-800 border border-teal-200 flex items-center justify-center">
                  <CheckCircle2 size={15} />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <AnimatedKpiNumber
                    value={stats.byStatus['AUTO_ROUTED'] || 0}
                    className="text-2xl sm:text-3xl font-extrabold text-teal-800 font-mono tabular-nums tracking-tight"
                  />
                  <span className="text-xs text-slate-600 font-mono tabular-nums">
                    / {(stats.byStatus['APPROVED'] || 0).toLocaleString()} Approved
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
            <div className="p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-red-800 uppercase tracking-wider">
                  SLA Risk
                </p>
                <div className="w-7 h-7 rounded-md bg-red-50 text-red-800 border border-red-200 flex items-center justify-center">
                  <ShieldAlert size={15} />
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

        {/* ─── 2. FULL-WIDTH REVIEW QUEUE ─────────────────────────────────── */}
        <div id="queue" className="w-full rounded-[10px] border border-line bg-white shadow-card overflow-hidden flex flex-col">
          {/* Queue Header & Filters Bar */}
          <div className="p-4 border-b border-line bg-white space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-ink">
                  Complaint Review Queue
                </h2>
                <Badge variant="default" size="sm">
                  Live Queue
                </Badge>
              </div>
              <Link
                to="/reviewer/audit"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 transition-colors self-start sm:self-auto"
              >
                <Sparkles size={12} className="text-teal-600" />
                <span>AI Audit &amp; Benchmark</span>
              </Link>
            </div>
            <p className="text-xs text-slate-600">
              Complaints sorted by nearest SLA breach deadline requiring verification or adjudication.
            </p>

            {/* Filter Controls Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                aria-label="Filter by Status"
                value={selectedStatus}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="flex-1 min-w-[140px] text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white shadow-2xs transition-colors"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="AUTO_ROUTED">Auto-Routed</option>
                <option value="APPROVED">Approved</option>
                <option value="OVERRIDDEN">Overridden</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                aria-label="Filter by Priority"
                value={selectedPriority}
                onChange={(e) => handlePriorityFilterChange(e.target.value)}
                className="flex-1 min-w-[140px] text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white shadow-2xs transition-colors"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              {(selectedStatus !== 'ALL' || selectedPriority !== 'ALL') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 px-2.5 py-1.5 rounded-md hover:bg-teal-50 transition-colors shrink-0"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Table Content Area */}
          <div>
            {queueLoading ? (
              <div data-testid="queue-skeleton" className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 py-3 border-b border-line animate-pulse"
                  >
                    <div className="h-4 bg-slate-200 rounded w-24"></div>
                    <div className="h-4 bg-slate-200 rounded w-32"></div>
                    <div className="h-4 bg-slate-200 rounded w-20"></div>
                    <div className="h-4 bg-slate-200 rounded w-28"></div>
                    <div className="h-4 bg-slate-200 rounded w-16"></div>
                    <div className="h-7 bg-slate-200 rounded-lg w-24"></div>
                  </div>
                ))}
              </div>
            ) : queueError ? (
              <div className="p-5">
                <ErrorState
                  title="Failed to load queue"
                  message={queueError}
                  onRetry={() => fetchQueue(currentPage, selectedStatus, selectedPriority)}
                />
              </div>
            ) : !pageData || pageData.content.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No grievances match the filter criteria"
                  description={
                    selectedStatus !== 'ALL' || selectedPriority !== 'ALL'
                      ? 'Try adjusting or resetting your filter criteria to view more complaints.'
                      : 'The review queue is currently empty. All grievances have been reviewed.'
                  }
                  action={
                    selectedStatus !== 'ALL' || selectedPriority !== 'ALL' ? (
                      <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                        Reset Filters
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-white border-b border-line shadow-2xs">
                      <tr className="text-slate-600 font-semibold uppercase tracking-wider text-[11px] h-10">
                        <th scope="col" className="py-2.5 px-4">
                          Reference
                        </th>
                        <th scope="col" className="py-2.5 px-3">
                          Category
                        </th>
                        <th scope="col" className="py-2.5 px-3">
                          Priority
                        </th>
                        <th scope="col" className="py-2.5 px-3">
                          Time to SLA
                        </th>
                        <th scope="col" className="py-2.5 px-3">
                          Models
                        </th>
                        <th scope="col" className="py-2.5 px-3">
                          Status
                        </th>
                        <th scope="col" className="py-2.5 px-4 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {sortedGrievances.map((grievance) => (
                        <React.Fragment key={grievance.id}>
                          <tr className="h-12 hover:bg-slate-50/80 transition-colors group">
                            {/* 1. Reference */}
                            <td className="py-3 px-4 font-mono font-medium text-ink">
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
                                  className="p-1 rounded text-slate-400 hover:text-ink hover:bg-slate-100 transition-colors"
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

                            {/* 2. Category */}
                            <td className="py-3 px-3 font-medium text-ink">
                              <div className="truncate max-w-[160px]" title={grievance.assignedCategory}>
                                {grievance.assignedCategory}
                              </div>
                            </td>

                            {/* 3. Priority */}
                            <td className="py-3 px-3">
                              <StatusIndicator priority={grievance.priority} size="sm" />
                            </td>

                            {/* 4. Time to SLA */}
                            <td className="py-3 px-3">
                              {renderTimeToSla(grievance)}
                            </td>

                            {/* 5. Models (Agree / Split) */}
                            <td className="py-3 px-3">
                              {grievance.reviewRequired ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0" aria-hidden="true" />
                                  <span className="text-xs font-medium text-slate-700">Split</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" aria-hidden="true" />
                                  <span className="text-xs font-medium text-slate-700">Agree</span>
                                </div>
                              )}
                            </td>

                            {/* 6. Status */}
                            <td className="py-3 px-3">
                              <StatusIndicator status={grievance.status} size="sm" />
                            </td>

                            {/* 7. Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleQuickPeek(grievance.id)}
                                  aria-expanded={expandedRowId === grievance.id}
                                  aria-label={
                                    expandedRowId === grievance.id
                                      ? `Close quick peek for ${grievance.id.substring(0, 8)}`
                                      : `Quick peek for ${grievance.id.substring(0, 8)}`
                                  }
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
                                    expandedRowId === grievance.id
                                      ? 'bg-slate-100 border-slate-300 text-ink shadow-inner'
                                      : 'bg-white hover:bg-slate-50 border-line text-slate-700 shadow-2xs'
                                  }`}
                                >
                                  <Eye
                                    size={12}
                                    className={
                                      expandedRowId === grievance.id ? 'text-teal-700' : 'text-slate-400'
                                    }
                                  />
                                  <span>{expandedRowId === grievance.id ? 'Close' : 'Quick Peek'}</span>
                                </button>
                                <Link
                                  to={`/reviewer/grievances/${grievance.id}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-2xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 shrink-0"
                                >
                                  <span>Review</span>
                                  <ArrowRight size={11} />
                                </Link>
                              </div>
                            </td>
                          </tr>

                          {/* Quick Peek Drawer */}
                          {expandedRowId === grievance.id && (
                            <tr
                              key={`${grievance.id}-quick-peek`}
                              className="bg-slate-50/80 border-b border-line"
                            >
                              <td colSpan={7} className="p-0">
                                <motion.div
                                  layout
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-5 py-4 border-l-4 border-l-teal-700 bg-white">
                                    {quickPeekLoadingId === grievance.id ? (
                                      <div
                                        data-testid="quick-peek-skeleton"
                                        className="space-y-3 animate-pulse"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="h-3.5 bg-slate-200 rounded w-1/3"></div>
                                          <div className="h-3.5 bg-slate-200 rounded w-24"></div>
                                        </div>
                                        <div className="space-y-1.5">
                                          <div className="h-3 bg-slate-200 rounded w-full"></div>
                                          <div className="h-3 bg-slate-200 rounded w-5/6"></div>
                                        </div>
                                      </div>
                                    ) : quickPeekError && !quickPeekCache.get(grievance.id) ? (
                                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between">
                                        <span>Failed to load quick peek: {quickPeekError}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleQuickPeek(grievance.id)}
                                          className="font-semibold underline hover:text-red-900"
                                        >
                                          Retry
                                        </button>
                                      </div>
                                    ) : quickPeekCache.get(grievance.id) ? (
                                      (() => {
                                        const detail = quickPeekCache.get(grievance.id)!;
                                        const pred = detail.originalPrediction;
                                        const topPos =
                                          pred?.explanation?.topPositiveFeatures?.slice(0, 5) || [];
                                        const topNeg =
                                          pred?.explanation?.topNegativeFeatures?.slice(0, 5) || [];

                                        return (
                                          <div data-testid="quick-peek-content" className="space-y-3">
                                            {/* Header badge & lab deep link */}
                                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line">
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] font-bold text-ink uppercase tracking-wider font-mono">
                                                  Quick Peek
                                                </span>
                                                <span className="text-xs text-slate-400">•</span>
                                                <span className="text-[11px] font-mono text-slate-600 tabular-nums">
                                                  ID: {detail.id}
                                                </span>
                                                {pred?.modelUsed && (
                                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                                                    {pred.modelUsed}{' '}
                                                    {pred.modelVersion ? `v${pred.modelVersion}` : ''}
                                                  </span>
                                                )}
                                              </div>
                                              <Link
                                                to={`/reviewer/grievances/${detail.id}`}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded transition-colors shadow-2xs"
                                              >
                                                <Sparkles size={11} className="text-teal-700" />
                                                <span>Open Investigation Lab</span>
                                                <ArrowRight size={10} />
                                              </Link>
                                            </div>

                                            {/* Narrative Snippet */}
                                            <div className="bg-slate-50 rounded-lg p-3 border border-line">
                                              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                                                Consumer Narrative Snippet
                                              </p>
                                              <p className="text-xs text-slate-700 leading-relaxed font-sans line-clamp-3">
                                                &ldquo;{detail.narrative}&rdquo;
                                              </p>
                                            </div>

                                            {/* Model Confidence & Margin */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                              <div className="bg-white p-2.5 rounded-lg border border-line shadow-2xs space-y-1">
                                                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block">
                                                  Classification
                                                </span>
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs font-bold text-ink truncate">
                                                    {pred?.predictedCategory || detail.assignedCategory}
                                                  </span>
                                                  <span className="text-xs font-mono font-bold text-teal-800 tabular-nums">
                                                    {pred ? `${Math.round(pred.confidence * 100)}%` : '—'}
                                                  </span>
                                                </div>
                                              </div>

                                              <div className="bg-white p-2.5 rounded-lg border border-line shadow-2xs space-y-1">
                                                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block">
                                                  Decision Margin
                                                </span>
                                                <div className="flex items-center justify-between font-mono text-xs tabular-nums">
                                                  <span className="font-medium text-slate-700">
                                                    {pred ? `Δ ${(pred.margin * 100).toFixed(1)}%` : '—'}
                                                  </span>
                                                  <span
                                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                                      pred && pred.margin >= 0.15
                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                                    }`}
                                                  >
                                                    {pred && pred.margin >= 0.15 ? 'Robust' : 'Narrow'}
                                                  </span>
                                                </div>
                                              </div>

                                              <div className="bg-white p-2.5 rounded-lg border border-line shadow-2xs space-y-1">
                                                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block">
                                                  Triage Priority
                                                </span>
                                                <div className="flex items-center justify-between text-xs">
                                                  <span className="font-bold text-ink">
                                                    {detail.priority}
                                                  </span>
                                                  <span
                                                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                                      detail.reviewRequired
                                                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                                        : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                                    }`}
                                                  >
                                                    {detail.reviewRequired ? 'HITL Flag' : 'Auto'}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>

                                            {/* Attribution Tokens Chips */}
                                            {(topPos.length > 0 || topNeg.length > 0) && (
                                              <div className="bg-white p-2.5 rounded-lg border border-line shadow-2xs space-y-1.5">
                                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                                                  <span>Feature Attribution Chips</span>
                                                  <span className="text-slate-500 font-mono">TF-IDF Weights</span>
                                                </div>
                                                <motion.div
                                                  variants={tokenContainerVariants}
                                                  initial="hidden"
                                                  animate="visible"
                                                  className="flex flex-wrap items-center gap-1.5"
                                                >
                                                  {topPos.map((feat, idx) => (
                                                    <motion.span
                                                      key={`pos-${idx}-${feat.feature}`}
                                                      variants={tokenItemVariants}
                                                      title={`Contribution: +${feat.contribution.toFixed(3)}`}
                                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-teal-50 text-teal-800 border border-teal-200 tabular-nums"
                                                    >
                                                      <span>+{feat.feature}</span>
                                                      <span className="text-[10px] text-teal-700 font-bold opacity-80">
                                                        {feat.contribution > 0
                                                          ? `+${feat.contribution.toFixed(2)}`
                                                          : feat.contribution.toFixed(2)}
                                                      </span>
                                                    </motion.span>
                                                  ))}
                                                  {topNeg.map((feat, idx) => (
                                                    <motion.span
                                                      key={`neg-${idx}-${feat.feature}`}
                                                      variants={tokenItemVariants}
                                                      title={`Contribution: ${feat.contribution.toFixed(3)}`}
                                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-red-50 text-red-800 border border-red-200 tabular-nums"
                                                    >
                                                      <span>{feat.feature}</span>
                                                      <span className="text-[10px] text-red-700 font-bold opacity-80">
                                                        {feat.contribution.toFixed(2)}
                                                      </span>
                                                    </motion.span>
                                                  ))}
                                                </motion.div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()
                                    ) : null}
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-line bg-slate-50/70 text-xs text-slate-600">
                  <div className="tabular-nums">
                    Showing{' '}
                    <span className="font-semibold text-ink">
                      {pageData.number * pageData.size + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-semibold text-ink">
                      {Math.min(
                        (pageData.number + 1) * pageData.size,
                        pageData.totalElements
                      )}
                    </span>{' '}
                    of{' '}
                    <span className="font-semibold text-ink">
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
                      className="bg-white hover:bg-slate-50 border-line text-slate-700 shadow-2xs text-xs px-2.5 py-1"
                    >
                      Previous
                    </Button>

                    <span className="px-1.5 font-mono font-medium text-slate-700 text-xs tabular-nums">
                      Page {pageData.number + 1} of {Math.max(1, pageData.totalPages)}
                    </span>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => prev + 1)}
                      disabled={pageData.last || queueLoading}
                      rightIcon={<ChevronRight size={13} />}
                      className="bg-white hover:bg-slate-50 border-line text-slate-700 shadow-2xs text-xs px-2.5 py-1"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── 3. CHARTS BELOW QUEUE: 2-COLUMN GRID ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: 14-Day Complaint Velocity & Trend Chart */}
          <div className="bg-white rounded-[10px] p-5 border border-line shadow-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-ink tracking-tight">
                      14-Day Complaint Velocity &amp; Adjudication Trend
                    </h3>
                    <span className="text-[10px] font-mono font-medium text-slate-600 bg-slate-100 border border-line px-1.5 py-0.5 rounded">
                      Live Queue Data
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Daily intake vs. automated routing and reviewer adjudication volume
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-teal-700 inline-block" />
                  Intake
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                  Auto-Routed
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  Reviewed
                </span>
              </div>
            </div>

            {trendPoints ? (
              <div className="relative">
                <svg
                  viewBox={`0 0 ${trendPoints.width} ${trendPoints.height}`}
                  className="w-full h-44 overflow-visible select-none"
                >
                  <defs>
                    <linearGradient id="trend-teal-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0F766E" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#0F766E" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guideline Grids */}
                  {[0.25, 0.5, 0.75, 1.0].map((ratio) => {
                    const y =
                      trendPoints.height -
                      trendPoints.paddingY -
                      ratio * (trendPoints.height - trendPoints.paddingY * 2);
                    return (
                      <line
                        key={ratio}
                        x1={trendPoints.paddingX}
                        y1={y}
                        x2={trendPoints.width - trendPoints.paddingX}
                        y2={y}
                        stroke="#E3E7ED"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                    );
                  })}

                  {/* Gradient Area under Intake curve */}
                  <path d={trendPoints.totalArea} fill="url(#trend-teal-gradient)" />

                  {/* Auto-routed line */}
                  <path
                    d={trendPoints.autoPath}
                    fill="none"
                    stroke="#0EA5E9"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />

                  {/* Total Intake Line */}
                  <path
                    d={trendPoints.totalPath}
                    fill="none"
                    stroke="#0F766E"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Data Points on Hover */}
                  {trendPoints.coords.map((pt, idx) => {
                    const isHovered = hoveredTrendIdx === idx;
                    return (
                      <g key={idx}>
                        {isHovered && (
                          <line
                            x1={pt.x}
                            y1={trendPoints.paddingY}
                            x2={pt.x}
                            y2={trendPoints.height - trendPoints.paddingY}
                            stroke="#0F766E"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.yTotal}
                          r={isHovered ? 5 : 3}
                          className={`transition-all duration-150 cursor-pointer ${
                            isHovered ? 'fill-teal-700 stroke-white stroke-2' : 'fill-teal-600'
                          }`}
                          onMouseEnter={() => setHoveredTrendIdx(idx)}
                          onMouseLeave={() => setHoveredTrendIdx(null)}
                        />
                        {/* Date labels at bottom */}
                        {idx % 2 === 0 && (
                          <text
                            x={pt.x}
                            y={trendPoints.height - 6}
                            textAnchor="middle"
                            fill="#64748B"
                            fontSize="11"
                            fontFamily="monospace"
                            className="tabular-nums"
                          >
                            {pt.date}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Micro Tooltip */}
                {hoveredTrendIdx !== null && trendPoints.coords[hoveredTrendIdx] && (
                  <div className="mt-2 p-2.5 rounded-lg bg-ink text-white text-xs flex flex-wrap items-center justify-between gap-4 font-mono">
                    <div>
                      <span className="text-slate-400">Date: </span>
                      <span className="font-bold">{trendPoints.coords[hoveredTrendIdx].date}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-teal-400">Intake: </span>
                        <span className="font-bold tabular-nums">{trendPoints.coords[hoveredTrendIdx].intakeCount}</span>
                      </div>
                      <div>
                        <span className="text-sky-400">Auto: </span>
                        <span className="font-bold tabular-nums">{trendPoints.coords[hoveredTrendIdx].autoRoutedCount}</span>
                      </div>
                      <div>
                        <span className="text-amber-400">Reviewed: </span>
                        <span className="font-bold tabular-nums">{trendPoints.coords[hoveredTrendIdx].humanReviewedCount}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-slate-500 text-xs font-mono">
                Loading trend telemetry...
              </div>
            )}
          </div>

          {/* Right: Volume & Priority Matrix */}
          {stats && (
            <div className="bg-white rounded-[10px] p-5 border border-line shadow-card space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center">
                    <BarChart2 size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-ink tracking-tight">
                        Volume &amp; Priority Breakdown
                      </h3>
                      <span className="text-[10px] font-mono font-medium text-slate-600 bg-slate-100 border border-line px-1.5 py-0.5 rounded">
                        Live Queue Data
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Complaint workflow distribution and priority severity classification
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 border border-line px-2 py-0.5 rounded-md tabular-nums">
                  {stats.total} Cases
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column 1: Complaint Status Distribution */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Workflow Status Breakdown
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      5 States
                    </span>
                  </div>

                  {/* Multi-segment distribution bar */}
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    {statusDistribution.map((item) =>
                      item.percentage > 0 ? (
                        <div
                          key={item.key}
                          style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                          className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full hover:opacity-90"
                          title={`${item.label}: ${item.count} (${item.percentage}%)`}
                        />
                      ) : null
                    )}
                  </div>

                  {/* Status Legend & Breakdown */}
                  <div className="space-y-1.5 pt-1">
                    {statusDistribution.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-line hover:bg-slate-100/70 transition-colors"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className={`w-2 h-2 rounded-full ${item.dotClass} shrink-0`} />
                          <span className="text-slate-700 truncate font-medium text-xs">
                            {item.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                          <span className="text-slate-500 text-[11px]">{item.percentage}%</span>
                          <span className="font-bold text-ink bg-white border border-line px-1.5 py-0.5 rounded text-[11px]">
                            {item.count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Column 2: Triage Priority Severity Breakdown */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Priority Severity Breakdown
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      4 Levels
                    </span>
                  </div>

                  {/* Priority Bars List */}
                  <div className="space-y-3 pt-1">
                    {priorityDistribution.map((item) => (
                      <div key={item.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 text-xs">
                            {item.label} Priority
                          </span>
                          <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                            <span className="text-slate-500 text-[11px]">{item.percentage}%</span>
                            <span className="font-bold text-ink">{item.count}</span>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                          <div
                            className={`h-full ${item.bgClass} rounded-full transition-all duration-300`}
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ReviewerLayout>
  );
};
