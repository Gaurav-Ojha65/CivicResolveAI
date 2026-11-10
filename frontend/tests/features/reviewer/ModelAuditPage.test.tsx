import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelAuditPage } from '../../../src/features/reviewer/ModelAuditPage';
import * as endpoints from '../../../src/lib/api/endpoints';
import {
  ModelAuditResponse,
  CalibrationMetricsResponse,
  ActiveLearningManifestResponse,
} from '../../../src/types/grievance';

import * as AuthProviderModule from '../../../src/app/providers/AuthProvider';

vi.mock('../../../src/lib/api/endpoints', () => ({
  getModelAudit: vi.fn(),
  getCalibrationMetrics: vi.fn(),
  getActiveLearningManifest: vi.fn(),
}));

describe('ModelAuditPage', () => {
  const sampleAuditData: ModelAuditResponse = {
    totalAdjudicated: 120,
    reviewerAgreementRate: 0.85,
    categoryOverrideDistribution: {
      'Debt collection': 10,
      'Credit card': 5,
      'Checking or savings account': 3,
    },
    triggerBreakdown: {
      LOW_CONFIDENCE: 45,
      SMALL_MARGIN: 30,
      CRITICAL_PRIORITY_POLICY: 15,
      AUTO_ROUTED: 30,
    },
    confusionMatrix: {
      Mortgage: {
        Mortgage: 25,
        'Debt collection': 2,
      },
      'Debt collection': {
        'Debt collection': 40,
        'Credit card': 5,
      },
    },
  };

  const sampleCalibrationData: CalibrationMetricsResponse = {
    evaluation_dataset: 'CFPB val.csv 50/50 Stratified Split',
    evaluation_date_utc: '2026-11-09T18:40:00Z',
    total_validation_rows: 12726,
    calibration_fit_rows: 6363,
    calibration_eval_rows: 6363,
    optimal_temperature: 0.7866,
    uncalibrated_ece: 0.0609,
    calibrated_ece: 0.0306,
    ece_reduction_percent: 49.8,
    uncalibrated_mce: 0.1287,
    calibrated_mce: 0.0542,
    uncalibrated_brier: 0.259,
    calibrated_brier: 0.2512,
    brier_reduction_percent: 3.01,
    uncalibrated_bins: [
      {
        bin_index: 0,
        bin_lower: 0.0,
        bin_upper: 0.1,
        bin_center: 0.05,
        sample_count: 50,
        empirical_accuracy: 0.08,
        mean_confidence: 0.06,
      },
      {
        bin_index: 9,
        bin_lower: 0.9,
        bin_upper: 1.0,
        bin_center: 0.95,
        sample_count: 2400,
        empirical_accuracy: 0.96,
        mean_confidence: 0.97,
      },
    ],
    calibrated_bins: [
      {
        bin_index: 0,
        bin_lower: 0.0,
        bin_upper: 0.1,
        bin_center: 0.05,
        sample_count: 50,
        empirical_accuracy: 0.08,
        mean_confidence: 0.07,
      },
      {
        bin_index: 9,
        bin_lower: 0.9,
        bin_upper: 1.0,
        bin_center: 0.95,
        sample_count: 2400,
        empirical_accuracy: 0.96,
        mean_confidence: 0.962,
      },
    ],
    disclaimer:
      'Calibration evaluated strictly on validation split. Held-out test set sealed.',
  };

  const sampleManifestData: ActiveLearningManifestResponse = {
    recordCount: 42,
    overrideCount: 12,
    approvalCount: 30,
    sha256Digest:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    exportedAt: '2026-11-09T20:00:00Z',
    exportedBy: 'reviewer',
    sampleRecords: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: { username: 'reviewer', role: 'ROLE_REVIEWER', isAuthenticated: true },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(endpoints.getCalibrationMetrics).mockResolvedValue(sampleCalibrationData);
    vi.mocked(endpoints.getActiveLearningManifest).mockResolvedValue(sampleManifestData);
  });

  it('renders loading state initially then displays audit KPIs upon fetch resolution', async () => {
    vi.mocked(endpoints.getModelAudit).mockResolvedValueOnce(sampleAuditData);

    render(
      <MemoryRouter>
        <ModelAuditPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/AI Audit & Model Benchmark Center/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByText('120')).toBeInTheDocument(); // total adjudicated
    expect(screen.getByText('85.0%')).toBeInTheDocument(); // agreement rate
    expect(screen.getByText('18')).toBeInTheDocument(); // overridden
    expect(screen.getByText('Safety Flag Triggers')).toBeInTheDocument();
  });

  it('renders verified validation benchmarks table with authentic metrics', async () => {
    vi.mocked(endpoints.getModelAudit).mockResolvedValueOnce(sampleAuditData);

    render(
      <MemoryRouter>
        <ModelAuditPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Verified Validation Benchmark: TF-IDF vs. PyTorch Bi-LSTM/i)
      ).toBeInTheDocument();
    });

    // Check authentic validation metrics from model_comparison_val.md
    expect(screen.getAllByText('0.7453').length).toBeGreaterThan(0); // Baseline Macro F1
    expect(screen.getAllByText('0.7067').length).toBeGreaterThan(0); // Bi-LSTM Macro F1
    expect(screen.getAllByText('83.80%').length).toBeGreaterThan(0); // Baseline Accuracy
    expect(screen.getAllByText('81.24%').length).toBeGreaterThan(0); // Bi-LSTM Accuracy
    expect(screen.getByText(/12,726 deduplicated CFPB validation complaints/i)).toBeInTheDocument();
  });

  it('renders 8x8 confusion matrix and triage triggers', async () => {
    vi.mocked(endpoints.getModelAudit).mockResolvedValueOnce(sampleAuditData);

    render(
      <MemoryRouter>
        <ModelAuditPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/8×8 Model Prediction vs Human Adjudication Matrix/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Review Trigger Distribution/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Low Confidence \(<55%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Narrow Margin \(<15%\)/i)).toBeInTheDocument();
  });

  it('renders Probability Calibration Inspector with optimal temperature and reliability diagram', async () => {
    vi.mocked(endpoints.getModelAudit).mockResolvedValueOnce(sampleAuditData);

    render(
      <MemoryRouter>
        <ModelAuditPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Probability Calibration Inspector & Reliability Diagram/i)
      ).toBeInTheDocument();
    });

    expect(screen.getAllByText(/0.7866/).length).toBeGreaterThan(0); // optimal temperature
    expect(screen.getAllByText(/3.06%/).length).toBeGreaterThan(0); // calibrated ECE
    expect(screen.getAllByText(/6.09%/).length).toBeGreaterThan(0); // uncalibrated ECE
    expect(screen.getByText(/0.2512/)).toBeInTheDocument(); // calibrated Brier
  });

  it('renders Active Learning Flywheel with cryptographic manifest and export buttons', async () => {
    vi.mocked(endpoints.getModelAudit).mockResolvedValueOnce(sampleAuditData);

    render(
      <MemoryRouter>
        <ModelAuditPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Active Learning & Distillation Flywheel/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByText('42')).toBeInTheDocument(); // record count
    expect(screen.getByText('12')).toBeInTheDocument(); // override count
    expect(screen.getAllByText('30').length).toBeGreaterThan(0); // approval count
    expect(screen.getByText(/Export Curated JSONL/i)).toBeInTheDocument();
    expect(screen.getByText(/Export Curated CSV/i)).toBeInTheDocument();
  });

  it('renders error state when API call fails', async () => {
    vi.mocked(endpoints.getModelAudit).mockRejectedValue(
      new Error('Failed to load audit statistics')
    );

    render(
      <MemoryRouter>
        <ModelAuditPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to Load Audit Analytics/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Failed to load audit statistics/i)
      ).toBeInTheDocument();
    });
  });
});
