import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  RotateCcw,
  BarChart3,
  Layers,
  Activity,
  Zap,
  Info,
  Database,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { ReviewerLayout } from '../../components/layout/ReviewerLayout';
import { Button } from '../../components/ui/Button';
import { getExecutiveAnalytics, seedDemoTelemetry } from '../../lib/api/endpoints';
import { ExecutiveAnalyticsResponse, DailyIntakeTrendPoint } from '../../types/grievance';
import { MonteCarloStressLab } from './components/MonteCarloStressLab';

type TimeHorizon = '7D' | '14D' | '30D' | '90D';

export const ExecutiveAnalyticsPage: React.FC = () => {
  const [data, setData] = useState<ExecutiveAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccessMessage, setSeedSuccessMessage] = useState<string | null>(null);
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
  const [selectedHorizon, setSelectedHorizon] = useState<TimeHorizon>('14D');
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Accessibility refs for seeding confirmation dialog
  const seedTriggerRef = useRef<HTMLButtonElement | null>(null);
  const seedDialogRef = useRef<HTMLDivElement | null>(null);

  const fetchTelemetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getExecutiveAnalytics();
      setData(res);
      const now = new Date();
      setLastRefreshed(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve executive analytics';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  // Focus management and Escape handler for Seeding Confirmation Dialog
  useEffect(() => {
    if (!showSeedModal) return;

    const dialog = seedDialogRef.current;
    if (!dialog) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = dialog.querySelectorAll<HTMLElement>(focusableSelector);
    const firstElement = focusableElements[0];
    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowSeedModal(false);
        seedTriggerRef.current?.focus();
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
  }, [showSeedModal]);

  const handleSeedDemoData = async () => {
    if (seeding) return;
    setSeeding(true);
    setSeedSuccessMessage(null);
    setShowSeedModal(false);
    try {
      const res = await seedDemoTelemetry();
      setSeedSuccessMessage(res.message || 'Seeded 32 authentic CFPB complaints across all 8 categories.');
      await fetchTelemetry();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to seed demo complaints';
      setError(message);
    } finally {
      setSeeding(false);
      seedTriggerRef.current?.focus();
    }
  };

  // Calculations for KPI rates
  const autoRoutePct = useMemo(() => {
    if (!data) return 0;
    return Math.round((data.autoRoutingEfficiencyRate || 0) * 100);
  }, [data]);

  const slaPct = useMemo(() => {
    if (!data) return 100;
    return Math.round((data.slaComplianceRate || 0) * 100);
  }, [data]);

  const humanReviewedCount = useMemo(() => {
    return data?.humanReviewed ?? 0;
  }, [data]);

  const overriddenCount = useMemo(() => {
    return data?.statusDistribution?.OVERRIDDEN ?? 0;
  }, [data]);

  const approvedCount = useMemo(() => {
    return data?.statusDistribution?.APPROVED ?? 0;
  }, [data]);

  const rejectedCount = useMemo(() => {
    return data?.statusDistribution?.REJECTED ?? 0;
  }, [data]);

  const totalAtRiskOrBreached = useMemo(() => {
    if (!data?.slaAgingBreakdown) return 0;
    return (data.slaAgingBreakdown.atRisk || 0) + (data.slaAgingBreakdown.breached || 0);
  }, [data]);

  // Time horizon slicing: 7D vs 14D (backend provides exactly 14 daily buckets)
  const displayedDailyTrends: DailyIntakeTrendPoint[] = useMemo(() => {
    if (!data?.dailyIntakeTrend || data.dailyIntakeTrend.length === 0) return [];
    if (selectedHorizon === '7D') {
      return data.dailyIntakeTrend.slice(-7);
    }
    return data.dailyIntakeTrend;
  }, [data, selectedHorizon]);

  // Aggregated totals for currently displayed horizon
  const horizonSummary = useMemo(() => {
    if (displayedDailyTrends.length === 0) {
      return { totalInflow: 0, totalAuto: 0, totalReviewed: 0, avgDaily: 0 };
    }
    const totalInflow = displayedDailyTrends.reduce((acc, pt) => acc + pt.intakeCount, 0);
    const totalAuto = displayedDailyTrends.reduce((acc, pt) => acc + pt.autoRoutedCount, 0);
    const totalReviewed = displayedDailyTrends.reduce((acc, pt) => acc + pt.humanReviewedCount, 0);
    const avgDaily = Math.round((totalInflow / displayedDailyTrends.length) * 10) / 10;
    return { totalInflow, totalAuto, totalReviewed, avgDaily };
  }, [displayedDailyTrends]);

  // SVG Area Chart points generator
  const trendPoints = useMemo(() => {
    if (displayedDailyTrends.length === 0) return null;
    const trends = displayedDailyTrends;
    const maxVal = Math.max(1, ...trends.map((t) => t.intakeCount));
    const width = 680;
    const height = 200;
    const paddingX = 35;
    const paddingY = 25;
    const usableW = width - paddingX * 2;
    const usableH = height - paddingY * 2;

    const coords = trends.map((t, idx) => {
      const x = paddingX + (idx / Math.max(1, trends.length - 1)) * usableW;
      const yTotal = height - paddingY - (t.intakeCount / maxVal) * usableH;
      const yAuto = height - paddingY - (t.autoRoutedCount / maxVal) * usableH;
      const yReview = height - paddingY - (t.humanReviewedCount / maxVal) * usableH;
      return { x, yTotal, yAuto, yReview, ...t };
    });

    const createPath = (key: 'yTotal' | 'yAuto' | 'yReview') => {
      return coords.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt[key]}`, '');
    };

    const totalPath = createPath('yTotal');
    const autoPath = createPath('yAuto');
    const reviewPath = createPath('yReview');

    const lastX = coords[coords.length - 1]?.x ?? usableW;
    const firstX = coords[0]?.x ?? paddingX;
    const areaPath = `${totalPath} L ${lastX},${height - paddingY} L ${firstX},${height - paddingY} Z`;

    return { coords, totalPath, autoPath, reviewPath, areaPath, width, height, maxVal, paddingY };
  }, [displayedDailyTrends]);

  return (
    <ReviewerLayout
      title="Executive Operations & Analytics"
      subtitle="Operational telemetry, triage automation velocity, SLA health, and calibration distribution"
      onRefresh={fetchTelemetry}
      isRefreshing={loading}
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* ========================================================================= */}
        {/* TOP RAIL: EXECUTIVE CONTEXT & REFRESH STATUS                             */}
        {/* ========================================================================= */}
        <section
          aria-label="Executive Analytics Header"
          className="bg-white border border-line rounded-[10px] p-5 text-ink flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-card"
        >
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                <Activity size={12} className="text-teal-700" />
                On-Demand Telemetry
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Point-in-Time Database Snapshot
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-ink font-serif">
              Grievance Intake &amp; AI Triage Intelligence Hub
            </h1>
            <p className="text-xs text-slate-600 flex items-center gap-1.5">
              <Info size={13} className="text-teal-700 flex-shrink-0" />
              <span>Uncalibrated model probability estimates; operational telemetry and decision support only.</span>
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {lastRefreshed && (
              <span className="text-[11px] text-slate-500 font-mono">
                Last Updated: {lastRefreshed}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchTelemetry}
              disabled={loading}
              className="text-xs gap-1.5 shadow-2xs"
            >
              <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </Button>
          </div>
        </section>

        {/* Seed Success Banner */}
        {seedSuccessMessage && (
          <div
            role="status"
            className="p-4 rounded-[10px] bg-teal-50 border border-teal-200 text-teal-900 flex items-center justify-between text-xs animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-teal-700 flex-shrink-0" />
              <span>{seedSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSeedSuccessMessage(null)}
              className="text-teal-700 hover:text-teal-900 underline text-xs font-medium cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div
            role="alert"
            className="p-4 rounded-[10px] bg-red-50 border border-red-200 text-red-800 flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={fetchTelemetry}
              className="px-2.5 py-1 bg-red-100 hover:bg-red-200 rounded text-red-900 font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION A: EXECUTIVE OVERVIEW (5 KEY METRIC TILES)                       */}
        {/* ========================================================================= */}
        <section aria-labelledby="executive-overview-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="executive-overview-heading" className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
              Operational Health &amp; Ingestion KPIs
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">Point-in-Time Snapshot</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Metric 1: Total Volume */}
            <div className="p-4 rounded-[10px] bg-white border border-line shadow-card flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  Total Ingested
                </span>
                <div className="p-1.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  <Layers size={14} />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl sm:text-3xl font-extrabold text-ink font-mono tracking-tight tabular-nums">
                  {data ? data.totalComplaints.toLocaleString() : '—'}
                </div>
                <p className="mt-1 text-[11px] text-slate-600 flex items-center gap-1">
                  <span className="font-semibold text-teal-700 tabular-nums">{data?.pendingReview ?? 0}</span>
                  <span>pending triage review</span>
                </p>
              </div>
            </div>

            {/* Metric 2: Straight-Through Automation Rate */}
            <div className="p-4 rounded-[10px] bg-white border border-line shadow-card flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    Straight-Through Automation Rate
                  </span>
                  <span
                    role="note"
                    tabIndex={0}
                    aria-label="Percentage of all ingested grievances currently classified as AUTO_ROUTED. Measures volume routing proportion, not model prediction accuracy or precision."
                    title="Percentage of all ingested grievances currently classified as AUTO_ROUTED. Measures volume routing proportion, not model prediction accuracy or precision."
                    className="cursor-help text-slate-400 hover:text-slate-600 focus:outline-hidden"
                  >
                    <Info size={12} />
                  </span>
                </div>
                <div className="p-1.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 flex-shrink-0">
                  <Zap size={14} />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-ink font-mono tracking-tight tabular-nums">
                    {autoRoutePct}%
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center">
                    <ArrowUpRight size={13} />
                    Auto
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  <span className="font-mono tabular-nums font-semibold">{data?.autoRouted ?? 0}</span> straight-through cases
                </p>
              </div>
            </div>

            {/* Metric 3: Adjudicated Volume */}
            <div className="p-4 rounded-[10px] bg-white border border-line shadow-card flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  Adjudicated Volume
                </span>
                <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <CheckCircle2 size={14} />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl sm:text-3xl font-extrabold text-ink font-mono tracking-tight tabular-nums">
                  {humanReviewedCount}
                </div>
                <p className="mt-1 text-[11px] text-slate-600 flex flex-wrap items-center gap-1">
                  <span className="font-semibold text-indigo-700 tabular-nums">{approvedCount}</span> approved
                  <span className="text-slate-400">•</span>
                  <span className="font-semibold text-amber-700 tabular-nums">{overriddenCount}</span> overrides
                  <span className="text-slate-400">•</span>
                  <span className="font-semibold text-rose-700 tabular-nums">{rejectedCount}</span> rejected
                </p>
              </div>
            </div>

            {/* Metric 4: SLA Compliance Rate */}
            <div className="p-4 rounded-[10px] bg-white border border-line shadow-card flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  SLA Compliance
                </span>
                <div className="p-1.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                  <Clock size={14} />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-ink font-mono tracking-tight tabular-nums">
                    {slaPct}%
                  </span>
                  <span className="text-[11px] text-purple-700 font-semibold font-mono">
                    &le;24h
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  <span className="font-semibold tabular-nums">{data?.slaAgingBreakdown?.onTrack ?? 0}</span> within target
                </p>
              </div>
            </div>

            {/* Metric 5: SLA Risk & Backlog Escalation */}
            <div className="p-4 rounded-[10px] bg-white border border-line shadow-card flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  Queue At-Risk
                </span>
                <div className={`p-1.5 rounded-md border ${totalAtRiskOrBreached > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  <AlertTriangle size={14} />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-2xl sm:text-3xl font-extrabold text-ink font-mono tracking-tight tabular-nums">
                  {totalAtRiskOrBreached}
                </div>
                <p className="mt-1 text-[11px] text-slate-600 flex flex-wrap items-center gap-1">
                  <span className="font-semibold text-red-700 tabular-nums">{data?.slaAgingBreakdown?.breached ?? 0}</span> escalation breach
                  <span className="text-slate-400">•</span>
                  <span className="font-semibold text-amber-700 tabular-nums">{data?.slaAgingBreakdown?.atRisk ?? 0}</span> target overdue
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION B: OPERATIONAL VELOCITY & TIME HORIZON FILTERS                    */}
        {/* ========================================================================= */}
        <section aria-labelledby="operational-velocity-heading" className="p-6 rounded-[10px] bg-white border border-line shadow-card space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-line">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-teal-700" />
                <h2 id="operational-velocity-heading" className="text-sm font-bold text-ink uppercase tracking-wider">
                  {selectedHorizon === '7D' ? '7-Day' : '14-Day'} Complaint Velocity &amp; Adjudication Trend
                </h2>
                <span className="text-[10px] font-mono font-medium text-slate-600 bg-slate-100 border border-line px-1.5 py-0.5 rounded">
                  Point-in-Time Snapshot
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Multi-series telemetry tracking incoming complaint arrivals, straight-through auto-routings, and human reviewer decisions.
              </p>
            </div>

            {/* Segmented Time-Horizon Controls (Step 2) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">Horizon:</span>
              <div
                role="group"
                aria-label="Time Horizon Range"
                className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-2xs"
              >
                <button
                  type="button"
                  onClick={() => setSelectedHorizon('7D')}
                  aria-pressed={selectedHorizon === '7D'}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    selectedHorizon === '7D'
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  7 Days
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHorizon('14D')}
                  aria-pressed={selectedHorizon === '14D'}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    selectedHorizon === '14D'
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  14 Days
                </button>
                <button
                  type="button"
                  disabled
                  title="Extended historical horizons (30D) require archival storage warehouse. In-memory operational buffer retains 14 days."
                  aria-disabled="true"
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-400 opacity-60 cursor-not-allowed"
                >
                  30D <span className="text-[9px] font-mono">(Archived)</span>
                </button>
                <button
                  type="button"
                  disabled
                  title="Extended historical horizons (90D) require archival storage warehouse. In-memory operational buffer retains 14 days."
                  aria-disabled="true"
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-400 opacity-60 cursor-not-allowed"
                >
                  90D <span className="text-[9px] font-mono">(Archived)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Chart Header Meta Strip & Legend */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 text-xs font-medium text-slate-700">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-teal-600 inline-block" />
                <span>Total Received</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sky-500 inline-block" />
                <span>Auto-Routed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
                <span>Reviewer Adjudicated</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              Displaying {displayedDailyTrends.length} historical day observations
            </div>
          </div>

          {/* SVG Multi-Series Chart Container */}
          <div className="relative w-full overflow-hidden bg-white border border-line rounded-[10px] p-4 text-ink">
            {trendPoints ? (
              <div className="w-full">
                <svg
                  role="img"
                  aria-label={`${selectedHorizon} Intake and Adjudication Velocity Chart`}
                  viewBox={`0 0 ${trendPoints.width} ${trendPoints.height}`}
                  className="w-full h-48 sm:h-56 overflow-visible select-none"
                >
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0D9488" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#0D9488" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                    const y =
                      trendPoints.height -
                      trendPoints.paddingY -
                      pct * (trendPoints.height - trendPoints.paddingY * 2);
                    return (
                      <g key={i}>
                        <line
                          x1={20}
                          y1={y}
                          x2={trendPoints.width - 20}
                          y2={y}
                          stroke="#E3E7ED"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />
                        <text
                          x={24}
                          y={y - 4}
                          fill="#64748B"
                          fontSize="11"
                          fontFamily="monospace"
                          className="tabular-nums"
                        >
                          {Math.round(pct * trendPoints.maxVal)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Gradient Area Fill under Total Received */}
                  <path d={trendPoints.areaPath} fill="url(#areaGradient)" />

                  {/* Line 1: Total Received */}
                  <path
                    d={trendPoints.totalPath}
                    fill="none"
                    stroke="#0F766E"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Line 2: Auto-Routed */}
                  <path
                    d={trendPoints.autoPath}
                    fill="none"
                    stroke="#0284C7"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                  />

                  {/* Line 3: Reviewed */}
                  <path
                    d={trendPoints.reviewPath}
                    fill="none"
                    stroke="#6366F1"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />

                  {/* Data Point Circles and Hover Hitboxes */}
                  {trendPoints.coords.map((pt, idx) => {
                    const isHovered = hoveredTrendIdx === idx;
                    return (
                      <g
                        key={idx}
                        className="cursor-pointer"
                        tabIndex={0}
                        role="button"
                        aria-label={`Date ${pt.date}: ${pt.intakeCount} received, ${pt.autoRoutedCount} auto-routed, ${pt.humanReviewedCount} reviewed`}
                        onMouseEnter={() => setHoveredTrendIdx(idx)}
                        onMouseLeave={() => setHoveredTrendIdx(null)}
                        onFocus={() => setHoveredTrendIdx(idx)}
                        onBlur={() => setHoveredTrendIdx(null)}
                      >
                        <circle
                          cx={pt.x}
                          cy={pt.yTotal}
                          r={isHovered ? 6 : 3.5}
                          fill={isHovered ? '#0F766E' : '#0D9488'}
                          stroke="#FFFFFF"
                          strokeWidth="2"
                        />
                        {/* Hover vertical guide */}
                        {isHovered && (
                          <line
                            x1={pt.x}
                            y1={trendPoints.paddingY}
                            x2={pt.x}
                            y2={trendPoints.height - trendPoints.paddingY}
                            stroke="#0D9488"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                          />
                        )}
                        {/* Date label at bottom */}
                        <text
                          x={pt.x}
                          y={trendPoints.height - 4}
                          textAnchor="middle"
                          fill="#64748B"
                          fontSize="11"
                          fontFamily="monospace"
                          className="tabular-nums"
                        >
                          {pt.date}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Hover Tooltip Box */}
                {hoveredTrendIdx !== null && trendPoints.coords[hoveredTrendIdx] && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white flex flex-wrap items-center justify-between gap-4 animate-in fade-in shadow-md">
                    <div>
                      <span className="text-slate-400 font-mono">Date: </span>
                      <span className="font-bold text-white">{trendPoints.coords[hoveredTrendIdx].date}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-teal-400 font-semibold">Intake Count: </span>
                        <span className="font-mono text-white tabular-nums">
                          {trendPoints.coords[hoveredTrendIdx].intakeCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-sky-400 font-semibold">Auto-Routed: </span>
                        <span className="font-mono text-white tabular-nums">
                          {trendPoints.coords[hoveredTrendIdx].autoRoutedCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-indigo-400 font-semibold">Human Reviewed: </span>
                        <span className="font-mono text-white tabular-nums">
                          {trendPoints.coords[hoveredTrendIdx].humanReviewedCount}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                No trend data available. Click &quot;Seed Realistic CFPB Demo&quot; below in System Utilities to populate historical telemetry.
              </div>
            )}
          </div>

          {/* Operational Velocity Summary Rail */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Period Total Inflow</span>
              <span className="text-base font-bold text-ink font-mono tabular-nums">
                {horizonSummary.totalInflow} cases
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Period Straight-Through</span>
              <span className="text-base font-bold text-sky-700 font-mono tabular-nums">
                {horizonSummary.totalAuto} cases
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Period Human Adjudicated</span>
              <span className="text-base font-bold text-indigo-700 font-mono tabular-nums">
                {horizonSummary.totalReviewed} cases
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Avg. Daily Volume</span>
              <span className="text-base font-bold text-teal-800 font-mono tabular-nums">
                {horizonSummary.avgDaily} / day
              </span>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION C: CATEGORY VOLUME MATRIX & CALIBRATION (2 COLS)                 */}
        {/* ========================================================================= */}
        <section aria-label="Category Distribution and Calibration" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: 8-Category Stacked Breakdown (2 cols) */}
          <div className="lg:col-span-2 p-6 rounded-[10px] bg-white border border-line shadow-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-line">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} className="text-teal-700" />
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                    Volume &amp; Priority Matrix (All 8 CFPB Categories)
                  </h3>
                  <span className="text-[10px] font-mono font-medium text-slate-600 bg-slate-100 border border-line px-1.5 py-0.5 rounded">
                    Point-in-Time Snapshot
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Breakdown by total volume and rule-based triage priority distribution.
                </p>
              </div>

              {/* Priority Legend */}
              <div className="flex items-center gap-3 text-xs font-medium text-slate-700">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-red-600 inline-block" /> Critical
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> High
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-teal-600 inline-block" /> Medium
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-slate-400 inline-block" /> Low
                </span>
              </div>
            </div>

            <div className="space-y-3.5 pt-2">
              {data?.categoryVolumeMatrix && data.categoryVolumeMatrix.length > 0 ? (
                data.categoryVolumeMatrix.map((cat) => {
                  const vol = Math.max(1, cat.total);
                  const critPct = (cat.critical / vol) * 100;
                  const highPct = (cat.high / vol) * 100;
                  const medPct = (cat.medium / vol) * 100;
                  const lowPct = (cat.low / vol) * 100;

                  return (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className="font-semibold text-ink truncate max-w-[280px] sm:max-w-md"
                          title={cat.category}
                        >
                          {cat.category}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono text-ink font-bold tabular-nums">
                            {cat.total}
                          </span>
                          <span className="text-xs text-slate-500">cases</span>
                        </div>
                      </div>

                      {/* Stacked bar */}
                      <div
                        className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex"
                        role="progressbar"
                        aria-label={`${cat.category}: ${cat.total} total cases (${cat.critical} critical, ${cat.high} high, ${cat.medium} medium, ${cat.low} low)`}
                        aria-valuenow={cat.total}
                      >
                        {critPct > 0 && (
                          <div
                            style={{ width: `${critPct}%` }}
                            className="bg-red-600 h-full transition-all"
                            title={`Critical: ${cat.critical}`}
                          />
                        )}
                        {highPct > 0 && (
                          <div
                            style={{ width: `${highPct}%` }}
                            className="bg-amber-500 h-full transition-all"
                            title={`High: ${cat.high}`}
                          />
                        )}
                        {medPct > 0 && (
                          <div
                            style={{ width: `${medPct}%` }}
                            className="bg-teal-600 h-full transition-all"
                            title={`Medium: ${cat.medium}`}
                          />
                        )}
                        {lowPct > 0 && (
                          <div
                            style={{ width: `${lowPct}%` }}
                            className="bg-slate-400 h-full transition-all"
                            title={`Low: ${cat.low}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No category records available. Seed demo data to preview the full 8-category distribution.
                </div>
              )}
            </div>
          </div>

          {/* Right: SLA Queue Health & Confidence Calibration (1 col) */}
          <div className="space-y-6">
            {/* SLA Health Card */}
            <div className="p-6 rounded-[10px] bg-white border border-line shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-teal-700" />
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                    SLA Queue Aging
                  </h3>
                  <span className="text-[10px] font-mono font-medium text-slate-600 bg-slate-100 border border-line px-1.5 py-0.5 rounded">
                    Point-in-Time Snapshot
                  </span>
                </div>
                <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Target: &le; 24h
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
                  <span className="text-xs font-semibold text-emerald-900 block">&le; 24 Hours</span>
                  <span className="text-xl font-bold text-emerald-900 mt-1 block font-mono tabular-nums">
                    {data?.slaAgingBreakdown.onTrack ?? 0}
                  </span>
                  <span className="text-xs text-emerald-800 font-medium">Within Target</span>
                </div>

                <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200">
                  <span className="text-xs font-semibold text-amber-900 block">&gt; 24h &ndash; &le; 72h</span>
                  <span className="text-xl font-bold text-amber-900 mt-1 block font-mono tabular-nums">
                    {data?.slaAgingBreakdown.atRisk ?? 0}
                  </span>
                  <span className="text-xs text-amber-800 font-medium">Target Overdue / At Risk</span>
                </div>

                <div className="p-3 rounded-lg bg-red-50/70 border border-red-200">
                  <span className="text-xs font-semibold text-red-900 block">&gt; 72 Hours</span>
                  <span className="text-xl font-bold text-red-900 mt-1 block font-mono tabular-nums">
                    {data?.slaAgingBreakdown.breached ?? 0}
                  </span>
                  <span className="text-xs text-red-800 font-medium">Escalation Breach</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 pt-1">
                Aging calculated dynamically against pending review cases ({data?.slaAgingBreakdown.totalPending ?? 0} pending). Cases exceeding 72 hours trigger escalation alerts.
              </p>
            </div>

            {/* Confidence & Decision Margin Calibration */}
            <div className="p-6 rounded-[10px] bg-white border border-line shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-teal-700" />
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                    Confidence Calibration Bands
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-medium text-slate-600 bg-slate-100 border border-line px-1.5 py-0.5 rounded">
                  Point-in-Time Snapshot
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Band 1: < 0.55 */}
                <div>
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span className="font-medium text-red-800">&lt; 0.55 (Flagged for Review)</span>
                    <span className="font-mono font-bold text-ink tabular-nums">
                      {data?.confidenceSentimentBuckets.confidenceUnder55 ?? 0}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          ((data?.confidenceSentimentBuckets.confidenceUnder55 ?? 0) /
                            Math.max(1, data?.totalComplaints ?? 1)) *
                            100
                        )}%`,
                      }}
                      className="h-full bg-red-600"
                    />
                  </div>
                </div>

                {/* Band 2: 0.55 - 0.75 */}
                <div>
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span className="font-medium text-amber-800">0.55 – 0.75 (Moderate)</span>
                    <span className="font-mono font-bold text-ink tabular-nums">
                      {data?.confidenceSentimentBuckets.confidence55To75 ?? 0}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          ((data?.confidenceSentimentBuckets.confidence55To75 ?? 0) /
                            Math.max(1, data?.totalComplaints ?? 1)) *
                            100
                        )}%`,
                      }}
                      className="h-full bg-amber-500"
                    />
                  </div>
                </div>

                {/* Band 3: 0.75 - 0.90 */}
                <div>
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span className="font-medium text-teal-800">0.75 – 0.90 (High Confidence)</span>
                    <span className="font-mono font-bold text-ink tabular-nums">
                      {data?.confidenceSentimentBuckets.confidence75To90 ?? 0}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          ((data?.confidenceSentimentBuckets.confidence75To90 ?? 0) /
                            Math.max(1, data?.totalComplaints ?? 1)) *
                            100
                        )}%`,
                      }}
                      className="h-full bg-teal-600"
                    />
                  </div>
                </div>

                {/* Band 4: > 0.90 */}
                <div>
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span className="font-medium text-emerald-800">&gt; 0.90 (Straight-Through Routing)</span>
                    <span className="font-mono font-bold text-ink tabular-nums">
                      {data?.confidenceSentimentBuckets.confidenceOver90 ?? 0}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          ((data?.confidenceSentimentBuckets.confidenceOver90 ?? 0) /
                            Math.max(1, data?.totalComplaints ?? 1)) *
                            100
                        )}%`,
                      }}
                      className="h-full bg-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* Margin Separation Insight */}
              <div className="pt-3 border-t border-line flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
                <span>
                  Narrow Margin (&lt; 0.15):{' '}
                  <strong className="text-amber-800">
                    {data?.confidenceSentimentBuckets.narrowMargin ?? 0}
                  </strong>
                </span>
                <span>
                  Decisive Margin (&ge; 0.15):{' '}
                  <strong className="text-emerald-800">
                    {data?.confidenceSentimentBuckets.clearMargin ?? 0}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION D: CAPACITY & FORECASTING (MONTE CARLO STRESS LAB)               */}
        {/* ========================================================================= */}
        <section aria-labelledby="capacity-forecasting-heading" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 id="capacity-forecasting-heading" className="text-sm font-bold text-ink uppercase tracking-wider font-mono">
                Capacity Stress Lab &amp; AI Threshold Forecasting
              </h2>
              <p className="text-xs text-slate-600">
                Stochastic operational queue projection modeling surge scenarios, staffing elasticity, and statutory review policy frontiers.
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Deterministic Mulberry32 PRNG
            </span>
          </div>

          <MonteCarloStressLab analyticsData={data} />
        </section>

        {/* ========================================================================= */}
        {/* SECTION E: SYSTEM & DEMONSTRATION UTILITIES (DEMOTED SEEDING)            */}
        {/* ========================================================================= */}
        <section
          aria-labelledby="system-utilities-heading"
          className="p-5 rounded-[10px] bg-slate-50 border border-slate-200 text-slate-700 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 id="system-utilities-heading" className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Database size={13} className="text-slate-500" />
                System Demonstration &amp; Testing Utilities
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Administrative tools for testing and audit demonstration. Actions performed here populate deterministic sample data and are excluded from operational decision telemetry.
              </p>
            </div>

            <Button
              ref={seedTriggerRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowSeedModal(true)}
              disabled={seeding || loading}
              className="text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-100 flex-shrink-0 cursor-pointer"
            >
              <Database size={13} />
              <span>Seed Realistic CFPB Demo</span>
            </Button>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CONFIRMATION MODAL: DEMO SEEDING UTILITY                                 */}
        {/* ========================================================================= */}
        {showSeedModal && (
          <div
            ref={seedDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="seed-modal-title"
            aria-describedby="seed-modal-desc"
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          >
            {/* Clickable backdrop overlay */}
            <div
              className="fixed inset-0 -z-10"
              onClick={() => {
                setShowSeedModal(false);
                seedTriggerRef.current?.focus();
              }}
              aria-hidden="true"
            />

            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-teal-800">
                  <Database size={18} />
                  <h3 id="seed-modal-title" className="text-sm font-bold text-slate-900">
                    Confirm Synthetic Demo Seeding
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSeedModal(false);
                    seedTriggerRef.current?.focus();
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                  aria-label="Close dialog"
                >
                  <X size={16} />
                </button>
              </div>

              <div id="seed-modal-desc" className="space-y-2 text-xs text-slate-600 leading-relaxed">
                <p>
                  This utility populates the database with <strong>32 authentic CFPB complaints</strong> spanning all 8 consumer financial product categories across a 14-day operational timestamp range.
                </p>
                <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 space-y-1">
                  <span className="font-semibold block flex items-center gap-1.5">
                    <Info size={13} className="text-teal-700" />
                    Idempotent Batch Operation
                  </span>
                  <p className="text-[11px] text-teal-800">
                    Complaints are seeded with deterministic UUIDs. If the demo batch already exists, existing records will not be duplicated.
                  </p>
                </div>
                <p className="text-[11px] text-slate-500">
                  Are you sure you want to proceed with database seeding?
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowSeedModal(false);
                    seedTriggerRef.current?.focus();
                  }}
                  disabled={seeding}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSeedDemoData}
                  isLoading={seeding}
                  disabled={seeding}
                  className="text-xs bg-teal-700 hover:bg-teal-800"
                >
                  Confirm &amp; Seed Demo Data
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ReviewerLayout>
  );
};
