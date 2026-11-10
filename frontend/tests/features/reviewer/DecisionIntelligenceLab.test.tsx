import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DecisionIntelligenceLab,
  SYNTHETIC_PRESETS,
} from '../../../src/features/reviewer/components/DecisionIntelligenceLab';
import { HistoricalDecisionPatternCard } from '../../../src/features/reviewer/components/HistoricalDecisionPatternCard';
import {
  DualModelComparisonResponse,
  PredictionSummary,
  SemanticPrecedentItem,
} from '../../../src/types/grievance';
import * as endpoints from '../../../src/lib/api/endpoints';

vi.mock('../../../src/lib/api/endpoints', () => ({
  compareModels: vi.fn(),
  getPrecedents: vi.fn(),
  reviewGrievance: vi.fn(),
}));

const MOCK_ORIGINAL_NARRATIVE =
  'I was erroneously charged an extra fee on my mortgage statement and customer service refused to refund it.';

const MOCK_ORIGINAL_PREDICTION: PredictionSummary = {
  predictedCategory: 'Mortgage',
  modelUsed: 'TF-IDF + Logistic Regression (balanced)',
  modelVersion: 'sha256_mock_v1',
  confidence: 0.88,
  margin: 0.45,
  probabilities: {
    Mortgage: 0.88,
    'Debt collection': 0.08,
    'Credit card': 0.04,
  },
  flagForReview: false,
  reviewReasons: [],
  triagePriority: 'MEDIUM',
  priorityReasons: ['General billing dispute'],
  sentimentScore: -0.4,
  sentimentLabel: 'NEGATIVE',
  predictedAt: '2026-11-01T10:00:00Z',
};

const MOCK_DUAL_COMPARISON: DualModelComparisonResponse = {
  baseline: {
    model_name: 'TF-IDF + Logistic Regression (balanced)',
    model_type: 'linear_tfidf',
    model_version_sha256: 'sha256_mock_v1',
    predicted_category: 'Debt collection',
    confidence: 0.76,
    margin: 0.28,
    probabilities: {
      'Debt collection': 0.76,
      Mortgage: 0.15,
      'Credit card': 0.09,
    },
    latency_ms: 18.4,
    token_or_feature_count: 42,
    truncated: false,
  },
  bilstm: {
    model_name: 'PyTorch Bi-LSTM (Word2Vec Embeddings)',
    model_type: 'bilstm_neural',
    model_version_sha256: 'sha256_bilstm_v1',
    predicted_category: 'Debt collection',
    confidence: 0.72,
    margin: 0.22,
    probabilities: {
      'Debt collection': 0.72,
      Mortgage: 0.18,
      'Credit card': 0.1,
    },
    latency_ms: 24.1,
    token_or_feature_count: 38,
    truncated: false,
  },
  models_agree: true,
  confidence_delta: -0.04,
  disclaimer: 'Uncalibrated model probability estimates. Stateless simulation.',
};

describe('DecisionIntelligenceLab Component', () => {
  const onAppendReviewNoteMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial editor with original narrative and delta indicators', () => {
    render(
      <DecisionIntelligenceLab
        originalNarrative={MOCK_ORIGINAL_NARRATIVE}
        originalPrediction={MOCK_ORIGINAL_PREDICTION}
        grievanceId="test-grievance-id"
        onAppendReviewNote={onAppendReviewNoteMock}
      />
    );

    expect(screen.getByText(/CivicResolve Decision Intelligence Lab/i)).toBeInTheDocument();
    expect(screen.getByText(/Zone B — Counterfactual Narrative Editor/i)).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/Enter counterfactual narrative to test sensitivity/i);
    expect(textarea).toHaveValue(MOCK_ORIGINAL_NARRATIVE);
  });

  it('clicking each synthetic preset only updates the Zone B textarea without calling submission APIs or showing hardcoded predictions', async () => {
    render(
      <DecisionIntelligenceLab
        originalNarrative={MOCK_ORIGINAL_NARRATIVE}
        originalPrediction={MOCK_ORIGINAL_PREDICTION}
        grievanceId="test-grievance-id"
        onAppendReviewNote={onAppendReviewNoteMock}
      />
    );

    const textarea = screen.getByPlaceholderText(/Enter counterfactual narrative to test sensitivity/i);

    for (const preset of SYNTHETIC_PRESETS) {
      const presetButton = screen.getByRole('button', { name: new RegExp(preset.title, 'i') });
      fireEvent.click(presetButton);

      // Verify textarea got updated with the exact preset text
      expect(textarea).toHaveValue(preset.text);

      // Verify no APIs were called
      expect(endpoints.compareModels).not.toHaveBeenCalled();
      expect(endpoints.reviewGrievance).not.toHaveBeenCalled();

      // Verify no hardcoded predictions are shown
      expect(screen.queryByText(/Zone C — Replay Telemetry/i)).not.toBeInTheDocument();
    }
  });

  it('resets narrative to original and clears simulation state when clicking Reset to Original', async () => {
    render(
      <DecisionIntelligenceLab
        originalNarrative={MOCK_ORIGINAL_NARRATIVE}
        originalPrediction={MOCK_ORIGINAL_PREDICTION}
        grievanceId="test-grievance-id"
        onAppendReviewNote={onAppendReviewNoteMock}
      />
    );

    const textarea = screen.getByPlaceholderText(/Enter counterfactual narrative to test sensitivity/i);

    // Apply a preset
    fireEvent.click(screen.getByRole('button', { name: /Critical Mortgage Foreclosure/i }));
    expect(textarea).not.toHaveValue(MOCK_ORIGINAL_NARRATIVE);

    // Click Reset
    const resetButton = screen.getByRole('button', { name: /Reset to Original/i });
    fireEvent.click(resetButton);

    expect(textarea).toHaveValue(MOCK_ORIGINAL_NARRATIVE);
    expect(screen.queryByText(/Zone C — Replay Telemetry/i)).not.toBeInTheDocument();
  });

  it('runs replay via compareModels and displays Dual-Model Arena telemetry with exact labeling', async () => {
    vi.mocked(endpoints.compareModels).mockResolvedValueOnce(MOCK_DUAL_COMPARISON);

    render(
      <DecisionIntelligenceLab
        originalNarrative={MOCK_ORIGINAL_NARRATIVE}
        originalPrediction={MOCK_ORIGINAL_PREDICTION}
        grievanceId="test-grievance-id"
        onAppendReviewNote={onAppendReviewNoteMock}
      />
    );

    const replayButton = screen.getByRole('button', { name: /Compare Models & Run Replay/i });
    fireEvent.click(replayButton);

    await waitFor(() => {
      expect(endpoints.compareModels).toHaveBeenCalledTimes(1);
    });

    // Check Agreement banner
    expect(await screen.findByText(/Model Agreement:/i)).toBeInTheDocument();

    // Check exact labeling constraints
    expect(screen.getByText(/Active TF-IDF N-Gram Features \(of 50,000\):/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Non-Padding Sequence Tokens \(max_len=200\/250, truncated: true\/false\):/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Top-2 Probability Margin \(P₁ - P₂\):/i).length).toBeGreaterThan(0);

    // Check provenance badge
    expect(screen.getByText(/PROVENANCE VERIFIED: Active Production Checkpoint/i)).toBeInTheDocument();

    // Check category flip indicator
    expect(screen.getAllByText(/Mortgage/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Debt collection/i).length).toBeGreaterThan(0);

    // Check disclosure
    expect(
      screen.getByText(/Uncalibrated model probability estimates. Stateless simulation—never written to PostgreSQL./i)
    ).toBeInTheDocument();
  });

  it('clicking "Copy Replay Summary to Review Note" only appends text to note callback and never triggers review API', async () => {
    vi.mocked(endpoints.compareModels).mockResolvedValueOnce(MOCK_DUAL_COMPARISON);

    render(
      <DecisionIntelligenceLab
        originalNarrative={MOCK_ORIGINAL_NARRATIVE}
        originalPrediction={MOCK_ORIGINAL_PREDICTION}
        grievanceId="test-grievance-id"
        onAppendReviewNote={onAppendReviewNoteMock}
      />
    );

    // Run replay first
    fireEvent.click(screen.getByRole('button', { name: /Compare Models & Run Replay/i }));

    await waitFor(() => {
      expect(screen.getByText(/Copy Replay Summary to Review Note/i)).toBeInTheDocument();
    });

    const copyButton = screen.getByRole('button', { name: /Copy Replay Summary to Review Note/i });
    fireEvent.click(copyButton);

    expect(onAppendReviewNoteMock).toHaveBeenCalledTimes(1);
    expect(onAppendReviewNoteMock).toHaveBeenCalledWith(
      expect.stringContaining('[Counterfactual Replay Summary]')
    );
    expect(onAppendReviewNoteMock).toHaveBeenCalledWith(
      expect.stringContaining('Baseline Model (linear_tfidf): "Debt collection"')
    );

    // Verify review submission endpoint was never touched
    expect(endpoints.reviewGrievance).not.toHaveBeenCalled();
  });
});

describe('HistoricalDecisionPatternCard Component', () => {
  it('accurately counts priority-only overrides (OVERRIDDEN where predictedCategory === assignedCategory) as category agreement', () => {
    const mockPrecedents: SemanticPrecedentItem[] = [
      {
        grievanceId: 'uuid-1',
        similarityScore: 0.78,
        similarityMetric: 'Lexical TF-IDF Cosine Similarity',
        predictedCategory: 'Mortgage',
        assignedCategory: 'Mortgage',
        status: 'APPROVED',
        sanitizedSnippet: 'Escrow dispute snippet',
        adjudicatedAt: '2026-11-01T12:00:00Z',
      },
      {
        grievanceId: 'uuid-2',
        similarityScore: 0.65,
        similarityMetric: 'Lexical TF-IDF Cosine Similarity',
        predictedCategory: 'Mortgage',
        assignedCategory: 'Mortgage',
        status: 'OVERRIDDEN', // Priority-only override! Kept category!
        sanitizedSnippet: 'Loan modification snippet',
        adjudicatedAt: '2026-11-02T12:00:00Z',
      },
      {
        grievanceId: 'uuid-3',
        similarityScore: 0.52,
        similarityMetric: 'Lexical TF-IDF Cosine Similarity',
        predictedCategory: 'Mortgage',
        assignedCategory: 'Debt collection', // Full category override
        status: 'OVERRIDDEN',
        sanitizedSnippet: 'Foreclosure debt collection snippet',
        adjudicatedAt: '2026-11-03T12:00:00Z',
      },
    ];

    render(
      <HistoricalDecisionPatternCard precedents={mockPrecedents} totalCandidates={25} />
    );

    // 2 out of 3 matched category recommendation => 67%
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 cases matched AI category recommendation/i)).toBeInTheDocument();

    // Check workflow counts: APP: 1, OVR: 2
    expect(screen.getByText(/APP: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/OVR: 2/i)).toBeInTheDocument();

    // Check Priority-Only Override notice
    expect(
      screen.getByText(/1 case\(s\) maintained AI category and adjusted priority only./i)
    ).toBeInTheDocument();

    // Evidence sufficiency check: sample >= 2 and maxSim >= 0.25 => no warning
    expect(screen.queryByText(/Evidence Sufficiency Warning/i)).not.toBeInTheDocument();
  });

  it('renders Evidence Sufficiency Warning when sample size < 2 or similarity < 0.25', () => {
    const lowPrecedent: SemanticPrecedentItem[] = [
      {
        grievanceId: 'uuid-low',
        similarityScore: 0.18, // < 0.25
        similarityMetric: 'Lexical TF-IDF Cosine Similarity',
        predictedCategory: 'Credit card',
        assignedCategory: 'Credit card',
        status: 'APPROVED',
        sanitizedSnippet: 'Vague card inquiry snippet',
        adjudicatedAt: '2026-11-01T12:00:00Z',
      },
    ];

    render(
      <HistoricalDecisionPatternCard precedents={lowPrecedent} totalCandidates={1} />
    );

    expect(screen.getByText(/Evidence Sufficiency Warning/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Insufficient historical precedent evidence \(small sample size or lexical similarity < 0.25\)/i)
    ).toBeInTheDocument();
  });
});
