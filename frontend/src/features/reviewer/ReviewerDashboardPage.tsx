import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  RotateCcw,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  BarChart2,
  PieChart,
  ArrowRight,
  Sparkles,
  Eye,
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

function formatAging(submittedAt: string) {
  const ms = Math.max(0, Date.now() - new Date(submittedAt).getTime());
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(ms / (1000 * 60)));
    return `${mins}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
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

  // Quick Peek State & Cache
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [quickPeekCache, setQuickPeekCache] = useState<Map<string, GrievanceDetailResponse>>(() => new Map());
  const [quickPeekLoadingId, setQuickPeekLoadingId] = useState<string | null>(null);
  const [quickPeekError, setQuickPeekError] = useState<string | null>(null);

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
        const params: {
          page: number;
          size: number;
          status?: GrievanceStatus;
          priority?: TriagePriority;
        } = {
          page,
          size: 20,
        };

        if (status !== 'ALL') {
          params.status = status as GrievanceStatus;
        }
        if (priority !== 'ALL') {
          params.priority = priority as TriagePriority;
        }

        const data = await listGrievances(params, signal);
        setPageData(data);
      } catch (err) {
        if (err instanceof ApiError) {
          setQueueError(err.message || `Failed to load grievance queue (${err.status})`);
        } else if (err instanceof Error && err.name !== 'AbortError') {
          setQueueError(err.message);
        }
      } finally {
        setQueueLoading(false);
      }
    },
    []
  );

  // Load initial data
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

  return (
    <ReviewerLayout
      title="Triage & Queue Management"
      subtitle="Real-time consumer finance complaint intelligence & human-in-the-loop triage."
      onRefresh={handleRefreshAll}
      isRefreshing={statsLoading || queueLoading}
    >
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 font-sans">
              Reviewer Workspace
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Human-in-the-loop queue for consumer grievance triage and adjudication.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefreshAll}
              leftIcon={<RotateCcw size={14} />}
              disabled={statsLoading || queueLoading}
              className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-xs"
            >
              Refresh Data
            </Button>
          </div>
        </div>

        {/* ─── 1. TOP METRICS ROW (Material 3 Fintech KPI Cards) ────────────── */}
        {statsLoading && !stats ? (
          <div data-testid="stats-skeleton" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs animate-pulse space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-slate-200 rounded w-28"></div>
                  <div className="w-10 h-10 rounded-xl bg-slate-200"></div>
                </div>
                <div className="h-8 bg-slate-200 rounded w-20"></div>
                <div className="h-2.5 bg-slate-200 rounded w-36"></div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Total Grievances */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Grievances
                </p>
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Layers size={18} />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 mt-2 font-mono tracking-tight">
                {stats.total.toLocaleString()}
              </p>
              <div className="mt-2 text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-500 inline-block"></span>
                <span>Active repository aggregate</span>
              </div>
            </div>

            {/* 2. Pending Review (Highlighted Action Metric) */}
            <div className="bg-white rounded-2xl p-5 border border-amber-300 shadow-xs hover:shadow-sm transition-shadow relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-full -mr-8 -mt-8 pointer-events-none opacity-60"></div>
              <div className="flex items-center justify-between relative z-1">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                  Pending Review
                </p>
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Clock size={18} />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-amber-700 mt-2 font-mono tracking-tight relative z-1">
                {stats.pendingReview.toLocaleString()}
              </p>
              <div className="mt-2 text-[11px] text-amber-600 font-medium flex items-center gap-1.5 relative z-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block"></span>
                <span>Requires reviewer attention</span>
              </div>
            </div>

            {/* 3. Approved Grievances */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                  Approved
                </p>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-emerald-700 mt-2 font-mono tracking-tight">
                {(stats.byStatus['APPROVED'] || 0).toLocaleString()}
              </p>
              <div className="mt-2 text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                <span>
                  {stats.total > 0
                    ? `${Math.round(((stats.byStatus['APPROVED'] || 0) / stats.total) * 100)}% of total volume`
                    : 'Confirmed classification'}
                </span>
              </div>
            </div>

            {/* 4. High / Critical Priority */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
                  High / Critical Priority
                </p>
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <ShieldAlert size={18} />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-rose-700 mt-2 font-mono tracking-tight">
                {((stats.byPriority['CRITICAL'] || 0) + (stats.byPriority['HIGH'] || 0)).toLocaleString()}
              </p>
              <div className="mt-2 text-[11px] text-rose-600 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                <span>
                  Critical: {stats.byPriority['CRITICAL'] || 0} • High: {stats.byPriority['HIGH'] || 0}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* ─── 2. ANALYTICS & DISTRIBUTION WIDGETS ───────────────────────── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Widget A: Complaint Status Distribution */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                    <PieChart size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Complaint Status Distribution
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Triage workflow states across all records
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-500">
                  {stats.total} Cases
                </span>
              </div>

              {/* Multi-segment distribution bar */}
              <div className="mt-4">
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100 text-xs">
                  {statusDistribution.map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className={`w-2 h-2 rounded-full ${item.dotClass} shrink-0`} />
                        <span className="text-slate-600 truncate font-medium text-[11px]">
                          {item.label}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-800 text-[11px] ml-1">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Widget B: Priority Severity Breakdown */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <BarChart2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Triage Priority Breakdown
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Severity assessment calculated by NLP rule engine
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-500">
                  4 Levels
                </span>
              </div>

              {/* Priority Bars List */}
              <div className="mt-4 space-y-3">
                {priorityDistribution.map((item) => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 text-[11px]">
                        {item.label} Priority
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="text-slate-400">{item.percentage}%</span>
                        <span className="font-bold text-slate-900">{item.count}</span>
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
        )}

        {/* ─── 3. COMPLAINT REVIEW QUEUE TABLE ───────────────────────────── */}
        <div id="queue" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Queue Header & Filters Bar */}
          <div className="p-5 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Complaint Review Queue
                </h2>
                <Badge variant="default" size="sm">
                  Live Queue
                </Badge>
                <Link
                  to="/reviewer/audit"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 transition-all shadow-2xs ml-1"
                >
                  <Sparkles size={13} className="text-teal-600" />
                  AI Audit &amp; Benchmarks
                </Link>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complaints requiring human verification or priority adjudication.
              </p>
            </div>

            {/* Filter Bar Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-1 font-medium">
                <Filter size={14} className="text-slate-400" />
                <span>Filters:</span>
              </div>

              {/* Status Filter Dropdown */}
              <select
                aria-label="Filter by Status"
                value={selectedStatus}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 focus:bg-white shadow-2xs transition-colors"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="AUTO_ROUTED">Auto-Routed</option>
                <option value="APPROVED">Approved</option>
                <option value="OVERRIDDEN">Overridden</option>
                <option value="REJECTED">Rejected</option>
              </select>

              {/* Priority Filter Dropdown */}
              <select
                aria-label="Filter by Priority"
                value={selectedPriority}
                onChange={(e) => handlePriorityFilterChange(e.target.value)}
                className="text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 focus:bg-white shadow-2xs transition-colors"
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
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 px-2 py-1.5 rounded-md hover:bg-teal-50 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Table Content Area */}
          <div>
            {queueLoading ? (
              <div data-testid="queue-skeleton" className="p-5 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 animate-pulse"
                  >
                    <div className="h-4 bg-slate-200 rounded w-24"></div>
                    <div className="h-4 bg-slate-200 rounded w-44"></div>
                    <div className="h-4 bg-slate-200 rounded w-20"></div>
                    <div className="h-4 bg-slate-200 rounded w-24"></div>
                    <div className="h-4 bg-slate-200 rounded w-28"></div>
                    <div className="h-8 bg-slate-200 rounded-lg w-36"></div>
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
            ) : !pageData || pageData.content.length === 0 ? (
              <div className="p-8">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                        <th scope="col" className="py-3 px-5">
                          Complaint ID
                        </th>
                        <th scope="col" className="py-3 px-4">
                          Product Category
                        </th>
                        <th scope="col" className="py-3 px-4">
                          Priority
                        </th>
                        <th scope="col" className="py-3 px-4">
                          Review Status
                        </th>
                        <th scope="col" className="py-3 px-4">
                          Submitted At
                        </th>
                        <th scope="col" className="py-3 px-5 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pageData.content.map((grievance) => (
                        <React.Fragment key={grievance.id}>
                          <tr className="hover:bg-slate-50/80 transition-colors group">
                            <td className="py-3.5 px-5 font-mono font-medium text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span
                                  title={grievance.id}
                                  className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-bold"
                                >
                                  {grievance.id.substring(0, 8)}...
                                </span>
                                {grievance.version != null && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    v{grievance.version}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-800">
                              <div className="truncate max-w-[220px]" title={grievance.assignedCategory}>
                                {grievance.assignedCategory}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator priority={grievance.priority} size="sm" />
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  {grievance.priority === 'CRITICAL'
                                    ? '24h SLA'
                                    : grievance.priority === 'HIGH'
                                      ? '72h SLA'
                                      : grievance.priority === 'MEDIUM'
                                        ? '5d SLA'
                                        : '10d SLA'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status={grievance.status} size="sm" />
                                {grievance.reviewRequired ? (
                                  <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                    FLAGGED
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                                    AUTO
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-700 tabular-nums">
                                  {formatAging(grievance.submittedAt)}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(grievance.submittedAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-5 text-right">
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
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    expandedRowId === grievance.id
                                      ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-inner'
                                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                                  }`}
                                >
                                  <Eye
                                    size={13}
                                    className={
                                      expandedRowId === grievance.id ? 'text-teal-600' : 'text-slate-400'
                                    }
                                  />
                                  <span>{expandedRowId === grievance.id ? 'Close' : 'Quick Peek'}</span>
                                </button>
                                <Link
                                  to={`/reviewer/grievances/${grievance.id}`}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-xs group-hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                                >
                                  <span>Review</span>
                                  <ArrowRight size={12} />
                                </Link>
                              </div>
                            </td>
                          </tr>

                          {/* Quick Peek Drawer */}
                          {expandedRowId === grievance.id && (
                            <tr
                              key={`${grievance.id}-quick-peek`}
                              className="bg-slate-50/80 border-b border-slate-200"
                            >
                              <td colSpan={6} className="p-0">
                                <div className="px-6 py-5 border-l-4 border-l-teal-600 bg-linear-to-b from-slate-50/70 to-white">
                                  {quickPeekLoadingId === grievance.id ? (
                                    <div
                                      data-testid="quick-peek-skeleton"
                                      className="space-y-4 animate-pulse"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                                        <div className="h-4 bg-slate-200 rounded w-28"></div>
                                      </div>
                                      <div className="space-y-2">
                                        <div className="h-3.5 bg-slate-200 rounded w-full"></div>
                                        <div className="h-3.5 bg-slate-200 rounded w-5/6"></div>
                                        <div className="h-3.5 bg-slate-200 rounded w-3/4"></div>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                                        <div className="h-16 bg-slate-200 rounded-xl"></div>
                                        <div className="h-16 bg-slate-200 rounded-xl"></div>
                                        <div className="h-16 bg-slate-200 rounded-xl"></div>
                                      </div>
                                    </div>
                                  ) : quickPeekError && !quickPeekCache.get(grievance.id) ? (
                                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                                      <span>Failed to load quick peek: {quickPeekError}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleQuickPeek(grievance.id)}
                                        className="font-semibold underline hover:text-rose-900"
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
                                        <div data-testid="quick-peek-content" className="space-y-4">
                                          {/* Header badge & lab deep link */}
                                          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                                                Quick Peek Analysis
                                              </span>
                                              <span className="text-xs text-slate-400">•</span>
                                              <span className="text-xs font-mono text-slate-500">
                                                ID: {detail.id}
                                              </span>
                                              {pred?.modelUsed && (
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">
                                                  {pred.modelUsed}{' '}
                                                  {pred.modelVersion ? `v${pred.modelVersion}` : ''}
                                                </span>
                                              )}
                                            </div>
                                            <Link
                                              to={`/reviewer/grievances/${detail.id}`}
                                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg transition-colors shadow-2xs"
                                            >
                                              <Sparkles size={13} className="text-teal-600" />
                                              <span>Open Investigation Lab</span>
                                              <ArrowRight size={12} />
                                            </Link>
                                          </div>

                                          {/* Narrative Snippet */}
                                          <div className="bg-slate-100/70 rounded-xl p-3.5 border border-slate-200/80">
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                              Consumer Narrative Snippet
                                            </p>
                                            <p className="text-xs text-slate-700 leading-relaxed font-sans line-clamp-3">
                                              &ldquo;{detail.narrative}&rdquo;
                                            </p>
                                          </div>

                                          {/* Model Confidence, Margin & Explanation Attribution */}
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {/* Prediction & Confidence */}
                                            <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                Model Classification
                                              </span>
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-900 truncate">
                                                  {pred?.predictedCategory || detail.assignedCategory}
                                                </span>
                                                <span className="text-xs font-mono font-bold text-teal-700">
                                                  {pred ? `${Math.round(pred.confidence * 100)}%` : '—'}
                                                </span>
                                              </div>
                                              {pred && (
                                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                  <div
                                                    className="bg-teal-600 h-full rounded-full transition-all duration-300"
                                                    style={{
                                                      width: `${Math.min(
                                                        100,
                                                        Math.round(pred.confidence * 100)
                                                      )}%`,
                                                    }}
                                                  />
                                                </div>
                                              )}
                                            </div>

                                            {/* Margin Meter */}
                                            <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                Decision Margin
                                              </span>
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-mono font-medium text-slate-700">
                                                  {pred ? `Δ ${(pred.margin * 100).toFixed(1)}%` : '—'}
                                                </span>
                                                <span
                                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                                    pred && pred.margin >= 0.15
                                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                  }`}
                                                >
                                                  {pred && pred.margin >= 0.15 ? 'Robust' : 'Narrow'}
                                                </span>
                                              </div>
                                              {pred && (
                                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                  <div
                                                    className={`h-full rounded-full transition-all duration-300 ${
                                                      pred.margin >= 0.15
                                                        ? 'bg-emerald-500'
                                                        : 'bg-amber-500'
                                                    }`}
                                                    style={{
                                                      width: `${Math.min(
                                                        100,
                                                        Math.round(pred.margin * 100)
                                                      )}%`,
                                                    }}
                                                  />
                                                </div>
                                              )}
                                            </div>

                                            {/* Priority & Flag */}
                                            <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                Triage Assessment
                                              </span>
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-900">
                                                  {detail.priority} Priority
                                                </span>
                                                <span
                                                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                                    detail.reviewRequired
                                                      ? 'bg-amber-100 text-amber-800'
                                                      : 'bg-emerald-100 text-emerald-800'
                                                  }`}
                                                >
                                                  {detail.reviewRequired ? 'HITL Flagged' : 'Auto-Routing'}
                                                </span>
                                              </div>
                                              <div className="text-[10px] text-slate-400 truncate">
                                                {detail.reviewRequired
                                                  ? 'Low confidence / high priority'
                                                  : 'Confidence above threshold'}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Attribution Tokens Chips if available */}
                                          {(topPos.length > 0 || topNeg.length > 0) && (
                                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-2">
                                              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                                                <span>
                                                  Feature Attribution Chips (Linear Explainability)
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                  TF-IDF &middot; LogReg Weights
                                                </span>
                                              </div>
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                {topPos.map((feat, idx) => (
                                                  <span
                                                    key={`pos-${idx}-${feat.feature}`}
                                                    title={`Positive feature: contribution +${feat.contribution.toFixed(3)}`}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200"
                                                  >
                                                    <span>+{feat.feature}</span>
                                                    <span className="text-[9px] text-emerald-600 font-bold opacity-80">
                                                      {feat.contribution > 0
                                                        ? `+${feat.contribution.toFixed(2)}`
                                                        : feat.contribution.toFixed(2)}
                                                    </span>
                                                  </span>
                                                ))}
                                                {topNeg.map((feat, idx) => (
                                                  <span
                                                    key={`neg-${idx}-${feat.feature}`}
                                                    title={`Negative feature: contribution ${feat.contribution.toFixed(3)}`}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-rose-50 text-rose-800 border border-rose-200"
                                                  >
                                                    <span>{feat.feature}</span>
                                                    <span className="text-[9px] text-rose-600 font-bold opacity-80">
                                                      {feat.contribution.toFixed(2)}
                                                    </span>
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Material 3 Pagination Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-3.5 border-t border-slate-200/80 bg-slate-50/50 text-xs text-slate-500">
                  <div>
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
                    </span>{' '}
                    complaints
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                      disabled={pageData.first || queueLoading}
                      leftIcon={<ChevronLeft size={14} />}
                      className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                    >
                      Previous
                    </Button>

                    <span className="px-2 font-mono font-medium text-slate-700 text-xs">
                      Page {pageData.number + 1} of {Math.max(1, pageData.totalPages)}
                    </span>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => prev + 1)}
                      disabled={pageData.last || queueLoading}
                      rightIcon={<ChevronRight size={14} />}
                      className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
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
    </ReviewerLayout>
  );
};
