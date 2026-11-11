import React, { useState, useMemo, useCallback } from 'react';
import {
  Activity,
  Sliders,
  ShieldAlert,
  Clock,
  Zap,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Info,
  Shield,
  Layers,
} from 'lucide-react';
import { ExecutiveAnalyticsResponse } from '../../../types/grievance';
import {
  MonteCarloConfig,
  MonteCarloResult,
  PolicyFrontierPoint,
  runMonteCarloSimulation,
  computePolicyFrontier,
} from '../utils/monteCarloEngine';

interface MonteCarloStressLabProps {
  analyticsData?: ExecutiveAnalyticsResponse | null;
}

type ScenarioPresetKey = 'BASELINE' | 'SURGE' | 'CONSERVATIVE' | 'UNDERSTAFFED';

interface ScenarioPreset {
  key: ScenarioPresetKey;
  label: string;
  description: string;
  confidenceGate: number;
  marginGate: number;
  surgeMultiplier: number;
  reviewerCount: number;
}

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    key: 'BASELINE',
    label: 'Production Baseline',
    description: '0.55 Conf / 0.15 Margin / 1.0x Intake / 6 Reviewers',
    confidenceGate: 0.55,
    marginGate: 0.15,
    surgeMultiplier: 1.0,
    reviewerCount: 6,
  },
  {
    key: 'SURGE',
    label: '2.2x Regulatory Foreclosure Surge',
    description: 'Severe intake volume shock / 6 Reviewers',
    confidenceGate: 0.55,
    marginGate: 0.15,
    surgeMultiplier: 2.2,
    reviewerCount: 6,
  },
  {
    key: 'CONSERVATIVE',
    label: 'Conservative Audit Policy',
    description: '0.78 Conf / 0.25 Margin / Stringent human verification',
    confidenceGate: 0.78,
    marginGate: 0.25,
    surgeMultiplier: 1.0,
    reviewerCount: 6,
  },
  {
    key: 'UNDERSTAFFED',
    label: 'Understaffed Shift Stress',
    description: '3 Reviewers / 1.5x Intake / Shift capacity constraint',
    confidenceGate: 0.55,
    marginGate: 0.15,
    surgeMultiplier: 1.5,
    reviewerCount: 3,
  },
];

export const MonteCarloStressLab: React.FC<MonteCarloStressLabProps> = ({ analyticsData }) => {
  // Config state
  const [confidenceGate, setConfidenceGate] = useState<number>(0.55);
  const [marginGate, setMarginGate] = useState<number>(0.15);
  const [surgeMultiplier, setSurgeMultiplier] = useState<number>(1.0);
  const [reviewerCount, setReviewerCount] = useState<number>(6);
  const [selectedSeed, setSelectedSeed] = useState<number>(42);
  const [activePreset, setActivePreset] = useState<ScenarioPresetKey | 'CUSTOM'>('BASELINE');

  // Chart hover states
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [hoveredFrontierGate, setHoveredFrontierGate] = useState<number | null>(null);

  // Derive empirical telemetry anchors
  const telemetryAnchors = useMemo(() => {
    if (!analyticsData) {
      return {
        initialBacklog: 8,
        baseDailyArrivals: 25,
        confidenceBuckets: { under55: 20, b55To75: 30, b75To90: 30, over90: 20 },
        marginBuckets: { narrow: 15, clear: 85 },
        criticalShare: 0.12,
      };
    }

    const initialBacklog = analyticsData.pendingReview ?? 8;

    // Daily arrivals from dailyIntakeTrend
    let baseDailyArrivals = 25;
    if (analyticsData.dailyIntakeTrend && analyticsData.dailyIntakeTrend.length > 0) {
      const sum = analyticsData.dailyIntakeTrend.reduce((acc, t) => acc + t.intakeCount, 0);
      const avg = sum / analyticsData.dailyIntakeTrend.length;
      if (avg > 0) baseDailyArrivals = Math.round(avg);
    }

    const confBuckets = analyticsData.confidenceSentimentBuckets
      ? {
          under55: analyticsData.confidenceSentimentBuckets.confidenceUnder55,
          b55To75: analyticsData.confidenceSentimentBuckets.confidence55To75,
          b75To90: analyticsData.confidenceSentimentBuckets.confidence75To90,
          over90: analyticsData.confidenceSentimentBuckets.confidenceOver90,
        }
      : { under55: 20, b55To75: 30, b75To90: 30, over90: 20 };

    const marginBuckets = analyticsData.confidenceSentimentBuckets
      ? {
          narrow: analyticsData.confidenceSentimentBuckets.narrowMargin,
          clear: analyticsData.confidenceSentimentBuckets.clearMargin,
        }
      : { narrow: 15, clear: 85 };

    const total = analyticsData.totalComplaints || 1;
    const criticalCount = analyticsData.priorityDistribution?.CRITICAL ?? 0;
    const criticalShare = Math.max(0.12, criticalCount / total);

    return {
      initialBacklog,
      baseDailyArrivals,
      confidenceBuckets: confBuckets,
      marginBuckets,
      criticalShare,
    };
  }, [analyticsData]);

  // Construct active simulation config
  const simConfig: MonteCarloConfig = useMemo(() => {
    return {
      iterations: 1000,
      horizonDays: 14,
      seed: selectedSeed,
      confidenceGate,
      marginGate,
      surgeMultiplier,
      reviewerCount,
      reviewsPerReviewerPerDay: 3,
      initialBacklog: telemetryAnchors.initialBacklog,
      baseDailyArrivals: telemetryAnchors.baseDailyArrivals,
      confidenceBuckets: telemetryAnchors.confidenceBuckets,
      marginBuckets: telemetryAnchors.marginBuckets,
      criticalShare: telemetryAnchors.criticalShare,
    };
  }, [
    selectedSeed,
    confidenceGate,
    marginGate,
    surgeMultiplier,
    reviewerCount,
    telemetryAnchors,
  ]);

  // Run simulation & frontier calculation
  const simResult: MonteCarloResult = useMemo(() => {
    return runMonteCarloSimulation(simConfig);
  }, [simConfig]);

  const policyFrontier: PolicyFrontierPoint[] = useMemo(() => {
    return computePolicyFrontier(simConfig);
  }, [simConfig]);

  // Handle Preset Selection
  const applyPreset = useCallback((preset: ScenarioPreset) => {
    setConfidenceGate(preset.confidenceGate);
    setMarginGate(preset.marginGate);
    setSurgeMultiplier(preset.surgeMultiplier);
    setReviewerCount(preset.reviewerCount);
    setActivePreset(preset.key);
  }, []);

  const handleResetToTelemetry = useCallback(() => {
    setConfidenceGate(0.55);
    setMarginGate(0.15);
    setSurgeMultiplier(1.0);
    setReviewerCount(6);
    setSelectedSeed(42);
    setActivePreset('BASELINE');
  }, []);

  // Update slider values and mark custom preset
  const handleConfidenceChange = (val: number) => {
    setConfidenceGate(val);
    setActivePreset('CUSTOM');
  };
  const handleMarginChange = (val: number) => {
    setMarginGate(val);
    setActivePreset('CUSTOM');
  };
  const handleSurgeChange = (val: number) => {
    setSurgeMultiplier(val);
    setActivePreset('CUSTOM');
  };
  const handleReviewerChange = (val: number) => {
    setReviewerCount(val);
    setActivePreset('CUSTOM');
  };

  // Helper values from summary
  const summary = simResult.summary;
  const isBreachElevated = summary.slaBreachProbabilityPercent > 10;
  const isBreachModerate =
    summary.slaBreachProbabilityPercent > 1 && summary.slaBreachProbabilityPercent <= 10;

  // ─────────────────────────────────────────────────────────────────────────
  // SVG Geometry Constants & Path Generators
  // ─────────────────────────────────────────────────────────────────────────

  // Chart A: Fan Chart Canvas (W: 680, H: 260)
  const fanW = 680;
  const fanH = 260;
  const fanPadX = 50;
  const fanPadY = 25;
  const fanUsableW = fanW - fanPadX * 2;
  const fanUsableH = fanH - fanPadY * 2;

  // Calculate maximum backlog for Y-axis scaling
  const maxFanBacklog = useMemo(() => {
    let m = Math.max(summary.breachCapacityThreshold * 1.25, 60);
    for (const dp of simResult.dailyPercentiles) {
      if (dp.p95 > m) m = dp.p95 * 1.15;
    }
    return Math.max(m, 40);
  }, [simResult, summary.breachCapacityThreshold]);

  const mapFanX = useCallback(
    (day: number) => fanPadX + (day / 14) * fanUsableW,
    [fanPadX, fanUsableW]
  );
  const mapFanY = useCallback(
    (b: number) => fanH - fanPadY - (Math.min(maxFanBacklog, Math.max(0, b)) / maxFanBacklog) * fanUsableH,
    [fanH, fanPadY, maxFanBacklog, fanUsableH]
  );

  // Shaded polygon paths for P10-P90 and P25-P75
  const fanAreaP10P90 = useMemo(() => {
    const pts = simResult.dailyPercentiles;
    const upper = pts.map((p) => `${mapFanX(p.day)},${mapFanY(p.p90)}`).join(' L ');
    const lower = [...pts]
      .reverse()
      .map((p) => `${mapFanX(p.day)},${mapFanY(p.p10)}`)
      .join(' L ');
    return `M ${upper} L ${lower} Z`;
  }, [simResult.dailyPercentiles, mapFanX, mapFanY]);

  const fanAreaP25P75 = useMemo(() => {
    const pts = simResult.dailyPercentiles;
    const upper = pts.map((p) => `${mapFanX(p.day)},${mapFanY(p.p75)}`).join(' L ');
    const lower = [...pts]
      .reverse()
      .map((p) => `${mapFanX(p.day)},${mapFanY(p.p25)}`)
      .join(' L ');
    return `M ${upper} L ${lower} Z`;
  }, [simResult.dailyPercentiles, mapFanX, mapFanY]);

  const fanLineP50 = useMemo(() => {
    return simResult.dailyPercentiles
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${mapFanX(p.day)},${mapFanY(p.p50)}`)
      .join(' ');
  }, [simResult.dailyPercentiles, mapFanX, mapFanY]);

  const fanLineP95 = useMemo(() => {
    return simResult.dailyPercentiles
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${mapFanX(p.day)},${mapFanY(p.p95)}`)
      .join(' ');
  }, [simResult.dailyPercentiles, mapFanX, mapFanY]);

  // Chart B: Histogram Geometry (W: 320, H: 220)
  const histW = 320;
  const histH = 220;
  const histPadX = 35;
  const histPadY = 30;
  const histUsableW = histW - histPadX * 2;
  const histUsableH = histH - histPadY * 2;

  const maxHistPct = useMemo(() => {
    const maxVal = Math.max(...simResult.histogramBins.map((b) => b.percentage));
    return Math.max(maxVal * 1.15, 10);
  }, [simResult.histogramBins]);

  // Chart C: Policy Frontier Geometry (W: 320, H: 220)
  const frontW = 320;
  const frontH = 220;
  const frontPadX = 40;
  const frontPadY = 30;
  const frontUsableW = frontW - frontPadX * 2;
  const frontUsableH = frontH - frontPadY * 2;

  const mapFrontX = (conf: number) => frontPadX + ((conf - 0.35) / (0.9 - 0.35)) * frontUsableW;
  const mapFrontYLeft = (pct: number) => frontH - frontPadY - (pct / 100) * frontUsableH;
  const mapFrontYRight = (pct: number) => frontH - frontPadY - (pct / 100) * frontUsableH;

  const autoRouteCurvePath = useMemo(() => {
    return policyFrontier
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${mapFrontX(pt.confidenceGate)},${mapFrontYLeft(pt.autoRoutePercent)}`)
      .join(' ');
  }, [policyFrontier]);

  const breachCurvePath = useMemo(() => {
    return policyFrontier
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${mapFrontX(pt.confidenceGate)},${mapFrontYRight(pt.slaBreachProbabilityPercent)}`)
      .join(' ');
  }, [policyFrontier]);

  return (
    <section
      data-testid="monte-carlo-stress-lab"
      aria-label="Monte Carlo Operational Queue & AI Threshold Stress Lab"
      className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-8"
    >
      {/* ─── HEADER & TRUTHFUL DISCLOSURE ───────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-100">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs font-mono">
              <Activity size={13} className="text-teal-600 animate-pulse" />
              STOCHASTIC MONTE CARLO SIMULATION • SEEDED PRNG (1,000 RUNS)
            </span>
            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Discrete Integer Queue Physics
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 font-sans">
            Monte Carlo Operational Queue &amp; AI Policy Stress Lab
          </h2>
          <p className="text-xs text-slate-500 max-w-3xl leading-relaxed flex items-start gap-1.5">
            <Info size={14} className="text-teal-600 shrink-0 mt-0.5" />
            <span>
              Projections are stochastic capacity simulations anchored to live queue telemetry, not persisted database
              records. Simulates 1,000 discrete integer Poisson trajectories [B(t) = max(0, B(t-1) + H(t) - C(t))]
              over 14 days with 8-class simplex-bounded AI routing.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleResetToTelemetry}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors shadow-2xs cursor-pointer"
            title="Reset sliders to baseline telemetry values"
          >
            <RotateCcw size={13} />
            <span>Reset to Live Telemetry</span>
          </button>
        </div>
      </div>

      {/* ─── SCENARIO PRESET CHIPS ───────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Sparkles size={14} className="text-teal-600" />
          <span>Executive Stress Scenarios &amp; Shocks:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {SCENARIO_PRESETS.map((preset) => {
            const isSelected = activePreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-teal-50/80 border-teal-500 ring-2 ring-teal-500/20 shadow-xs'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isSelected ? 'text-teal-950' : 'text-slate-900'}`}>
                    {preset.label}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0"></span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 5 INTERACTIVE SLIDERS ──────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            <Sliders size={14} className="text-teal-600" />
            <span>Operational &amp; Policy Control Sliders</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Engine Runtime: {summary.executionTimeMs}ms
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          {/* Slider 1: Confidence Gate */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex justify-between items-center">
              <label htmlFor="mc-conf-gate" className="font-semibold text-slate-700">
                Confidence Gate (τ<sub>conf</sub>)
              </label>
              <span className="font-mono font-bold text-teal-700 tabular-nums">
                {confidenceGate.toFixed(2)}
              </span>
            </div>
            <input
              id="mc-conf-gate"
              type="range"
              min="0.35"
              max="0.90"
              step="0.01"
              value={confidenceGate}
              onChange={(e) => handleConfidenceChange(parseFloat(e.target.value))}
              className="w-full accent-teal-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0.35 Loose</span>
              <span>0.90 Tight</span>
            </div>
          </div>

          {/* Slider 2: Margin Gate */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex justify-between items-center">
              <label htmlFor="mc-margin-gate" className="font-semibold text-slate-700">
                Margin Gate (τ<sub>margin</sub>)
              </label>
              <span className="font-mono font-bold text-teal-700 tabular-nums">
                {marginGate.toFixed(2)}
              </span>
            </div>
            <input
              id="mc-margin-gate"
              type="range"
              min="0.05"
              max="0.35"
              step="0.01"
              value={marginGate}
              onChange={(e) => handleMarginChange(parseFloat(e.target.value))}
              className="w-full accent-teal-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0.05 Narrow</span>
              <span>0.35 Wide</span>
            </div>
          </div>

          {/* Slider 3: Surge Multiplier */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex justify-between items-center">
              <label htmlFor="mc-surge-mult" className="font-semibold text-slate-700">
                Intake Volume Surge
              </label>
              <span className="font-mono font-bold text-teal-700 tabular-nums">
                {surgeMultiplier.toFixed(1)}x
              </span>
            </div>
            <input
              id="mc-surge-mult"
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={surgeMultiplier}
              onChange={(e) => handleSurgeChange(parseFloat(e.target.value))}
              className="w-full accent-teal-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0.5x Low</span>
              <span>3.0x Surge</span>
            </div>
          </div>

          {/* Slider 4: Active Reviewer Staffing */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex justify-between items-center">
              <label htmlFor="mc-reviewer-count" className="font-semibold text-slate-700">
                Active Staffing
              </label>
              <span data-testid="reviewer-count-display" className="font-mono font-bold text-teal-700 tabular-nums">
                {reviewerCount} Reviewers
              </span>
            </div>
            <input
              id="mc-reviewer-count"
              type="range"
              min="2"
              max="20"
              step="1"
              value={reviewerCount}
              onChange={(e) => handleReviewerChange(parseInt(e.target.value, 10))}
              className="w-full accent-teal-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>2 Minimal</span>
              <span>20 Scaled</span>
            </div>
          </div>

          {/* Selector 5: PRNG Seed */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex justify-between items-center">
              <label htmlFor="mc-seed-select" className="font-semibold text-slate-700">
                Seeded PRNG
              </label>
              <span className="font-mono font-bold text-teal-700">#{selectedSeed}</span>
            </div>
            <select
              id="mc-seed-select"
              value={selectedSeed}
              onChange={(e) => setSelectedSeed(parseInt(e.target.value, 10))}
              className="w-full text-xs font-mono font-semibold rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="42">Seed #42 (Official Audit)</option>
              <option value="108">Seed #108 (Secondary Replay)</option>
              <option value="2026">Seed #2026 (Forward Stress)</option>
            </select>
            <div className="text-[10px] text-slate-400 font-mono">
              Deterministic Mulberry32
            </div>
          </div>
        </div>
      </div>

      {/* ─── FOUR EXECUTIVE RISK KPI CARDS ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Routing Split */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Simulated Routing Split
            </span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <Zap size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-mono tabular-nums">
              {(summary.autoRouteRate * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-teal-700 font-semibold font-mono">Auto-Routed</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
            <div
              className="bg-teal-500 h-full transition-all duration-300"
              style={{ width: `${Math.round(summary.autoRouteRate * 100)}%` }}
            />
            <div
              className="bg-amber-500 h-full transition-all duration-300"
              style={{ width: `${Math.round(summary.humanReviewRate * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 pt-1">
            <span>Human Review Queue:</span>
            <strong className="font-mono text-slate-800">
              {(summary.humanReviewRate * 100).toFixed(1)}%
            </strong>
          </div>
        </div>

        {/* Card 2: Day-14 Median Backlog (P50) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Day-14 Median (P50)
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
              <Layers size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-mono tabular-nums">
              {summary.medianDay14Backlog}
            </span>
            <span className="text-xs text-slate-500">cases</span>
          </div>
          <div className="flex items-center gap-2 pt-1 text-[11px]">
            <span className="text-slate-500">FIFO Wait:</span>
            <strong className="font-mono text-slate-800 tabular-nums">
              {((summary.medianDay14Backlog / summary.dailyClearanceCapacity) * 24).toFixed(1)}h
            </strong>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                summary.medianDay14Backlog <= summary.dailyClearanceCapacity
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {summary.medianDay14Backlog <= summary.dailyClearanceCapacity ? 'On Track' : 'At Risk'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Capacity: {summary.dailyClearanceCapacity} reviews / day
          </div>
        </div>

        {/* Card 3: 95% Tail-Risk Backlog (VaR 95 & CVaR 95) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tail-Risk (VaR 95 / CVaR 95)
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-700">
              <ShieldAlert size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-700 tracking-tight font-mono tabular-nums">
              {summary.var95Backlog}
            </span>
            <span className="text-xs font-mono text-slate-500">VaR<sub>95</sub> cases</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 font-mono">
            <span>CVaR<sub>95</sub> (Tail Mean):</span>
            <strong className="text-rose-900 tabular-nums">{summary.cvar95Backlog} cases</strong>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Peak Wait: <strong className="text-slate-800">{summary.expectedPeakWaitHours}h</strong>
          </div>
        </div>

        {/* Card 4: 72h SLA Breach Probability */}
        <div
          className={`p-5 rounded-2xl border shadow-xs space-y-2 ${
            isBreachElevated
              ? 'bg-rose-50/70 border-rose-300'
              : isBreachModerate
                ? 'bg-amber-50/70 border-amber-300'
                : 'bg-white border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              72h SLA Breach Risk
            </span>
            <div
              className={`p-2 rounded-xl ${
                isBreachElevated
                  ? 'bg-rose-100 text-rose-700'
                  : isBreachModerate
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold tracking-tight font-mono tabular-nums ${
                isBreachElevated
                  ? 'text-rose-700'
                  : isBreachModerate
                    ? 'text-amber-800'
                    : 'text-emerald-700'
              }`}
            >
              {summary.slaBreachProbabilityPercent.toFixed(1)}%
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                isBreachElevated
                  ? 'bg-rose-200/80 text-rose-900'
                  : isBreachModerate
                    ? 'bg-amber-200/80 text-amber-900'
                    : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isBreachElevated ? 'Elevated' : isBreachModerate ? 'Moderate' : 'Low Risk'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="text-slate-500">24h At-Risk Rate:</span>
            <span className="font-mono font-bold text-amber-800 tabular-nums">
              {summary.atRiskProbabilityPercent.toFixed(1)}%
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            Limit: {summary.breachCapacityThreshold} cases (3 &times; daily capacity)
          </div>
        </div>
      </div>

      {/* ─── THREE SYNCHRONIZED SVG VISUALIZATIONS ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CHART A: 14-Day Stochastic Backlog Plume (8 Cols) */}
        <div className="lg:col-span-8 bg-[#142B3A] rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col justify-between text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/80">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-teal-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  14-Day Stochastic Backlog &amp; SLA Capacity Fan Chart
                </h3>
              </div>
              <p className="text-[11px] text-slate-300">
                1,000 trajectories &middot; P<sub>10</sub>&ndash;P<sub>90</sub> and P<sub>25</sub>&ndash;P<sub>75</sub> shaded percentile plume &middot; 10 individual runs
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-teal-400 inline-block"></span>
                <span>P50 Median</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-amber-400 inline-block"></span>
                <span>24h Capacity</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-rose-400 inline-block"></span>
                <span>72h Breach</span>
              </span>
            </div>
          </div>

          {/* SVG Canvas */}
          <div className="py-2 overflow-x-auto">
            <svg
              data-testid="mc-fan-chart-svg"
              viewBox={`0 0 ${fanW} ${fanH}`}
              className="w-full h-auto min-w-[540px] select-none"
              onMouseLeave={() => setHoveredDay(null)}
            >
              <defs>
                <linearGradient id="fanPlumeOuter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.06" />
                </linearGradient>
                <linearGradient id="fanPlumeInner" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.18" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                const y = fanPadY + ratio * fanUsableH;
                const val = Math.round(maxFanBacklog * (1.0 - ratio));
                return (
                  <g key={`grid-${ratio}`}>
                    <line
                      x1={fanPadX}
                      y1={y}
                      x2={fanW - fanPadX}
                      y2={y}
                      stroke="#1E3A4C"
                      strokeWidth="1"
                      strokeDasharray="2 4"
                    />
                    <text
                      x={fanPadX - 8}
                      y={y + 3}
                      fill="#94A3B8"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Day X-Axis Marks */}
              {[0, 2, 4, 6, 8, 10, 12, 14].map((day) => {
                const x = mapFanX(day);
                return (
                  <g key={`x-mark-${day}`}>
                    <line x1={x} y1={fanH - fanPadY} x2={x} y2={fanH - fanPadY + 5} stroke="#475569" />
                    <text
                      x={x}
                      y={fanH - fanPadY + 16}
                      fill="#94A3B8"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      D{day}
                    </text>
                  </g>
                );
              })}

              {/* Threshold Line 1: 24h Daily Clearance Capacity (mu) */}
              {summary.dailyClearanceCapacity <= maxFanBacklog && (
                <g>
                  <line
                    x1={fanPadX}
                    y1={mapFanY(summary.dailyClearanceCapacity)}
                    x2={fanW - fanPadX}
                    y2={mapFanY(summary.dailyClearanceCapacity)}
                    stroke="#F59E0B"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={fanW - fanPadX - 5}
                    y={mapFanY(summary.dailyClearanceCapacity) - 4}
                    fill="#FBBF24"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    24h Capacity (μ = {summary.dailyClearanceCapacity})
                  </text>
                </g>
              )}

              {/* Threshold Line 2: 72h SLA Breach Capacity (3 * mu) */}
              {summary.breachCapacityThreshold <= maxFanBacklog && (
                <g>
                  <line
                    x1={fanPadX}
                    y1={mapFanY(summary.breachCapacityThreshold)}
                    x2={fanW - fanPadX}
                    y2={mapFanY(summary.breachCapacityThreshold)}
                    stroke="#EF4444"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={fanW - fanPadX - 5}
                    y={mapFanY(summary.breachCapacityThreshold) - 4}
                    fill="#F87171"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    72h Breach Limit (3μ = {summary.breachCapacityThreshold})
                  </text>
                </g>
              )}

              {/* Outer Fan Area: P10 to P90 */}
              <path d={fanAreaP10P90} fill="url(#fanPlumeOuter)" />

              {/* Inner Fan Area: P25 to P75 */}
              <path d={fanAreaP25P75} fill="url(#fanPlumeInner)" />

              {/* 10 Representative Stochastic Sample Trajectories */}
              {simResult.samplePaths.map((path, idx) => {
                const pathStr = path
                  .map((val, d) => `${d === 0 ? 'M' : 'L'} ${mapFanX(d)},${mapFanY(val)}`)
                  .join(' ');
                return (
                  <path
                    key={`path-${idx}`}
                    d={pathStr}
                    fill="none"
                    stroke="rgba(203, 213, 225, 0.22)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* P95 Upper Tail Risk Bound */}
              <path
                d={fanLineP95}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />

              {/* P50 Median Line */}
              <path d={fanLineP50} fill="none" stroke="#2DD4BF" strokeWidth="2.5" />

              {/* Interactive Day Hover Rectangles & Crosshair */}
              {simResult.dailyPercentiles.map((dp) => {
                const x = mapFanX(dp.day);
                const stepW = fanUsableW / 14;
                return (
                  <rect
                    key={`hover-zone-${dp.day}`}
                    x={x - stepW / 2}
                    y={fanPadY}
                    width={stepW}
                    height={fanUsableH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoveredDay(dp.day)}
                  />
                );
              })}

              {/* Hover Crosshair & Data Readout */}
              {hoveredDay !== null && (
                <g pointerEvents="none">
                  {(() => {
                    const dp = simResult.dailyPercentiles[hoveredDay];
                    if (!dp) return null;
                    const x = mapFanX(hoveredDay);
                    const y50 = mapFanY(dp.p50);
                    const waitH = (
                      (dp.p50 / Math.max(1, summary.dailyClearanceCapacity)) *
                      24
                    ).toFixed(1);

                    return (
                      <>
                        <line
                          x1={x}
                          y1={fanPadY}
                          x2={x}
                          y2={fanH - fanPadY}
                          stroke="#38BDF8"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                        <circle cx={x} cy={y50} r="4.5" fill="#38BDF8" stroke="#0F172A" strokeWidth="2" />
                        <g transform={`translate(${Math.min(fanW - 130, Math.max(fanPadX, x - 60))}, 10)`}>
                          <rect
                            width="120"
                            height="34"
                            rx="6"
                            fill="#0F172A"
                            stroke="#38BDF8"
                            strokeWidth="1"
                            opacity="0.95"
                          />
                          <text x="60" y="14" fill="#E2E8F0" fontSize="9" textAnchor="middle" fontFamily="monospace">
                            Day {hoveredDay}: P50={dp.p50} | P95={dp.p95}
                          </text>
                          <text x="60" y="27" fill="#38BDF8" fontSize="9" textAnchor="middle" fontFamily="monospace">
                            FIFO Wait: ~{waitH}h
                          </text>
                        </g>
                      </>
                    );
                  })()}
                </g>
              )}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-300 pt-2 border-t border-slate-700/80 font-mono">
            <span>
              Initial Backlog: <strong>{telemetryAnchors.initialBacklog}</strong> complaints
            </span>
            <span>
              Clearance Capacity: <strong>{summary.dailyClearanceCapacity}</strong> / day
            </span>
            <span>
              Effective Arrivals: <strong>{(telemetryAnchors.baseDailyArrivals * surgeMultiplier).toFixed(1)}</strong> / day
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: CHARTS B & C (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* CHART B: Terminal Backlog Distribution & Tail-Risk Histogram */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-teal-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Day-14 Tail-Risk Histogram
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-bold">
                VaR<sub>95</sub> = {summary.var95Backlog}
              </span>
            </div>

            <div className="pt-1">
              <svg
                data-testid="mc-histogram-svg"
                viewBox={`0 0 ${histW} ${histH}`}
                className="w-full h-auto select-none"
              >
                {/* Horizontal baseline */}
                <line
                  x1={histPadX}
                  y1={histH - histPadY}
                  x2={histW - histPadX}
                  y2={histH - histPadY}
                  stroke="#CBD5E1"
                  strokeWidth="1"
                />

                {/* Histogram Bars */}
                {simResult.histogramBins.map((bin, idx) => {
                  const numBins = simResult.histogramBins.length;
                  const barW = (histUsableW / numBins) * 0.85;
                  const x = histPadX + (idx / numBins) * histUsableW;
                  const barH = (bin.percentage / maxHistPct) * histUsableH;
                  const y = histH - histPadY - barH;

                  const fillColor =
                    bin.zone === 'ON_TRACK'
                      ? '#10B981'
                      : bin.zone === 'AT_RISK'
                        ? '#F59E0B'
                        : '#EF4444';

                  return (
                    <g key={`bar-${idx}`}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(1, barH)}
                        rx="2"
                        fill={fillColor}
                        opacity="0.85"
                      >
                        <title>{`${bin.binStart}–${bin.binEnd} cases: ${bin.percentage}% (${bin.count} runs) [${bin.zone}]`}</title>
                      </rect>
                    </g>
                  );
                })}

                {/* Y-Axis Label */}
                <text
                  x={histPadX - 5}
                  y={histPadY + 10}
                  fill="#94A3B8"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {maxHistPct.toFixed(0)}%
                </text>
                <text
                  x={histPadX - 5}
                  y={histH - histPadY}
                  fill="#94A3B8"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  0%
                </text>

                {/* X-Axis Min/Max Labels */}
                <text
                  x={histPadX}
                  y={histH - histPadY + 14}
                  fill="#64748B"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {simResult.histogramBins[0]?.binStart ?? 0}
                </text>
                <text
                  x={histW - histPadX}
                  y={histH - histPadY + 14}
                  fill="#64748B"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {simResult.histogramBins[simResult.histogramBins.length - 1]?.binEnd ?? 0}
                </text>
              </svg>
            </div>

            {/* SLA Zone Legend */}
            <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100 text-[10px] text-center font-mono">
              <div className="flex items-center justify-center gap-1 text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>&lt;24h Safe</span>
              </div>
              <div className="flex items-center justify-center gap-1 text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>24–72h Risk</span>
              </div>
              <div className="flex items-center justify-center gap-1 text-rose-700">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span>&gt;72h Breach</span>
              </div>
            </div>
          </div>

          {/* CHART C: AI Gate Policy Trade-Off Frontier Curve */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-teal-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  AI Threshold Policy Frontier
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                τ<sub>conf</sub> &isin; [0.35, 0.90]
              </span>
            </div>

            <div className="pt-1">
              <svg
                data-testid="mc-policy-frontier-svg"
                viewBox={`0 0 ${frontW} ${frontH}`}
                className="w-full h-auto select-none"
              >
                {/* Horizontal baseline */}
                <line
                  x1={frontPadX}
                  y1={frontH - frontPadY}
                  x2={frontW - frontPadX}
                  y2={frontH - frontPadY}
                  stroke="#CBD5E1"
                  strokeWidth="1"
                />

                {/* 0.55 Production Gate Line */}
                <line
                  x1={mapFrontX(0.55)}
                  y1={frontPadY}
                  x2={mapFrontX(0.55)}
                  y2={frontH - frontPadY}
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
                <text
                  x={mapFrontX(0.55)}
                  y={frontPadY - 4}
                  fill="#64748B"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  Prod 0.55
                </text>

                {/* Active Selected Confidence Gate Marker */}
                <line
                  x1={mapFrontX(confidenceGate)}
                  y1={frontPadY}
                  x2={mapFrontX(confidenceGate)}
                  y2={frontH - frontPadY}
                  stroke="#0D9488"
                  strokeWidth="1.5"
                />

                {/* Dual Series Curves */}
                {/* Curve 1: Auto-Routing % (Teal) */}
                <path d={autoRouteCurvePath} fill="none" stroke="#0D9488" strokeWidth="2.5" />

                {/* Curve 2: 72h SLA Breach Risk % (Rose) */}
                <path d={breachCurvePath} fill="none" stroke="#EF4444" strokeWidth="2" strokeDasharray="3 2" />

                {/* Data Points */}
                {policyFrontier.map((pt) => {
                  const x = mapFrontX(pt.confidenceGate);
                  const yAuto = mapFrontYLeft(pt.autoRoutePercent);
                  const yBreach = mapFrontYRight(pt.slaBreachProbabilityPercent);
                  const isHovered = hoveredFrontierGate === pt.confidenceGate;

                  return (
                    <g key={`pt-${pt.confidenceGate}`}>
                      <circle
                        cx={x}
                        cy={yAuto}
                        r={isHovered ? 4.5 : 2.5}
                        fill="#0D9488"
                        onMouseEnter={() => setHoveredFrontierGate(pt.confidenceGate)}
                        onMouseLeave={() => setHoveredFrontierGate(null)}
                        className="cursor-pointer"
                      >
                        <title>{`τ=${pt.confidenceGate}: ${pt.autoRoutePercent}% Auto-Routed`}</title>
                      </circle>
                      <circle
                        cx={x}
                        cy={yBreach}
                        r={isHovered ? 4.5 : 2.5}
                        fill="#EF4444"
                        onMouseEnter={() => setHoveredFrontierGate(pt.confidenceGate)}
                        onMouseLeave={() => setHoveredFrontierGate(null)}
                        className="cursor-pointer"
                      >
                        <title>{`τ=${pt.confidenceGate}: ${pt.slaBreachProbabilityPercent}% Breach Risk`}</title>
                      </circle>
                    </g>
                  );
                })}

                {/* X-Axis labels */}
                <text x={mapFrontX(0.35)} y={frontH - frontPadY + 14} fill="#64748B" fontSize="8" fontFamily="monospace">
                  0.35
                </text>
                <text x={mapFrontX(0.9)} y={frontH - frontPadY + 14} fill="#64748B" fontSize="8" fontFamily="monospace" textAnchor="end">
                  0.90
                </text>

                {/* Y-Axis labels */}
                <text x={frontPadX - 5} y={frontPadY + 10} fill="#0D9488" fontSize="8" fontFamily="monospace" textAnchor="end">
                  100%
                </text>
                <text x={frontW - frontPadX + 5} y={frontPadY + 10} fill="#EF4444" fontSize="8" fontFamily="monospace" textAnchor="start">
                  100%
                </text>
              </svg>
            </div>

            {/* Frontier Legend */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] font-mono">
              <span className="flex items-center gap-1.5 text-teal-800">
                <span className="w-2.5 h-0.5 bg-teal-600 inline-block"></span>
                <span>Auto-Route % (Efficiency)</span>
              </span>
              <span className="flex items-center gap-1.5 text-rose-700">
                <span className="w-2.5 h-0.5 border-t border-dashed border-rose-500 inline-block"></span>
                <span>72h Breach Risk %</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
