import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MonteCarloStressLab } from '../../../src/features/reviewer/components/MonteCarloStressLab';
import {
  runMonteCarloSimulation,
  interpolateHumanReviewRate,
  computePolicyFrontier,
  MonteCarloConfig,
} from '../../../src/features/reviewer/utils/monteCarloEngine';
import { ExecutiveAnalyticsResponse } from '../../../src/types/grievance';

const MOCK_ANALYTICS: ExecutiveAnalyticsResponse = {
  totalComplaints: 100,
  pendingReview: 12,
  autoRouted: 65,
  humanReviewed: 35,
  autoRoutingEfficiencyRate: 0.65,
  slaComplianceRate: 0.92,
  priorityDistribution: { CRITICAL: 18, HIGH: 32, MEDIUM: 30, LOW: 20 },
  statusDistribution: { PENDING_REVIEW: 12, AUTO_ROUTED: 65, APPROVED: 18, OVERRIDDEN: 5, REJECTED: 0 },
  categoryVolumeMatrix: [],
  confidenceSentimentBuckets: {
    confidenceUnder55: 15,
    confidence55To75: 25,
    confidence75To90: 35,
    confidenceOver90: 25,
    narrowMargin: 20,
    clearMargin: 80,
    negativeSentiment: 40,
    neutralSentiment: 35,
    positiveSentiment: 25,
  },
  dailyIntakeTrend: [
    { date: 'Day 1', intakeCount: 22, autoRoutedCount: 14, humanReviewedCount: 8 },
    { date: 'Day 2', intakeCount: 28, autoRoutedCount: 18, humanReviewedCount: 10 },
  ],
  slaAgingBreakdown: {
    onTrack: 9,
    atRisk: 2,
    breached: 1,
    totalPending: 12,
  },
};

describe('Monte Carlo Queue & AI Policy Stress Engine', () => {
  const baseConfig: MonteCarloConfig = {
    confidenceGate: 0.55,
    marginGate: 0.15,
    surgeMultiplier: 1.0,
    reviewerCount: 6,
    seed: 42,
    iterations: 1000,
    horizonDays: 14,
    initialBacklog: 12,
    baseDailyArrivals: 25,
  };

  it('Test 1: Bitwise Determinism — Identical seed produces bit-for-bit identical results; different seeds produce distinct trajectories', () => {
    const run1 = runMonteCarloSimulation({ ...baseConfig, seed: 42 });
    const run2 = runMonteCarloSimulation({ ...baseConfig, seed: 42 });
    const runDiffSeed = runMonteCarloSimulation({ ...baseConfig, seed: 108 });

    // Same seed -> Exact equality
    expect(run1.summary.var95Backlog).toBe(run2.summary.var95Backlog);
    expect(run1.summary.cvar95Backlog).toBe(run2.summary.cvar95Backlog);
    expect(run1.summary.medianDay14Backlog).toBe(run2.summary.medianDay14Backlog);
    expect(run1.summary.atRiskProbabilityPercent).toBe(run2.summary.atRiskProbabilityPercent);
    expect(run1.summary.slaBreachProbabilityPercent).toBe(run2.summary.slaBreachProbabilityPercent);
    expect(run1.dailyPercentiles).toEqual(run2.dailyPercentiles);
    expect(run1.samplePaths).toEqual(run2.samplePaths);

    // Different seed -> Stochastically distinct trajectory paths
    expect(run1.samplePaths).not.toEqual(runDiffSeed.samplePaths);
  });

  it('Test 2: Discrete Integer Invariant — All daily backlogs, arrivals, completions and terminal counts are strictly integers', () => {
    const result = runMonteCarloSimulation(baseConfig);

    // Verify all 10 sample paths contain strictly non-negative integers
    expect(result.samplePaths.length).toBe(10);
    for (const path of result.samplePaths) {
      expect(path.length).toBe(15); // Day 0 to 14
      for (const val of path) {
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
      }
    }

    // Verify Day-14 percentiles are integers
    for (const dp of result.dailyPercentiles) {
      expect(Number.isInteger(dp.day)).toBe(true);
      expect(Number.isInteger(dp.p10)).toBe(true);
      expect(Number.isInteger(dp.p25)).toBe(true);
      expect(Number.isInteger(dp.p50)).toBe(true);
      expect(Number.isInteger(dp.p75)).toBe(true);
      expect(Number.isInteger(dp.p90)).toBe(true);
      expect(Number.isInteger(dp.p95)).toBe(true);
    }

    // Verify histogram bin ranges are integers
    for (const bin of result.histogramBins) {
      expect(Number.isInteger(bin.binStart)).toBe(true);
      expect(Number.isInteger(bin.binEnd)).toBe(true);
      expect(Number.isInteger(bin.count)).toBe(true);
    }
  });

  it('Test 3: Monotonic Queue Physics — Surge multiplier and confidence gate increase backlog; staffing decreases backlog', () => {
    const normal = runMonteCarloSimulation(baseConfig);

    // Volume Surge: 1.0x -> 2.5x
    const surged = runMonteCarloSimulation({ ...baseConfig, surgeMultiplier: 2.5 });
    expect(surged.summary.var95Backlog).toBeGreaterThan(normal.summary.var95Backlog);
    expect(surged.summary.atRiskProbabilityPercent).toBeGreaterThanOrEqual(normal.summary.atRiskProbabilityPercent);

    // Tight Confidence Gate: 0.45 -> 0.85
    const loose = runMonteCarloSimulation({ ...baseConfig, confidenceGate: 0.45 });
    const tight = runMonteCarloSimulation({ ...baseConfig, confidenceGate: 0.85 });
    expect(tight.summary.var95Backlog).toBeGreaterThan(loose.summary.var95Backlog);
    expect(tight.summary.humanReviewRate).toBeGreaterThan(loose.summary.humanReviewRate);

    // Staffing Scale: 3 Reviewers vs 15 Reviewers
    const understaffed = runMonteCarloSimulation({ ...baseConfig, reviewerCount: 3 });
    const wellStaffed = runMonteCarloSimulation({ ...baseConfig, reviewerCount: 15 });
    expect(understaffed.summary.var95Backlog).toBeGreaterThan(wellStaffed.summary.var95Backlog);
    expect(wellStaffed.summary.dailyClearanceCapacity).toBeGreaterThan(understaffed.summary.dailyClearanceCapacity);
  });

  it('Test 4: Simplex & Critical Floor Invariant — Human review rate never drops below statutory safety floor', () => {
    // Highly permissive thresholds: confidence 0.35, margin 0.05
    const permissiveRate = interpolateHumanReviewRate({
      confidenceGate: 0.35,
      marginGate: 0.05,
      surgeMultiplier: 1.0,
      reviewerCount: 6,
      criticalShare: 0.18, // 18% empirical critical complaints
    });

    // Mandatory floor: at least empirical critical share (0.18) and minimum safety floor (0.12)
    expect(permissiveRate).toBeGreaterThanOrEqual(0.18);
    expect(permissiveRate).toBeGreaterThanOrEqual(0.12);

    // Simplex check: When tau_conf >= (1 + tau_margin) / 2, margin adds 0 incremental load
    // e.g. tau_margin = 0.10 => (1 + 0.10) / 2 = 0.55
    // tau_conf = 0.60 > 0.55
    const rateWithSmallMargin = interpolateHumanReviewRate({
      confidenceGate: 0.60,
      marginGate: 0.10,
      surgeMultiplier: 1.0,
      reviewerCount: 6,
    });
    const rateWithLargeMargin = interpolateHumanReviewRate({
      confidenceGate: 0.60,
      marginGate: 0.05,
      surgeMultiplier: 1.0,
      reviewerCount: 6,
    });
    // Since tau_conf >= simplex limit, margin contribution is 0 for both
    expect(rateWithSmallMargin).toBe(rateWithLargeMargin);
  });

  it('Test 4b: Policy Frontier Calculation — Generates 12 evaluated trade-off points with monotonic auto-routing properties', () => {
    const frontier = computePolicyFrontier(baseConfig);
    expect(frontier).toHaveLength(12);
    expect(frontier[0]?.confidenceGate).toBe(0.35);
    expect(frontier[frontier.length - 1]?.confidenceGate).toBe(0.90);
    // As confidence threshold increases, straight-through auto-route percentage monotonically decreases or remains flat
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i]!.autoRoutePercent).toBeLessThanOrEqual(frontier[i - 1]!.autoRoutePercent);
    }
  });
});

describe('MonteCarloStressLab UI Component', () => {
  it('Test 5: UI Rendering & Interaction — Renders all 3 SVG charts, scenario presets, and updates on slider adjustments', () => {
    render(<MonteCarloStressLab analyticsData={MOCK_ANALYTICS} />);

    // Check Header & Truthful Disclosure Badge
    expect(
      screen.getByText(/Monte Carlo Operational Queue & AI Policy Stress Lab/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/STOCHASTIC MONTE CARLO SIMULATION • SEEDED PRNG/i)
    ).toBeInTheDocument();

    // Check 4 Executive KPI Cards
    expect(screen.getByText(/Simulated Routing Split/i)).toBeInTheDocument();
    expect(screen.getByText(/Day-14 Median \(P50\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Tail-Risk \(VaR 95 \/ CVaR 95\)/i)).toBeInTheDocument();
    expect(screen.getByText(/72h SLA Breach Risk/i)).toBeInTheDocument();

    // Check All 3 Synchronized SVG Charts
    expect(screen.getByTestId('mc-fan-chart-svg')).toBeInTheDocument();
    expect(screen.getByTestId('mc-histogram-svg')).toBeInTheDocument();
    expect(screen.getByTestId('mc-policy-frontier-svg')).toBeInTheDocument();

    // Check Scenario Presets are present
    expect(screen.getByText('Production Baseline')).toBeInTheDocument();
    expect(screen.getByText('2.2x Regulatory Foreclosure Surge')).toBeInTheDocument();
    expect(screen.getByText('Conservative Audit Policy')).toBeInTheDocument();
    expect(screen.getByText('Understaffed Shift Stress')).toBeInTheDocument();

    // Click Scenario Preset: "Understaffed Shift Stress"
    fireEvent.click(screen.getByText('Understaffed Shift Stress'));

    // Assert that active staffing slider updated to 3 Reviewers
    expect(screen.getByTestId('reviewer-count-display')).toHaveTextContent('3 Reviewers');

    // Reset button restores to baseline (6 Reviewers)
    const resetBtn = screen.getByRole('button', { name: /reset to live telemetry/i });
    fireEvent.click(resetBtn);
    expect(screen.getByTestId('reviewer-count-display')).toHaveTextContent('6 Reviewers');

    // Move slider: adjust confidence gate to 0.75
    const confSlider = screen.getByLabelText(/Confidence Gate/i);
    fireEvent.change(confSlider, { target: { value: '0.75' } });
    expect(screen.getByText('0.75')).toBeInTheDocument();
  });
});
