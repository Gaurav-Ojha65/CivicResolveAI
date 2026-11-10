import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DualModelArenaCard } from '../../../src/features/reviewer/components/DualModelArenaCard';
import * as endpoints from '../../../src/lib/api/endpoints';
import { DualModelComparisonResponse } from '../../../src/types/grievance';

vi.mock('../../../src/lib/api/endpoints', () => ({
  compareModels: vi.fn(),
}));

describe('DualModelArenaCard', () => {
  const sampleComparison: DualModelComparisonResponse = {
    baseline: {
      model_name: 'TF-IDF + Logistic Regression (Production Baseline)',
      model_type: 'linear_tfidf',
      model_version_sha256: 'mock-baseline-sha256',
      predicted_category: 'Debt collection',
      confidence: 0.88,
      margin: 0.72,
      probabilities: {
        'Debt collection': 0.88,
        'Credit card': 0.08,
        'Mortgage': 0.04,
      },
      latency_ms: 12.5,
      token_or_feature_count: 50000,
      truncated: false,
    },
    bilstm: {
      model_name: 'PyTorch Bi-LSTM (Benchmark Model)',
      model_type: 'neural_bilstm',
      model_version_sha256: 'mock-bilstm-sha256',
      predicted_category: 'Debt collection',
      confidence: 0.82,
      margin: 0.65,
      probabilities: {
        'Debt collection': 0.82,
        'Credit card': 0.12,
        'Mortgage': 0.06,
      },
      latency_ms: 68.2,
      token_or_feature_count: 24,
      truncated: false,
    },
    models_agree: true,
    confidence_delta: 0.06,
    disclaimer: 'Baseline remains the sole production authority.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial state with description and trigger button', () => {
    render(<DualModelArenaCard narrative="Debt collector keeps calling my office without permission." />);

    expect(screen.getByText(/Live Dual-Model Arena/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Run Arena Comparison/i })
    ).toBeInTheDocument();
  });

  it('executes comparison and renders agreement and probabilities upon button click', async () => {
    vi.mocked(endpoints.compareModels).mockResolvedValueOnce(sampleComparison);

    render(<DualModelArenaCard narrative="Debt collector keeps calling my office without permission." />);

    const runButton = screen.getByRole('button', { name: /Run Arena Comparison/i });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText(/Consensus: Both models agree on top category/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText('Debt collection').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TF-IDF \+ Logistic Regression/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PyTorch Bi-LSTM/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Baseline remains the sole production authority/i)).toBeInTheDocument();
  });
});
