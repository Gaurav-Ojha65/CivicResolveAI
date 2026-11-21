import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  Info,
  Scale,
  Cpu,
  Award,
  PieChart as PieIcon,
  SlidersHorizontal,
  Download,
  Copy,
  Check,
  Database,
  ShieldCheck,
  FileText,
  Activity,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { ReviewerLayout } from '../../components/layout/ReviewerLayout';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  getModelAudit,
  getCalibrationMetrics,
  getActiveLearningManifest,
} from '../../lib/api/endpoints';
import {
  ModelAuditResponse,
  CalibrationMetricsResponse,
  ReliabilityBin,
  ActiveLearningManifestResponse,
} from '../../types/grievance';
import { ApiError } from '../../lib/errors/api-error';
import { getApiBaseUrl, getInMemoryAuthHeader } from '../../lib/api/api-client';

// Authentic 8 CFPB product category labels
const APPROVED_CATEGORIES = [
  'Credit reporting or other personal consumer reports',
  'Debt collection',
  'Credit card',
  'Checking or savings account',
  'Money transfer, virtual currency, or money service',
  'Mortgage',
  'Student loan',
  'Vehicle loan or lease',
];

// Verified validation benchmark data from nlp-service/models_saved/model_comparison_val.md
const VALIDATION_BENCHMARKS = [
  {
    category: 'Credit reporting or other personal consumer reports',
    baselineF1: 0.9056,
    bilstmF1: 0.8906,
    baselinePrec: 0.967,
    bilstmPrec: 0.9621,
    baselineRec: 0.8514,
    bilstmRec: 0.8291,
    delta: -0.015,
    support: 8232,
  },
  {
    category: 'Debt collection',
    baselineF1: 0.7438,
    bilstmF1: 0.7142,
    baselinePrec: 0.6737,
    bilstmPrec: 0.6495,
    baselineRec: 0.8302,
    bilstmRec: 0.7932,
    delta: -0.0296,
    support: 1649,
  },
  {
    category: 'Credit card',
    baselineF1: 0.7107,
    bilstmF1: 0.672,
    baselinePrec: 0.6452,
    bilstmPrec: 0.6054,
    baselineRec: 0.7909,
    bilstmRec: 0.7551,
    delta: -0.0387,
    support: 837,
  },
  {
    category: 'Checking or savings account',
    baselineF1: 0.7703,
    bilstmF1: 0.7271,
    baselinePrec: 0.7477,
    bilstmPrec: 0.7292,
    baselineRec: 0.7943,
    bilstmRec: 0.7249,
    delta: -0.0432,
    support: 836,
  },
  {
    category: 'Money transfer, virtual currency, or money service',
    baselineF1: 0.7271,
    bilstmF1: 0.7177,
    baselinePrec: 0.7065,
    bilstmPrec: 0.6773,
    baselineRec: 0.7488,
    bilstmRec: 0.7632,
    delta: -0.0094,
    support: 418,
  },
  {
    category: 'Mortgage',
    baselineF1: 0.8299,
    bilstmF1: 0.8055,
    baselinePrec: 0.7722,
    bilstmPrec: 0.7265,
    baselineRec: 0.8969,
    bilstmRec: 0.9038,
    delta: -0.0244,
    support: 291,
  },
  {
    category: 'Student loan',
    baselineF1: 0.6432,
    bilstmF1: 0.593,
    baselinePrec: 0.5013,
    bilstmPrec: 0.4385,
    baselineRec: 0.8972,
    bilstmRec: 0.9159,
    delta: -0.0502,
    support: 214,
  },
  {
    category: 'Vehicle loan or lease',
    baselineF1: 0.6321,
    bilstmF1: 0.5337,
    baselinePrec: 0.5299,
    bilstmPrec: 0.4104,
    baselineRec: 0.7831,
    bilstmRec: 0.7631,
    delta: -0.0984,
    support: 249,
  },
];

// Verified final held-out test benchmark data (n=12,727) from nlp-service/models_saved/final_test_evaluation_report.md
const TEST_BENCHMARKS = [
  {
    category: 'Credit reporting or other personal consumer reports',
    baselineF1: 0.9078,
    bilstmF1: 0.8906,
    baselinePrec: 0.9663,
    bilstmPrec: 0.9609,
    baselineRec: 0.856,
    bilstmRec: 0.8299,
    delta: 0.0172,
    support: 8232,
  },
  {
    category: 'Debt collection',
    baselineF1: 0.7431,
    bilstmF1: 0.7115,
    baselinePrec: 0.6773,
    bilstmPrec: 0.6487,
    baselineRec: 0.823,
    bilstmRec: 0.7879,
    delta: 0.0316,
    support: 1650,
  },
  {
    category: 'Credit card',
    baselineF1: 0.7209,
    bilstmF1: 0.6879,
    baselinePrec: 0.6604,
    bilstmPrec: 0.6273,
    baselineRec: 0.7936,
    bilstmRec: 0.7613,
    delta: 0.033,
    support: 838,
  },
  {
    category: 'Checking or savings account',
    baselineF1: 0.7769,
    bilstmF1: 0.7337,
    baselinePrec: 0.7497,
    bilstmPrec: 0.7214,
    baselineRec: 0.8062,
    bilstmRec: 0.7464,
    delta: 0.0432,
    support: 836,
  },
  {
    category: 'Money transfer, virtual currency, or money service',
    baselineF1: 0.7314,
    bilstmF1: 0.7167,
    baselinePrec: 0.6987,
    bilstmPrec: 0.6818,
    baselineRec: 0.7674,
    bilstmRec: 0.7554,
    delta: 0.0147,
    support: 417,
  },
  {
    category: 'Mortgage',
    baselineF1: 0.8194,
    bilstmF1: 0.7938,
    baselinePrec: 0.772,
    bilstmPrec: 0.7187,
    baselineRec: 0.8729,
    bilstmRec: 0.8866,
    delta: 0.0256,
    support: 291,
  },
  {
    category: 'Student loan',
    baselineF1: 0.669,
    bilstmF1: 0.5806,
    baselinePrec: 0.5402,
    bilstmPrec: 0.4433,
    baselineRec: 0.8785,
    bilstmRec: 0.8411,
    delta: 0.0884,
    support: 214,
  },
  {
    category: 'Vehicle loan or lease',
    baselineF1: 0.6217,
    bilstmF1: 0.5126,
    baselinePrec: 0.5103,
    bilstmPrec: 0.3829,
    baselineRec: 0.7952,
    bilstmRec: 0.7751,
    delta: 0.1091,
    support: 249,
  },
];

const TEST_LENGTH_BUCKETS = [
  { bucket: '<50 words', support: 1815, share: '14.3%', baselineAcc: 0.8116, bilstmAcc: 0.757, delta: '+5.5%' },
  { bucket: '50-150 words', support: 4847, share: '38.1%', baselineAcc: 0.8581, bilstmAcc: 0.8292, delta: '+2.9%' },
  { bucket: '150-300 words', support: 3743, share: '29.4%', baselineAcc: 0.8309, bilstmAcc: 0.8167, delta: '+1.4%' },
  { bucket: '>300 words', support: 2322, share: '18.2%', baselineAcc: 0.845, bilstmAcc: 0.814, delta: '+3.1%' },
];

export const ModelAuditPage: React.FC = () => {
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [auditData, setAuditData] = useState<ModelAuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    row: string;
    col: string;
    count: number;
    rowTotal: number;
  } | null>(null);

  // Calibration Inspector State
  const [calibrationData, setCalibrationData] = useState<CalibrationMetricsResponse | null>(null);
  const [calibrationLoading, setCalibrationLoading] = useState(false);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [hoveredBin, setHoveredBin] = useState<ReliabilityBin | null>(null);

  // Active Learning Flywheel State
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const [manifestData, setManifestData] = useState<ActiveLearningManifestResponse | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<{
    format: string;
    sha256: string;
    recordCount: string | null;
  } | null>(null);
  const [copiedSha, setCopiedSha] = useState(false);

  const fetchAuditMetrics = useCallback(async (signal?: AbortSignal) => {
    setAuditData(null);
    setIsLoading(true);
    setError(null);
    try {
      const data = await getModelAudit(signal);
      if (!signal?.aborted) setAuditData(data);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiError) {
        setError(err.message || `Failed to fetch model audit analytics (${err.status})`);
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  const fetchCalibration = useCallback(async (signal?: AbortSignal) => {
    setCalibrationData(null);
    setHoveredBin(null);
    setCalibrationLoading(true);
    setCalibrationError(null);
    try {
      const data = await getCalibrationMetrics(signal);
      if (!signal?.aborted) setCalibrationData(data);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiError) {
        setCalibrationError(err.message || 'Failed to load calibration data');
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setCalibrationError(err.message);
      }
    } finally {
      if (!signal?.aborted) setCalibrationLoading(false);
    }
  }, []);

  const fetchManifest = useCallback(async (overrides: boolean, signal?: AbortSignal) => {
    setExportSuccess(null);
    setExportError(null);
    setManifestData(null);
    setManifestLoading(true);
    setManifestError(null);
    try {
      const data = await getActiveLearningManifest(overrides, signal);
      if (!signal?.aborted) setManifestData(data);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiError) {
        setManifestError(err.message || 'Failed to load export manifest');
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setManifestError(err.message);
      }
    } finally {
      if (!signal?.aborted) setManifestLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAuditMetrics(controller.signal);
    fetchCalibration(controller.signal);
    return () => controller.abort();
  }, [fetchAuditMetrics, fetchCalibration, refreshIndex]);

  useEffect(() => {
    const controller = new AbortController();
    fetchManifest(onlyOverrides, controller.signal);
    return () => controller.abort();
  }, [fetchManifest, onlyOverrides, refreshIndex]);

  const handleExportDownload = async (format: 'jsonl' | 'csv') => {
    setExportError(null);
    setExportSuccess(null);
    setExportLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/api/grievances/analytics/active-learning-export?format=${format}&onlyOverrides=${onlyOverrides}`;
      const authHeader = getInMemoryAuthHeader();
      const res = await fetch(url, {
        headers: {
          Accept: format === 'jsonl' ? 'application/x-ndjson' : 'text/csv',
          'X-Requested-With': 'XMLHttpRequest',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Export download failed with HTTP ${res.status}`);
      }

      const sha256 = res.headers.get('X-Export-SHA256') || 'Unavailable';
      const recordCount = res.headers.get('X-Export-Record-Count');

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `civicresolve_active_learning_${onlyOverrides ? 'overrides_' : 'all_'}${dateStr}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);

      setExportSuccess({
        format: format.toUpperCase(),
        sha256,
        recordCount,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setExportError(msg);
    } finally {
      setExportLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 2000);
    } catch {
      setExportError("Could not copy the digest. Select and copy it manually.");
    }
  };

  // Max count in confusion matrix for dynamic color intensity
  const matrixStats = useMemo(() => {
    if (!auditData || !auditData.confusionMatrix) return { maxDiagonal: 1, maxOffDiag: 1, rowTotals: {} };
    let maxDiagonal = 1;
    let maxOffDiag = 1;
    const rowTotals: Record<string, number> = {};

    APPROVED_CATEGORIES.forEach((row) => {
      const rowData = auditData.confusionMatrix[row] || {};
      let total = 0;
      APPROVED_CATEGORIES.forEach((col) => {
        const val = rowData[col] || 0;
        total += val;
        if (row === col) {
          if (val > maxDiagonal) maxDiagonal = val;
        } else {
          if (val > maxOffDiag) maxOffDiag = val;
        }
      });
      rowTotals[row] = total;
    });

    return { maxDiagonal, maxOffDiag, rowTotals };
  }, [auditData]);

  // Trigger breakdown donut computations
  const donutData = useMemo(() => {
    if (!auditData) return null;
    const triggers = [
      { label: 'Low confidence', count: auditData.triggerBreakdown.LOW_CONFIDENCE || 0, color: '#f59e0b' },
      { label: 'Narrow margin', count: auditData.triggerBreakdown.SMALL_MARGIN || 0, color: '#fbbf24' },
      { label: 'Critical Policy Flag', count: auditData.triggerBreakdown.CRITICAL_PRIORITY_POLICY || 0, color: '#f43f5e' },
      { label: 'Auto-routed', count: auditData.triggerBreakdown.AUTO_ROUTED || 0, color: '#14b8a6' },
    ];
    const total = triggers.reduce((acc, t) => acc + t.count, 0);

    const circumference = 2 * Math.PI * 40; // r=40
    let accumulatedAngle = 0;

    const segments = triggers.map((t) => {
      const fraction = total > 0 ? t.count / total : 0;
      const strokeDasharray = `${fraction * circumference} ${circumference}`;
      const strokeDashoffset = -accumulatedAngle * circumference;
      accumulatedAngle += fraction;
      return { ...t, fraction, strokeDasharray, strokeDashoffset };
    });

    return { segments, total };
  }, [auditData]);

  // Reliability diagram SVG coordinates computation
  const reliabilityDiagramPoints = useMemo(() => {
    if (!calibrationData || !calibrationData.uncalibrated_bins) return null;
    const w = 460;
    const h = 300;
    const left = 50;
    const top = 20;
    const plotW = w - left - 25; // 385
    const plotH = h - top - 40;  // 240

    const mapX = (conf: number) => left + Math.max(0, Math.min(1, conf)) * plotW;
    const mapY = (acc: number) => top + (1 - Math.max(0, Math.min(1, acc))) * plotH;

    const uncalBins = [...calibrationData.uncalibrated_bins].sort((a, b) => a.bin_index - b.bin_index);
    const calBins = [...(calibrationData.calibrated_bins || [])].sort((a, b) => a.bin_index - b.bin_index);

    const uncalPoints = uncalBins
      .filter((b) => b.sample_count > 0)
      .map((b) => ({
        x: mapX(b.mean_confidence),
        y: mapY(b.empirical_accuracy),
        bin: b,
      }));

    const calPoints = calBins
      .filter((b) => b.sample_count > 0)
      .map((b) => ({
        x: mapX(b.mean_confidence),
        y: mapY(b.empirical_accuracy),
        bin: b,
      }));

    return { w, h, left, top, plotW, plotH, mapX, mapY, uncalPoints, calPoints, uncalBins, calBins };
  }, [calibrationData]);

  return (
    <ReviewerLayout
      title="Model audit"
      subtitle="Compare recorded reviewer decisions, calibration evidence and frozen model benchmarks."
      onRefresh={() => setRefreshIndex(index => index + 1)}
      isRefreshing={isLoading || calibrationLoading || manifestLoading}
    >
      <div className="min-w-0 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Model audit</h1>
          <p className="mt-1 text-sm text-ink-muted">Compare recorded reviewer decisions, calibration evidence and frozen model benchmarks.</p>
        </header>
        {/* Error Handling */}
        {error && (
          <ErrorState
            title="Unable to Load Audit Analytics"
            message={error}
            onRetry={() => setRefreshIndex(index => index + 1)}
          />
        )}

        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200/80 p-8 shadow-xs">
            <LoadingIndicator label="Calculating operational agreement metrics..." />
            <span className="text-xs text-slate-500 font-medium">
              Aggregating live model predictions and human reviewer decisions...
            </span>
          </div>
        ) : auditData ? (
          <>
            {/* ─── 1. LIVE OPERATIONAL KPIS ─────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Adjudicated */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total Adjudicated
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <p className="text-3xl font-semibold text-slate-900 mt-2 font-mono tabular-nums">
                  {auditData.totalAdjudicated}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Reviewed cases (Approved or Overridden)
                </p>
              </div>

              {/* Card 2: Agreement Rate */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Reviewer Agreement
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <TrendingUp size={18} />
                  </div>
                </div>
                <p className="text-3xl font-semibold text-emerald-700 mt-2 font-mono tabular-nums">
                  {auditData.totalAdjudicated ? (auditData.reviewerAgreementRate * 100).toFixed(1) + '%' : 'No reviewed cases'}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Predicted and assigned categories match, including priority-only overrides.
                </p>
              </div>

              {/* Card 3: Total Overrides */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Human Overrides
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                    <RotateCcw size={18} />
                  </div>
                </div>
                <p className="text-3xl font-semibold text-amber-700 mt-2 font-mono tabular-nums">
                  {Object.values(auditData.categoryOverrideDistribution).reduce((sum, count) => sum + count, 0)}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Classification or priority re-assigned
                </p>
              </div>

              {/* Card 4: Triage Trigger Volume */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Safety Flag Triggers
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
                    <ShieldAlert size={18} />
                  </div>
                </div>
                <p className="text-3xl font-semibold text-slate-900 mt-2 font-mono tabular-nums">
                  {(auditData.triggerBreakdown.LOW_CONFIDENCE || 0) +
                    (auditData.triggerBreakdown.SMALL_MARGIN || 0) +
                    (auditData.triggerBreakdown.CRITICAL_PRIORITY_POLICY || 0)}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Low confidence, narrow margin, or policy critical
                </p>
              </div>
            </div>

            {/* ─── 2. VISUAL CHARTS: SEMI-CIRCLE GAUGE & DONUT DISTRIBUTION ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Visual 2: Triage Trigger Distribution Donut Chart */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <PieIcon size={16} className="text-teal-600" />
                    <h2 className="text-base font-semibold text-ink">
                      Review Trigger Distribution
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {donutData?.total ?? 0} recorded events
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4 py-1">
                  {/* Donut SVG */}
                  <div className="relative w-28 h-28 flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="16" />
                      {donutData?.segments.map((seg, idx) => (
                        <circle
                          key={idx}
                          cx="50"
                          cy="50"
                          r="40"
                          fill="transparent"
                          stroke={seg.color}
                          strokeWidth="16"
                          strokeDasharray={seg.strokeDasharray}
                          strokeDashoffset={seg.strokeDashoffset}
                        />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xs font-bold font-mono text-slate-800">
                        {donutData?.total ?? 0} events
                      </span>
                    </div>
                  </div>

                  {/* Donut Legend */}
                  <div className="space-y-1.5 text-xs flex-1">
                    {donutData?.segments.map((seg, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="text-slate-600 truncate text-xs">{seg.label}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-xs ml-2">{seg.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-600 border-t border-slate-100 pt-2">
                  A prediction may contribute to more than one review trigger. Routing follows the recorded review flag.
                </p>
              </div>

              {/* Truthful AI Calibration Notice */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                      <Info size={16} />
                    </div>
                    <h2 className="text-base font-semibold text-ink">
                      Model Governance &amp; Truthful AI
                    </h2>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    CivicResolve AI classification scores represent <strong>uncalibrated model probability estimates</strong> produced by a TF-IDF multi-class logistic regression classifier. Model predictions provide preliminary algorithmic triage assistance and do not constitute legal determinations or binding case adjudications.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 font-mono flex items-center justify-between">
                  <span>Source: saved predictions</span>
                  <span className="text-emerald-700 font-bold">TF-IDF baseline</span>
                </div>
              </div>
            </div>

            {/* ─── 3. 8x8 ADJUDICATION HEATMAP MATRIX ───────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Scale size={16} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      8&times;8 Model Prediction vs Human Adjudication Matrix
                    </h2>
                    <p className="text-xs text-slate-500">
                      Rows = Model Predicted Category &bull; Columns = Human Reviewer Assigned Category &bull; A cell gives the number of cases with that pair of categories.
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono text-slate-500">
                  {auditData.totalAdjudicated} Adjudicated Cases
                </span>
              </div>

              {/* Hover Tooltip Alert */}
              {hoveredCell && (
                <div className="p-3 rounded-xl bg-slate-900 text-white text-xs flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
                  <div>
                    <span className="text-slate-300 font-mono">Predicted: </span>
                    <span className="font-semibold text-teal-300">{hoveredCell.row}</span>
                    <span className="text-slate-300 mx-2">&rarr;</span>
                    <span className="text-slate-300 font-mono">Adjudicated: </span>
                    <span className="font-semibold text-amber-300">{hoveredCell.col}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white font-mono">{hoveredCell.count} cases</span>
                    <span className="text-slate-300 text-xs">
                      ({hoveredCell.rowTotal > 0 ? Math.round((hoveredCell.count / hoveredCell.rowTotal) * 100) : 0}% of row)
                    </span>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto" role="region" aria-label="Predicted and assigned category counts" tabIndex={0}>
                <table aria-label="Predicted and assigned category counts" className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="p-2 text-left font-bold w-48">Model \ Human</th>
                      {APPROVED_CATEGORIES.map((cat, idx) => (
                        <th key={cat} scope="col" aria-label={cat} className="p-2 text-center font-bold" title={cat}>
                          C{idx + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-xs">
                    {APPROVED_CATEGORIES.map((rowCat, rowIdx) => {
                      const rowData = auditData.confusionMatrix[rowCat] || {};
                      const rowTotal = matrixStats.rowTotals[rowCat] || 0;

                      return (
                        <tr key={rowCat} className="hover:bg-slate-50/70 transition-colors">
                          <th scope="row" className="p-2 text-left font-sans font-medium text-slate-800 truncate max-w-[220px]" title={rowCat}>
                            <span className="text-xs text-slate-600 font-mono mr-1">
                              C{rowIdx + 1}
                            </span>
                            {rowCat}
                          </th>
                          {APPROVED_CATEGORIES.map((colCat) => {
                            const count = rowData[colCat] || 0;
                            const isDiagonal = rowCat === colCat;

                            // Color scale intensity
                            let cellBg = 'bg-transparent text-slate-600';
                            if (isDiagonal && count > 0) {
                              const ratio = count / matrixStats.maxDiagonal;
                              if (ratio > 0.6) {
                                cellBg = 'bg-teal-700 text-white font-bold';
                              } else if (ratio > 0.3) {
                                cellBg = 'bg-teal-100 text-teal-900 font-bold';
                              } else {
                                cellBg = 'bg-teal-100 text-teal-900 font-bold';
                              }
                            } else if (!isDiagonal && count > 0) {
                              const ratio = count / matrixStats.maxOffDiag;
                              if (ratio > 0.5) {
                                cellBg = 'bg-amber-800 text-white font-bold';
                              } else {
                                cellBg = 'bg-amber-100 text-amber-900 font-bold';
                              }
                            }

                            return (
                              <td
                                key={colCat}
                                onMouseEnter={() => setHoveredCell({ row: rowCat, col: colCat, count, rowTotal })}
                                onMouseLeave={() => setHoveredCell(null)}
                                className={`p-2 text-center tabular-nums cursor-pointer transition-all ${cellBg}`}
                              >
                                <span>{count}</span>
                                {rowTotal > 0 && <span className="sr-only">, {Math.round(count / rowTotal * 100)}% of this predicted category</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-slate-600 flex flex-wrap gap-4 pt-2 border-t border-slate-100 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-teal-500 inline-block" />
                  Diagonal = same category
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" />
                  Off-diagonal = category changed
                </span>
              </div>
            </div>

            {/* ─── 4. PROBABILITY CALIBRATION INSPECTOR ─────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <SlidersHorizontal size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Probability Calibration Inspector &amp; Reliability Diagram
                    </h2>
                    <p className="text-xs text-slate-500">
                      {calibrationData ? `Validation split · n = ${calibrationData.calibration_fit_rows.toLocaleString()} fit / n = ${calibrationData.calibration_eval_rows.toLocaleString()} eval` : "Validation-set measurements from the NLP service."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-teal-50 text-teal-800 border border-teal-200">
                    {calibrationData ? `Optimal T = ${calibrationData.optimal_temperature.toFixed(4)}` : calibrationLoading ? 'Loading calibration' : 'Calibration unavailable'}
                  </span>
                </div>
              </div>

              {calibrationError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                  <span>{calibrationError}</span>
                </div>
              )}

              {calibrationData && <>
              {/* Metric Stat Callouts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Metric 1: Temperature */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Temperature Scale (T)
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-semibold text-teal-800 font-mono">
                      {calibrationData.optimal_temperature.toFixed(4)}
                    </span>
                    <span className="text-xs text-teal-700 font-semibold font-mono">
                      (NLL Minimized)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Temperatures below one sharpen the probability distribution.
                  </p>
                </div>

                {/* Metric 2: ECE */}
                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                    Expected Calibration Error
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-semibold text-emerald-700 font-mono">
                      {(calibrationData.calibrated_ece * 100).toFixed(2)}%
                    </span>
                    <span className="text-xs text-slate-600 font-mono line-through">
                      {(calibrationData.uncalibrated_ece * 100).toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700 font-semibold mt-1">
                    {calibrationData.ece_reduction_percent.toFixed(1)}% relative reduction
                  </p>
                </div>

                {/* Metric 3: Brier Score */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Multi-Class Brier Score
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-semibold text-slate-800 font-mono">
                      {calibrationData.calibrated_brier.toFixed(4)}
                    </span>
                    <span className="text-xs text-slate-600 font-mono line-through">
                      {calibrationData.uncalibrated_brier.toFixed(4)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Mean squared error of multi-class probabilities.
                  </p>
                </div>

                {/* Metric 4: Max Calibration Error */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Max Calibration Error (MCE)
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-semibold text-slate-800 font-mono">
                      {(calibrationData.calibrated_mce * 100).toFixed(2)}%
                    </span>
                    <span className="text-xs text-slate-600 font-mono line-through">
                      {(calibrationData.uncalibrated_mce * 100).toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Worst-case single-bin divergence.
                  </p>
                </div>
              </div>

              {/* 10-Bin SVG Reliability Diagram */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                {/* SVG Visualizer */}
                <div className="lg:col-span-7 flex flex-col items-center">
                  <div className="w-full max-w-md aspect-[460/300] bg-slate-50 rounded-2xl border border-slate-200 p-2 shadow-inner">
                    <svg viewBox="0 0 460 300" className="w-full h-full select-none overflow-visible">
                      {/* Grid Lines */}
                      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
                        const y = 20 + (1 - v) * 240;
                        const x = 50 + v * 385;
                        return (
                          <g key={v}>
                            {/* Horizontal grid line */}
                            <line x1="50" y1={y} x2="435" y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                            <text x="44" y={y + 3} textAnchor="end" className="text-[9px] fill-slate-600 font-mono">
                              {(v * 100).toFixed(0)}%
                            </text>

                            {/* Vertical grid line */}
                            <line x1={x} y1="20" x2={x} y2="260" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                            <text x={x} y="275" textAnchor="middle" className="text-[9px] fill-slate-600 font-mono">
                              {(v * 100).toFixed(0)}%
                            </text>
                          </g>
                        );
                      })}

                      {/* Ideal Diagonal (y = x) */}
                      <line x1="50" y1="260" x2="435" y2="20" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />

                      {reliabilityDiagramPoints && (
                        <>
                          {/* Uncalibrated Polyline (Amber) */}
                          <polyline
                            points={reliabilityDiagramPoints.uncalPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2.5"
                          />

                          {/* Calibrated Polyline (Teal) */}
                          <polyline
                            points={reliabilityDiagramPoints.calPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#0d9488"
                            strokeWidth="2.5"
                          />

                          {/* Uncalibrated Circles */}
                          {reliabilityDiagramPoints.uncalPoints.map((p, idx) => (
                            <circle
                              key={`uncal-${idx}`}
                              cx={p.x}
                              cy={p.y}
                              r={hoveredBin?.bin_index === p.bin.bin_index ? 6 : 4}
                              fill="#f59e0b"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                              className="cursor-pointer transition-all"
                              tabIndex={0}
                              role="img"
                              aria-label={`Uncalibrated bin ${p.bin.bin_index + 1}, ${p.bin.sample_count} samples`}
                              onFocus={() => setHoveredBin(p.bin)}
                              onBlur={() => setHoveredBin(null)}
                              onMouseEnter={() => setHoveredBin(p.bin)}
                              onMouseLeave={() => setHoveredBin(null)}
                            />
                          ))}

                          {/* Calibrated Circles */}
                          {reliabilityDiagramPoints.calPoints.map((p, idx) => (
                            <circle
                              key={`cal-${idx}`}
                              cx={p.x}
                              cy={p.y}
                              r={hoveredBin?.bin_index === p.bin.bin_index ? 6 : 4}
                              fill="#0d9488"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                              className="cursor-pointer transition-all"
                              tabIndex={0}
                              role="img"
                              aria-label={`Calibrated bin ${p.bin.bin_index + 1}, ${p.bin.sample_count} samples`}
                              onFocus={() => setHoveredBin(p.bin)}
                              onBlur={() => setHoveredBin(null)}
                              onMouseEnter={() => setHoveredBin(p.bin)}
                              onMouseLeave={() => setHoveredBin(null)}
                            />
                          ))}
                        </>
                      )}

                      {/* Axis Titles */}
                      <text x="242" y="295" textAnchor="middle" className="text-xs fill-slate-600 font-sans font-semibold">
                        Mean predicted confidence
                      </text>
                      <text x="16" y="140" textAnchor="middle" transform="rotate(-90 16 140)" className="text-xs fill-slate-600 font-sans font-semibold">
                        Observed accuracy
                      </text>
                    </svg>
                  </div>

                  {/* Diagram Legend */}
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-slate-400 border-b border-dashed border-slate-400 inline-block" />
                      Ideal Calibration (y = x)
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      Uncalibrated (ECE: {(calibrationData.uncalibrated_ece * 100).toFixed(2)}%)
                    </span>
                    <span className="flex items-center gap-1.5 text-teal-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
                      Calibrated T={calibrationData.optimal_temperature.toFixed(4)} (ECE: {(calibrationData.calibrated_ece * 100).toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* Bin Inspector Panel */}
                <div className="lg:col-span-5 space-y-3">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity size={14} className="text-teal-600" />
                    Interactive Bin Inspector
                  </h3>

                  {hoveredBin ? (
                    <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3 animate-in fade-in text-xs">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-mono text-teal-300 font-bold">
                          Bin #{hoveredBin.bin_index + 1} [{hoveredBin.bin_lower.toFixed(2)} &ndash; {hoveredBin.bin_upper.toFixed(2)}]
                        </span>
                        <span className="font-mono text-slate-300">
                          {hoveredBin.sample_count.toLocaleString()} samples
                        </span>
                      </div>

                      <dl className="space-y-2">
                        <dt>Mean predicted confidence</dt>
                        <dd>{(hoveredBin.mean_confidence * 100).toFixed(1)}%</dd>
                        <dt>Observed accuracy</dt>
                        <dd>{(hoveredBin.empirical_accuracy * 100).toFixed(1)}%</dd>
                      </dl>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-2">
                      <p className="font-medium text-slate-700">
                        Focus or point to a curve marker to inspect its bin.
                      </p>
                      <p className="text-xs text-slate-600">
                        Points closer to the diagonal indicate closer agreement between confidence and observed accuracy for that bin.
                      </p>
                    </div>
                  )}

                  <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-200/80 text-xs text-teal-900 space-y-1">
                    <span className="font-bold block">Academic Integrity Protocol:</span>
                    <span>
                      {calibrationData.evaluation_dataset}. Calibration uses the validation split. Held-out test benchmarks appear separately below.
                    </span>
                  </div>
                </div>
              </div>
              </>}
            </div>

            {/* ─── 5. FINAL HELD-OUT TEST BENCHMARK WITH COMPARATIVE BARS ──── */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Award size={16} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Final Held-Out Test Benchmark: TF-IDF vs. PyTorch Bi-LSTM
                    </h2>
                    <p className="text-xs text-slate-500">
                      Published results from the held-out CFPB test split. These values describe the evaluated checkpoints.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    Frozen evaluation artifacts: baseline_eval_test.json and bilstm_eval_test.json · 12,727 test examples
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                    Active: Baseline TF-IDF (0.7488 Test Macro-F1)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    Challenger: Bi-LSTM (0.7034 Test Macro-F1)
                  </span>
                </div>
              </div>

              {/* Aggregate Metric Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="text-xs text-slate-500 font-semibold mb-1">
                    Macro-Averaged F1 (Test)
                  </div>
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-base font-semibold text-teal-800">
                      0.7488 <span className="text-xs font-normal text-slate-500">(TF-IDF)</span>
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      0.7034 <span className="text-xs font-normal">(Bi-LSTM)</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 font-semibold">
                    +0.0453 Baseline Advantage
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="text-xs text-slate-500 font-semibold mb-1">
                    Overall Accuracy (Test)
                  </div>
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-base font-semibold text-teal-800">
                      84.10% <span className="text-xs font-normal text-slate-500">(TF-IDF)</span>
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      81.24% <span className="text-xs font-normal">(Bi-LSTM)</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 font-semibold">
                    +2.86% Baseline Advantage
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="text-xs text-slate-500 font-semibold mb-1">
                    Weighted-Averaged F1 (Test)
                  </div>
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-base font-semibold text-teal-800">
                      0.8481 <span className="text-xs font-normal text-slate-500">(TF-IDF)</span>
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      0.8232 <span className="text-xs font-normal">(Bi-LSTM)</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 font-semibold">
                    +0.0249 Baseline Advantage
                  </div>
                </div>
              </div>

              {/* Grouped Visual Horizontal Bar Comparison for Held-Out Test */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Class-Level F1 Comparative Performance</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-teal-600 inline-block" /> Baseline TF-IDF</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-slate-400 inline-block" /> Bi-LSTM Challenger</span>
                  </div>
                </div>

                {TEST_BENCHMARKS.map((bench) => {
                  const baseW = Math.round(bench.baselineF1 * 100);
                  const bilstmW = Math.round(bench.bilstmF1 * 100);

                  return (
                    <div key={bench.category} className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/60 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 truncate max-w-sm">{bench.category}</span>
                        <span className="text-xs text-emerald-700 font-mono font-bold">
                          +{bench.delta.toFixed(4)} F1 Advantage (n={bench.support.toLocaleString()})
                        </span>
                      </div>

                      <div className="space-y-1">
                        {/* Baseline Bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500 w-16">TF-IDF</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div style={{ width: `${baseW}%` }} className="h-full bg-teal-600 rounded-full" />
                          </div>
                          <span className="text-xs font-mono font-bold text-teal-800 w-12 text-right">
                            {bench.baselineF1.toFixed(4)}
                          </span>
                        </div>

                        {/* Bi-LSTM Bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500 w-16">Bi-LSTM</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div style={{ width: `${bilstmW}%` }} className="h-full bg-slate-400 rounded-full" />
                          </div>
                          <span className="text-xs font-mono text-slate-600 w-12 text-right">
                            {bench.bilstmF1.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Narrative Word Length Buckets Table */}
              <div className="pt-2">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Test Accuracy by Complaint Narrative Length
                </div>
                <div className="overflow-x-auto" role="region" aria-label="Narrative length bucket comparison" tabIndex={0}>
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                        <th className="py-2 px-3 font-bold">Word Length Bucket</th>
                        <th className="py-2 px-3 font-bold text-right">Support (n)</th>
                        <th className="py-2 px-3 font-bold text-right">Share (%)</th>
                        <th className="py-2 px-3 font-bold text-center">Baseline Accuracy</th>
                        <th className="py-2 px-3 font-bold text-center">Bi-LSTM Accuracy</th>
                        <th className="py-2 px-3 font-bold text-center">Δ Advantage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-xs">
                      {TEST_LENGTH_BUCKETS.map((bucket) => (
                        <tr key={bucket.bucket} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-sans font-semibold text-slate-800">
                            {bucket.bucket}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500">
                            {bucket.support.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500">
                            {bucket.share}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-teal-800">
                            {(bucket.baselineAcc * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-center text-slate-600">
                            {(bucket.bilstmAcc * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-center text-emerald-700 font-bold">
                            {bucket.delta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ─── 6. VERIFIED OFFLINE VALIDATION BENCHMARK ─────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <Cpu size={16} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Validation benchmark: TF-IDF vs. PyTorch Bi-LSTM
                    </h2>
                    <p className="text-xs text-slate-500">
                      Evaluated on 12,726 deduplicated CFPB validation complaints &bull; Frozen validation benchmark.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                    Active: Baseline TF-IDF (0.7453 Macro-F1)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    Challenger: Bi-LSTM (0.7067 Macro-F1)
                  </span>
                </div>
              </div>

              {/* Aggregate Metric Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="text-xs text-slate-500 font-semibold mb-1">
                    Macro-Averaged F1
                  </div>
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-base font-semibold text-teal-800">
                      0.7453 <span className="text-xs font-normal text-slate-500">(TF-IDF)</span>
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      0.7067 <span className="text-xs font-normal">(Bi-LSTM)</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 font-semibold">
                    +0.0386 Baseline Advantage
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="text-xs text-slate-500 font-semibold mb-1">
                    Overall Accuracy
                  </div>
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-base font-semibold text-teal-800">
                      83.80% <span className="text-xs font-normal text-slate-500">(TF-IDF)</span>
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      81.24% <span className="text-xs font-normal">(Bi-LSTM)</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 font-semibold">
                    +2.56% Baseline Advantage
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="text-xs text-slate-500 font-semibold mb-1">
                    Weighted-Averaged F1
                  </div>
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-base font-semibold text-teal-800">
                      0.8455 <span className="text-xs font-normal text-slate-500">(TF-IDF)</span>
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      0.8230 <span className="text-xs font-normal">(Bi-LSTM)</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 font-semibold">
                    +0.0225 Baseline Advantage
                  </div>
                </div>
              </div>

              {/* Per-Class Table */}
              <div className="overflow-x-auto" role="region" aria-label="Per-category model comparison" tabIndex={0}>
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="py-2 px-3 font-bold">Category</th>
                      <th className="py-2 px-3 font-bold text-center">Baseline F1</th>
                      <th className="py-2 px-3 font-bold text-center">Bi-LSTM F1</th>
                      <th className="py-2 px-3 font-bold text-center">Δ F1</th>
                      <th className="py-2 px-3 font-bold text-right">Support (n)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-xs">
                    {VALIDATION_BENCHMARKS.map((bench) => (
                      <tr key={bench.category} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-sans font-medium text-slate-800">
                          {bench.category}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-teal-800">
                          {bench.baselineF1.toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-600">
                          {bench.bilstmF1.toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-center text-emerald-700 font-bold">
                          {bench.delta < 0 ? `+${Math.abs(bench.delta).toFixed(4)}` : bench.delta.toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">
                          {bench.support.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ─── 7. ACTIVE LEARNING & RETRAINING FLYWHEEL ────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Database size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Reviewed case export
                    </h2>
                    <p className="text-xs text-slate-500">
                      Download approved and overridden cases with masked narratives and a server-reported digest.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Reviewer export
                  </span>
                </div>
              </div>

              {manifestError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                  <span>{manifestError}</span>
                </div>
              )}

              {/* Manifest Stats & Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Eligible Curated Records
                  </span>
                  <p className="text-2xl font-semibold text-slate-900 font-mono mt-1">
                    {manifestData?.recordCount ?? '—'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Adjudicated complaints (Approved or Overridden)
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider block">
                    Reviewer overrides
                  </span>
                  <p className="text-2xl font-semibold text-amber-700 font-mono mt-1">
                    {manifestData?.overrideCount ?? '—'}
                  </p>
                  <p className="text-xs text-amber-700 font-medium mt-1">
                    Includes changes to category or priority
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                    Reviewer approvals
                  </span>
                  <p className="text-2xl font-semibold text-emerald-700 font-mono mt-1">
                    {manifestData?.approvalCount ?? '—'}
                  </p>
                  <p className="text-xs text-emerald-700 font-medium mt-1">
                    Human-validated baseline predictions
                  </p>
                </div>
              </div>

              {/* Filter and Security Manifest Card */}
              <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyOverrides}
                      onChange={(e) => setOnlyOverrides(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Filter to overrides only
                    </span>
                  </label>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                    <ShieldCheck size={14} className="text-emerald-600" />
                    <span>Pattern-based masking</span>
                  </div>
                </div>

                {/* Cryptographic Manifest Details */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 text-xs font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-slate-600">SHA-256 Manifest:</span>
                      <span className="font-bold text-slate-800 truncate max-w-md" title={manifestData?.sha256Digest}>
                        {manifestData?.sha256Digest || (manifestLoading ? 'Loading…' : 'Unavailable')}
                      </span>
                    </div>

                    {manifestData?.sha256Digest && (
                      <button
                        onClick={() => copyToClipboard(manifestData.sha256Digest)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition-colors"
                      >
                        {copiedSha ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        <span>{copiedSha ? 'Copied' : 'Copy Hash'}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-600">Timestamp: </span>
                      <span>{manifestData ? new Date(manifestData.exportedAt).toLocaleTimeString() : '...'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Sign-Off Actor: </span>
                      <span className="text-teal-700 font-bold">{manifestData?.exportedBy || 'Unavailable'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Included records: </span>
                      <span className="text-emerald-700 font-bold">Approved and overridden cases</span>
                    </div>
                  </div>
                </div>

                {/* Export Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-slate-500 max-w-lg">
                    Exports stream directly with cryptographic validation headers (<code className="bg-slate-200/60 px-1 py-0.5 rounded text-slate-700">X-Export-SHA256</code>) and regex PII masking.
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => handleExportDownload('jsonl')}
                      disabled={exportLoading || !manifestData || manifestData.recordCount === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors"
                    >
                      <Download size={14} />
                      <span>{exportLoading ? 'Streaming...' : 'Export Curated JSONL'}</span>
                    </button>

                    <button
                      onClick={() => handleExportDownload('csv')}
                      disabled={exportLoading || !manifestData || manifestData.recordCount === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors"
                    >
                      <FileText size={14} />
                      <span>{exportLoading ? 'Streaming...' : 'Export Curated CSV'}</span>
                    </button>
                  </div>
                </div>

                {exportError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{exportError}</p>}
                {/* Export Success Banner */}
                {exportSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between gap-2 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                      <span>
                        Downloaded {exportSuccess.format}{exportSuccess.recordCount !== null && <> · {exportSuccess.recordCount} records</>}. Reported digest: <code className="break-all font-mono">{exportSuccess.sha256}</code>
                      </span>
                    </div>
                    <button
                      onClick={() => setExportSuccess(null)}
                      className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </ReviewerLayout>
  );
};
