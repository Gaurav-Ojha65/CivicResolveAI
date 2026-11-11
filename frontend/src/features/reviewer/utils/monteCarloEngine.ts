/**
 * CivicResolve AI — Monte Carlo Operational Queue & AI Threshold Stress Engine
 *
 * Mathematical & Regulatory Foundations:
 * 1. Deterministic Mulberry32 32-bit PRNG for 100% bit-for-bit reproducible runs.
 * 2. Discrete Integer Queue Physics: A_t, H_t, C_t, B_t in Z_>=0 (zero fractional complaints).
 * 3. 8-Class Probability Simplex Bound: P_1 - P_2 >= 2*P_1 - 1 (margin gate adds load iff tau_conf < (1 + tau_margin) / 2).
 * 4. Critical-Priority Safety Floor: CRITICAL_PRIORITY_POLICY mandates human review regardless of confidence.
 * 5. Three FIFO SLA Zones matching CivicResolve analytics:
 *    - On-Track (<24h wait): B_t <= mu_daily
 *    - At-Risk (24–72h wait): mu_daily < B_t <= 3 * mu_daily
 *    - SLA Breached (>72h wait): B_t > 3 * mu_daily
 */

export interface ConfidenceBucketsInput {
  under55: number;
  b55To75: number;
  b75To90: number;
  over90: number;
}

export interface MarginBucketsInput {
  narrow: number;
  clear: number;
}

export interface MonteCarloConfig {
  iterations?: number; // default 1000
  horizonDays?: number; // default 14
  seed?: number; // default 42
  confidenceGate: number; // e.g. 0.55 (range 0.35 to 0.90)
  marginGate: number; // e.g. 0.15 (range 0.05 to 0.35)
  surgeMultiplier: number; // e.g. 1.0 (range 0.5 to 3.0)
  reviewerCount: number; // e.g. 6 (range 2 to 20)
  reviewsPerReviewerPerDay?: number; // default 3

  // Telemetry anchoring
  initialBacklog?: number;
  baseDailyArrivals?: number;
  confidenceBuckets?: ConfidenceBucketsInput;
  marginBuckets?: MarginBucketsInput;
  criticalShare?: number; // Empirical proportion of CRITICAL cases
}

export interface DayPercentiles {
  day: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  mean: number;
}

export interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  percentage: number;
  zone: 'ON_TRACK' | 'AT_RISK' | 'BREACHED';
}

export interface MonteCarloSummary {
  humanReviewRate: number; // 0 to 1
  autoRouteRate: number; // 0 to 1
  dailyClearanceCapacity: number; // mu_daily (24h threshold in complaints)
  breachCapacityThreshold: number; // 3 * mu_daily (72h threshold in complaints)
  medianDay14Backlog: number; // P50 at Day 14
  var95Backlog: number; // 95th percentile backlog at Day 14
  cvar95Backlog: number; // Expected Shortfall (CVaR 95)
  expectedPeakWaitHours: number; // (var95Backlog / mu_daily) * 24
  atRiskProbabilityPercent: number; // % of runs where peak backlog > mu_daily
  slaBreachProbabilityPercent: number; // % of runs where peak backlog > 3 * mu_daily
  executionTimeMs: number;
}

export interface MonteCarloResult {
  dailyPercentiles: DayPercentiles[];
  samplePaths: number[][]; // 10 representative trajectories
  histogramBins: HistogramBin[];
  summary: MonteCarloSummary;
}

export interface PolicyFrontierPoint {
  confidenceGate: number;
  autoRoutePercent: number;
  slaBreachProbabilityPercent: number;
  var95Backlog: number;
}

/**
 * Deterministic Mulberry32 32-bit PRNG.
 * Generates uniformly distributed pseudorandom numbers in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard Box-Muller transformation for normal variates using seeded PRNG.
 */
function sampleBoxMuller(prng: () => number): number {
  const u1 = Math.max(1e-12, prng());
  const u2 = prng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Discrete Poisson integer sampler using Knuth's algorithm (lambda < 30)
 * or Gaussian approximation (lambda >= 30). Always returns integer >= 0.
 */
function samplePoisson(lambda: number, prng: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1.0;
    do {
      k++;
      p *= prng();
    } while (p > L);
    return Math.max(0, k - 1);
  } else {
    const z = sampleBoxMuller(prng);
    const val = Math.round(lambda + Math.sqrt(lambda) * z);
    return Math.max(0, val);
  }
}

/**
 * Discrete Binomial integer sampler. Always returns integer in [0, n].
 */
function sampleBinomial(n: number, p: number, prng: () => number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1.0) return n;
  if (n <= 60) {
    let successes = 0;
    for (let i = 0; i < n; i++) {
      if (prng() < p) successes++;
    }
    return successes;
  } else {
    const mean = n * p;
    const std = Math.sqrt(n * p * (1.0 - p));
    const z = sampleBoxMuller(prng);
    const val = Math.round(mean + std * z);
    return Math.max(0, Math.min(n, val));
  }
}

/**
 * Interpolates human review routing probability from live telemetry confidence & margin buckets.
 * Respects:
 * 1. Simplex inequality bound (P1 - P2 >= 2*P1 - 1).
 * 2. Critical-priority statutory safety floor (minimum 0.12 or empirical share).
 */
export function interpolateHumanReviewRate(config: MonteCarloConfig): number {
  const { confidenceGate, marginGate } = config;

  // Critical-policy safety floor: statutory mandate routes CRITICAL complaints to humans
  const criticalPolicyFloor = Math.max(0.12, config.criticalShare ?? 0.12);

  const buckets = config.confidenceBuckets ?? {
    under55: 20,
    b55To75: 30,
    b75To90: 30,
    over90: 20,
  };

  const totalConf = buckets.under55 + buckets.b55To75 + buckets.b75To90 + buckets.over90;
  const f1 = totalConf > 0 ? buckets.under55 / totalConf : 0.20;
  const f2 = totalConf > 0 ? buckets.b55To75 / totalConf : 0.30;
  const f3 = totalConf > 0 ? buckets.b75To90 / totalConf : 0.30;
  const f4 = totalConf > 0 ? buckets.over90 / totalConf : 0.20;

  // Piecewise linear cumulative confidence distribution F(tau_conf)
  let confCdf: number;
  if (confidenceGate <= 0.55) {
    confCdf = f1 * (confidenceGate / 0.55);
  } else if (confidenceGate <= 0.75) {
    confCdf = f1 + f2 * ((confidenceGate - 0.55) / 0.20);
  } else if (confidenceGate <= 0.90) {
    confCdf = f1 + f2 + f3 * ((confidenceGate - 0.75) / 0.15);
  } else {
    confCdf = f1 + f2 + f3 + f4 * Math.min(1.0, (confidenceGate - 0.90) / 0.10);
  }

  // Margin contribution bounded by the 8-class simplex inequality:
  // Margin gate tau_margin adds incremental review load only when tau_conf < (1 + tau_margin) / 2
  const simplexLimit = (1 + marginGate) / 2;
  let marginContribution = 0;

  if (confidenceGate < simplexLimit) {
    const marginBuckets = config.marginBuckets ?? { narrow: 15, clear: 85 };
    const totalMargin = marginBuckets.narrow + marginBuckets.clear;
    const baseNarrowRate = totalMargin > 0 ? marginBuckets.narrow / totalMargin : 0.15;
    const effectiveMarginRate = baseNarrowRate * (marginGate / 0.15);

    const unflaggedProportion = Math.max(0, 1 - confCdf);
    const simplexRatio = (simplexLimit - confidenceGate) / simplexLimit;
    marginContribution = effectiveMarginRate * unflaggedProportion * simplexRatio;
  }

  const rawRate = confCdf + marginContribution;
  return Math.max(criticalPolicyFloor, Math.min(0.98, rawRate));
}

/**
 * Runs 14-day discrete-integer Monte Carlo queue simulation over `iterations` trajectories.
 */
export function runMonteCarloSimulation(config: MonteCarloConfig): MonteCarloResult {
  const startTime = performance.now();

  const iterations = config.iterations ?? 1000;
  const horizonDays = config.horizonDays ?? 14;
  const seed = config.seed ?? 42;
  const prng = mulberry32(seed);

  const reviewerCount = Math.max(1, config.reviewerCount);
  const reviewsPerReviewerPerDay = config.reviewsPerReviewerPerDay ?? 3;
  const dailyClearanceCapacity = reviewerCount * reviewsPerReviewerPerDay; // mu_daily (24h threshold)
  const breachCapacityThreshold = 3 * dailyClearanceCapacity; // 3 * mu_daily (72h threshold)

  const initialBacklog = Math.max(0, Math.round(config.initialBacklog ?? 8));
  const baseArrivals = Math.max(1, config.baseDailyArrivals ?? 25);
  const effectiveLambda = baseArrivals * config.surgeMultiplier;

  const humanReviewRate = interpolateHumanReviewRate(config);
  const autoRouteRate = Math.max(0, 1.0 - humanReviewRate);

  // Trajectory storage: iterations x (horizonDays + 1)
  const trajectories: number[][] = new Array(iterations);
  let atRiskCount = 0;
  let breachCount = 0;

  for (let i = 0; i < iterations; i++) {
    const path = new Array(horizonDays + 1);
    path[0] = initialBacklog;
    let peak = initialBacklog;

    for (let d = 1; d <= horizonDays; d++) {
      // 1. Daily arrivals (Poisson integer)
      const A_t = samplePoisson(effectiveLambda, prng);
      // 2. Human-routed arrivals (Binomial integer)
      const H_t = sampleBinomial(A_t, humanReviewRate, prng);
      // 3. Daily reviewer capacity (Poisson integer)
      const C_t = samplePoisson(dailyClearanceCapacity, prng);
      // 4. End-of-day backlog recurrence
      const B_t = Math.max(0, path[d - 1] + H_t - C_t);

      path[d] = B_t;
      if (B_t > peak) peak = B_t;
    }

    trajectories[i] = path;
    if (peak > dailyClearanceCapacity) atRiskCount++;
    if (peak > breachCapacityThreshold) breachCount++;
  }

  // Compute daily percentiles
  const dailyPercentiles: DayPercentiles[] = [];
  for (let d = 0; d <= horizonDays; d++) {
    const dayValues = new Array<number>(iterations);
    let sum = 0;
    for (let i = 0; i < iterations; i++) {
      const val = trajectories[i]?.[d] ?? 0;
      dayValues[i] = val;
      sum += val;
    }
    dayValues.sort((a, b) => a - b);

    dailyPercentiles.push({
      day: d,
      p10: dayValues[Math.floor(0.10 * (iterations - 1))] ?? 0,
      p25: dayValues[Math.floor(0.25 * (iterations - 1))] ?? 0,
      p50: dayValues[Math.floor(0.50 * (iterations - 1))] ?? 0,
      p75: dayValues[Math.floor(0.75 * (iterations - 1))] ?? 0,
      p90: dayValues[Math.floor(0.90 * (iterations - 1))] ?? 0,
      p95: dayValues[Math.floor(0.95 * (iterations - 1))] ?? 0,
      mean: Math.round((sum / iterations) * 10) / 10,
    });
  }

  // 10 representative sample paths spanning the percentile plume
  const sortedIndices = Array.from({ length: iterations }, (_, idx) => idx).sort(
    (a, b) => (trajectories[a]?.[horizonDays] ?? 0) - (trajectories[b]?.[horizonDays] ?? 0)
  );
  const samplePaths: number[][] = [];
  const percentilesToSample = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  for (const pct of percentilesToSample) {
    const idx = sortedIndices[Math.min(iterations - 1, Math.floor(pct * iterations))] ?? 0;
    const path = trajectories[idx];
    if (path) samplePaths.push(path);
  }

  // Terminal Day-14 Backlog Distribution (Histogram)
  const day14Values = dailyPercentiles[horizonDays];
  const allDay14 = trajectories.map((p) => p?.[horizonDays] ?? 0).sort((a, b) => a - b);
  const minVal = allDay14[0] ?? 0;
  const maxVal = allDay14[iterations - 1] ?? 0;
  const rangeSpan = Math.max(16, maxVal - minVal + 1);
  const numBins = 16;
  const binWidth = Math.max(1, Math.ceil(rangeSpan / numBins));

  const histogramBins: HistogramBin[] = [];
  let currentValIdx = 0;

  for (let b = 0; b < numBins; b++) {
    const binStart = minVal + b * binWidth;
    const binEnd = binStart + binWidth;
    let count = 0;

    while (
      currentValIdx < iterations &&
      (b === numBins - 1
        ? (allDay14[currentValIdx] ?? 0) >= binStart && (allDay14[currentValIdx] ?? 0) <= maxVal
        : (allDay14[currentValIdx] ?? 0) >= binStart && (allDay14[currentValIdx] ?? 0) < binEnd)
    ) {
      count++;
      currentValIdx++;
    }

    let zone: 'ON_TRACK' | 'AT_RISK' | 'BREACHED';
    if (binEnd <= dailyClearanceCapacity) {
      zone = 'ON_TRACK';
    } else if (binStart > breachCapacityThreshold) {
      zone = 'BREACHED';
    } else {
      zone = 'AT_RISK';
    }

    histogramBins.push({
      binStart,
      binEnd,
      count,
      percentage: Math.round((count / iterations) * 1000) / 10,
      zone,
    });
  }

  // Tail-Risk Summary: VaR 95 and CVaR 95
  const var95Idx = Math.floor(0.95 * (iterations - 1));
  const var95Backlog = allDay14[var95Idx] ?? 0;

  let tailSum = 0;
  let tailCount = 0;
  for (let i = var95Idx; i < iterations; i++) {
    tailSum += allDay14[i] ?? 0;
    tailCount++;
  }
  const cvar95Backlog = tailCount > 0 ? Math.round((tailSum / tailCount) * 10) / 10 : var95Backlog;

  const expectedPeakWaitHours =
    dailyClearanceCapacity > 0
      ? Math.round((var95Backlog / dailyClearanceCapacity) * 24 * 10) / 10
      : 0;

  const executionTimeMs = Math.round((performance.now() - startTime) * 10) / 10;

  return {
    dailyPercentiles,
    samplePaths,
    histogramBins,
    summary: {
      humanReviewRate: Math.round(humanReviewRate * 1000) / 1000,
      autoRouteRate: Math.round(autoRouteRate * 1000) / 1000,
      dailyClearanceCapacity,
      breachCapacityThreshold,
      medianDay14Backlog: day14Values?.p50 ?? 0,
      var95Backlog,
      cvar95Backlog,
      expectedPeakWaitHours,
      atRiskProbabilityPercent: Math.round((atRiskCount / iterations) * 1000) / 10,
      slaBreachProbabilityPercent: Math.round((breachCount / iterations) * 1000) / 10,
      executionTimeMs,
    },
  };
}

/**
 * Computes AI Policy Trade-off Frontier curve across 12 confidence gate thresholds in [0.35, 0.90].
 * Evaluates trade-off between Straight-Through Auto-Routing % and 72h SLA Breach Risk %.
 */
export function computePolicyFrontier(baseConfig: MonteCarloConfig): PolicyFrontierPoint[] {
  const gates = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90];
  const frontier: PolicyFrontierPoint[] = [];

  for (const tau of gates) {
    const pointConfig: MonteCarloConfig = {
      ...baseConfig,
      confidenceGate: tau,
      iterations: 250, // Fast seeded evaluation
      seed: (baseConfig.seed ?? 42) + Math.round(tau * 100),
    };

    const res = runMonteCarloSimulation(pointConfig);
    frontier.push({
      confidenceGate: tau,
      autoRoutePercent: Math.round(res.summary.autoRouteRate * 1000) / 10,
      slaBreachProbabilityPercent: res.summary.slaBreachProbabilityPercent,
      var95Backlog: res.summary.var95Backlog,
    });
  }

  return frontier;
}
