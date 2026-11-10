import React, { useEffect, useState, useMemo } from 'react';
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
} from 'lucide-react';
import { ReviewerLayout } from '../../components/layout/ReviewerLayout';
import { getExecutiveAnalytics, seedDemoTelemetry } from '../../lib/api/endpoints';
import { ExecutiveAnalyticsResponse } from '../../types/grievance';

export const ExecutiveAnalyticsPage: React.FC = () => {
  const [data, setData] = useState<ExecutiveAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccessMessage, setSeedSuccessMessage] = useState<string | null>(null);
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);

  const fetchTelemetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getExecutiveAnalytics();
      setData(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve executive analytics';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  const handleSeedDemoData = async () => {
    if (seeding) return;
    setSeeding(true);
    setSeedSuccessMessage(null);
    try {
      const res = await seedDemoTelemetry();
      setSeedSuccessMessage(res.message || 'Seeded 32 authentic CFPB complaints across all 8 categories.');
      await fetchTelemetry();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to seed demo complaints';
      setError(message);
    } finally {
      setSeeding(false);
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

  // SVG Area Chart points generator
  const trendPoints = useMemo(() => {
    if (!data || !data.dailyIntakeTrend || data.dailyIntakeTrend.length === 0) return null;
    const trends = data.dailyIntakeTrend;
    const maxVal = Math.max(1, ...trends.map((t) => t.intakeCount));
    const width = 640;
    const height = 180;
    const paddingX = 30;
    const paddingY = 20;
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
  }, [data]);

  return (
    <ReviewerLayout
      title="Executive Operations & Analytics"
      subtitle="Operational telemetry, triage automation velocity, SLA health, and calibration distribution"
      onRefresh={fetchTelemetry}
      isRefreshing={loading}
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Banner: Disclaimer & Action Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                <Activity size={12} />
                Live Telemetry
              </span>
              <span className="text-xs text-slate-400">Database SQL Group-By Aggregations</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
              Grievance Intake &amp; AI Triage Intelligence Hub
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Info size={13} className="text-teal-400 flex-shrink-0" />
              <span>Uncalibrated model probability estimates; operational telemetry and decision support only.</span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleSeedDemoData}
              disabled={seeding || loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-md shadow-teal-950/40 disabled:opacity-50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-400"
              title="Populate 32 authentic CFPB complaints across all 8 product categories and 14 days"
            >
              {seeding ? (
                <>
                  <RotateCcw size={14} className="animate-spin" />
                  <span>Seeding CFPB Telemetry...</span>
                </>
              ) : (
                <>
                  <Database size={14} />
                  <span>Seed Realistic CFPB Demo</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={fetchTelemetry}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Seed Success Banner */}
        {seedSuccessMessage && (
          <div className="p-4 rounded-xl bg-teal-950/40 border border-teal-500/30 text-teal-200 flex items-center justify-between text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-teal-400" />
              <span>{seedSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSeedSuccessMessage(null)}
              className="text-teal-400 hover:text-teal-200 underline text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={fetchTelemetry}
              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded text-rose-900 font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* ─── ROW 1: 4 EXECUTIVE METRIC CARDS ───────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Volume */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Ingested</span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Layers size={18} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {data ? data.totalComplaints.toLocaleString() : '—'}
              </span>
              <span className="text-xs text-slate-500">cases</span>
            </div>
            <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
              <span className="font-semibold text-teal-600">{data?.pendingReview ?? 0}</span>
              <span>currently in triage queue</span>
            </p>
          </div>

          {/* Card 2: Auto-Routing Automation Rate */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Automation Rate</span>
              <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                <Zap size={18} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {autoRoutePct}%
              </span>
              <span className="text-xs text-emerald-600 font-semibold flex items-center">
                <ArrowUpRight size={14} />
                Straight-Through
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {data?.autoRouted ?? 0} cases routed with zero human touch
            </p>
          </div>

          {/* Card 3: Adjudicated Count */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Adjudicated Volume</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {data?.humanReviewed ?? 0}
              </span>
              <span className="text-xs text-slate-500 font-medium">cases reviewed</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              manual reviewer decisions recorded
            </p>
          </div>

          {/* Card 4: SLA Compliance Rate */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SLA Compliance</span>
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <Clock size={18} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {slaPct}%
              </span>
              <span className="text-xs text-slate-500">on-track</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              cases resolved within 24-hour target
            </p>
          </div>
        </div>

        {/* ─── ROW 2: MULTI-SERIES INTAKE & TRIAGE TREND (SVG AREA CHART) ─── */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  14-Day Complaint Velocity &amp; Adjudication Trend
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparison of raw complaint volume received, straight-through auto-routings, and human reviewer decisions.
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-teal-500 inline-block" />
                <span>Total Received</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sky-400 inline-block" />
                <span>Auto-Routed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
                <span>Reviewer Adjudicated</span>
              </div>
            </div>
          </div>

          {/* SVG Multi-Series Chart Container */}
          <div className="relative w-full overflow-hidden bg-slate-950 rounded-xl p-4 text-white">
            {trendPoints ? (
              <div className="w-full">
                <svg
                  viewBox={`0 0 ${trendPoints.width} ${trendPoints.height}`}
                  className="w-full h-48 sm:h-56 overflow-visible"
                >
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="lineTotalGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#2dd4bf" />
                      <stop offset="100%" stopColor="#0d9488" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                    const y = trendPoints.height - trendPoints.paddingY - pct * (trendPoints.height - trendPoints.paddingY * 2);
                    return (
                      <g key={i}>
                        <line
                          x1={20}
                          y1={y}
                          x2={trendPoints.width - 20}
                          y2={y}
                          stroke="#334155"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />
                        <text x={24} y={y - 4} fill="#64748b" fontSize="9" fontFamily="monospace">
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
                    stroke="#14b8a6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Line 2: Auto-Routed */}
                  <path
                    d={trendPoints.autoPath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                  />

                  {/* Line 3: Reviewed */}
                  <path
                    d={trendPoints.reviewPath}
                    fill="none"
                    stroke="#818cf8"
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
                        onMouseEnter={() => setHoveredTrendIdx(idx)}
                        onMouseLeave={() => setHoveredTrendIdx(null)}
                      >
                        <circle
                          cx={pt.x}
                          cy={pt.yTotal}
                          r={isHovered ? 6 : 3.5}
                          fill={isHovered ? '#ffffff' : '#14b8a6'}
                          stroke="#0f172a"
                          strokeWidth="2"
                        />
                        {/* Hover vertical guide */}
                        {isHovered && (
                          <line
                            x1={pt.x}
                            y1={trendPoints.paddingY}
                            x2={pt.x}
                            y2={trendPoints.height - trendPoints.paddingY}
                            stroke="#5eead4"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                          />
                        )}
                        {/* Date label at bottom */}
                        <text
                          x={pt.x}
                          y={trendPoints.height - 4}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {pt.date}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Hover Tooltip Box */}
                {hoveredTrendIdx !== null && trendPoints.coords[hoveredTrendIdx] && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-900 border border-slate-700 text-xs flex flex-wrap items-center justify-between gap-4 animate-in fade-in">
                    <div>
                      <span className="text-slate-400 font-mono">Date: </span>
                      <span className="font-bold text-white">{trendPoints.coords[hoveredTrendIdx].date}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-teal-400 font-semibold">Intake Count: </span>
                        <span className="font-mono text-white">{trendPoints.coords[hoveredTrendIdx].intakeCount}</span>
                      </div>
                      <div>
                        <span className="text-sky-400 font-semibold">Auto-Routed: </span>
                        <span className="font-mono text-white">{trendPoints.coords[hoveredTrendIdx].autoRoutedCount}</span>
                      </div>
                      <div>
                        <span className="text-indigo-400 font-semibold">Human Reviewed: </span>
                        <span className="font-mono text-white">{trendPoints.coords[hoveredTrendIdx].humanReviewedCount}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                No trend data available. Click "Seed Realistic CFPB Demo" above to populate historical telemetry.
              </div>
            )}
          </div>
        </div>

        {/* ─── ROW 3: CATEGORY VOLUME & SEVERITY STACKED MATRIX ──────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: 8-Category Stacked Breakdown (2 cols) */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} className="text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Volume &amp; Priority Matrix (All 8 CFPB Categories)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Breakdown by volume and rule-based triage priority distribution.
                </p>
              </div>

              {/* Priority Legend */}
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" /> Critical</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> High</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-teal-500 inline-block" /> Medium</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-400 inline-block" /> Low</span>
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
                        <span className="font-semibold text-slate-800 truncate max-w-[280px] sm:max-w-md" title={cat.category}>
                          {cat.category}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono text-slate-900 font-bold">{cat.total}</span>
                          <span className="text-[10px] text-slate-400">cases</span>
                        </div>
                      </div>

                      {/* Stacked bar */}
                      <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                        {critPct > 0 && (
                          <div
                            style={{ width: `${critPct}%` }}
                            className="bg-rose-500 h-full transition-all"
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
                            className="bg-teal-500 h-full transition-all"
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
                <div className="p-8 text-center text-slate-400 text-xs">
                  No category records available. Seed demo data to preview the full 8-category distribution.
                </div>
              )}
            </div>
          </div>

          {/* Right: SLA Queue Health & Confidence Calibration (1 col) */}
          <div className="space-y-6">
            {/* SLA Health Card */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    SLA Queue Aging
                  </h3>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Target: &lt; 24h
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
                  <span className="text-[11px] font-medium text-emerald-800 block">&lt; 24 Hours</span>
                  <span className="text-xl font-bold text-emerald-900 mt-1 block font-mono">
                    {data?.slaAgingBreakdown.onTrack ?? 0}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium">On Track</span>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-100">
                  <span className="text-[11px] font-medium text-amber-800 block">24 – 72 Hours</span>
                  <span className="text-xl font-bold text-amber-900 mt-1 block font-mono">
                    {data?.slaAgingBreakdown.atRisk ?? 0}
                  </span>
                  <span className="text-[10px] text-amber-700 font-medium">At Risk</span>
                </div>

                <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-100">
                  <span className="text-[11px] font-medium text-rose-800 block">&gt; 72 Hours</span>
                  <span className="text-xl font-bold text-rose-900 mt-1 block font-mono">
                    {data?.slaAgingBreakdown.breached ?? 0}
                  </span>
                  <span className="text-[10px] text-rose-700 font-medium">Breached</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 pt-1">
                Aging calculated dynamically against pending review cases ({data?.slaAgingBreakdown.totalPending ?? 0} pending). Cases exceeding 72 hours trigger escalation alerts.
              </p>
            </div>

            {/* Confidence & Decision Margin Calibration */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Confidence Calibration Bands
                </h3>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Band 1: < 0.55 */}
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span className="font-medium text-rose-700">&lt; 0.55 (Flagged for Review)</span>
                    <span className="font-mono font-bold text-slate-900">{data?.confidenceSentimentBuckets.confidenceUnder55 ?? 0}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.min(100, ((data?.confidenceSentimentBuckets.confidenceUnder55 ?? 0) / Math.max(1, data?.totalComplaints ?? 1)) * 100)}%`,
                      }}
                      className="h-full bg-rose-500"
                    />
                  </div>
                </div>

                {/* Band 2: 0.55 - 0.75 */}
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span className="font-medium text-amber-700">0.55 – 0.75 (Moderate)</span>
                    <span className="font-mono font-bold text-slate-900">{data?.confidenceSentimentBuckets.confidence55To75 ?? 0}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.min(100, ((data?.confidenceSentimentBuckets.confidence55To75 ?? 0) / Math.max(1, data?.totalComplaints ?? 1)) * 100)}%`,
                      }}
                      className="h-full bg-amber-500"
                    />
                  </div>
                </div>

                {/* Band 3: 0.75 - 0.90 */}
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span className="font-medium text-teal-700">0.75 – 0.90 (High Confidence)</span>
                    <span className="font-mono font-bold text-slate-900">{data?.confidenceSentimentBuckets.confidence75To90 ?? 0}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.min(100, ((data?.confidenceSentimentBuckets.confidence75To90 ?? 0) / Math.max(1, data?.totalComplaints ?? 1)) * 100)}%`,
                      }}
                      className="h-full bg-teal-500"
                    />
                  </div>
                </div>

                {/* Band 4: > 0.90 */}
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span className="font-medium text-emerald-700">&gt; 0.90 (Straight-Through Routing)</span>
                    <span className="font-mono font-bold text-slate-900">{data?.confidenceSentimentBuckets.confidenceOver90 ?? 0}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${Math.min(100, ((data?.confidenceSentimentBuckets.confidenceOver90 ?? 0) / Math.max(1, data?.totalComplaints ?? 1)) * 100)}%`,
                      }}
                      className="h-full bg-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* Margin Separation Insight */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Narrow Margin (&lt; 0.15): <strong className="text-amber-700">{data?.confidenceSentimentBuckets.narrowMargin ?? 0}</strong></span>
                <span>Decisive Margin (&ge; 0.15): <strong className="text-emerald-700">{data?.confidenceSentimentBuckets.clearMargin ?? 0}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ReviewerLayout>
  );
};
