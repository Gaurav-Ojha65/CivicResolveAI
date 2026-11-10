import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatIfSandboxDrawer } from '../../../src/features/reviewer/components/WhatIfSandboxDrawer';
import * as endpoints from '../../../src/lib/api/endpoints';
import { PredictionSummary } from '../../../src/types/grievance';

vi.mock('../../../src/lib/api/endpoints', () => ({
  previewClassify: vi.fn(),
}));

describe('WhatIfSandboxDrawer', () => {
  const originalNarrative = 'My mortgage payments were wrongly credited to another account.';
  const originalPrediction: PredictionSummary = {
    predictedCategory: 'Mortgage',
    modelUsed: 'tfidf_logistic_regression',
    modelVersion: 'v1.0.0',
    confidence: 0.88,
    margin: 0.75,
    probabilities: { Mortgage: 0.88, 'Debt collection': 0.13 },
    flagForReview: false,
    reviewReasons: [],
    triagePriority: 'MEDIUM',
    priorityReasons: [],
    sentimentScore: -0.3,
    sentimentLabel: 'NEGATIVE',
    predictedAt: '2026-11-01T12:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <WhatIfSandboxDrawer
        isOpen={false}
        onClose={vi.fn()}
        originalNarrative={originalNarrative}
        originalPrediction={originalPrediction}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders drawer header, original narrative, and action buttons when open', () => {
    render(
      <WhatIfSandboxDrawer
        isOpen={true}
        onClose={vi.fn()}
        originalNarrative={originalNarrative}
        originalPrediction={originalPrediction}
      />
    );

    expect(
      screen.getByText(/Counterfactual.*What-If.*Sandbox/i)
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(originalNarrative)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run What-If Simulation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset to Original/i })).toBeInTheDocument();
  });

  it('validates minimum 20 characters before calling simulation', async () => {
    render(
      <WhatIfSandboxDrawer
        isOpen={true}
        onClose={vi.fn()}
        originalNarrative={originalNarrative}
        originalPrediction={originalPrediction}
      />
    );

    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Short text');

    const runButton = screen.getByRole('button', { name: /Run What-If Simulation/i });
    fireEvent.click(runButton);

    expect(
      screen.getByText(/Simulated narrative must contain at least 20 characters/i)
    ).toBeInTheDocument();
    expect(endpoints.previewClassify).not.toHaveBeenCalled();
  });

  it('calls previewClassify and renders simulated comparison results', async () => {
    const simulatedResult: PredictionSummary = {
      predictedCategory: 'Debt collection',
      modelUsed: 'tfidf_logistic_regression',
      modelVersion: 'v1.0.0',
      confidence: 0.72,
      margin: 0.40,
      probabilities: { 'Debt collection': 0.72, Mortgage: 0.20 },
      flagForReview: false,
      reviewReasons: [],
      triagePriority: 'HIGH',
      priorityReasons: [],
      sentimentScore: -0.6,
      sentimentLabel: 'NEGATIVE',
      predictedAt: '2026-11-01T12:05:00Z',
    };

    vi.mocked(endpoints.previewClassify).mockResolvedValueOnce(simulatedResult);

    render(
      <WhatIfSandboxDrawer
        isOpen={true}
        onClose={vi.fn()}
        originalNarrative={originalNarrative}
        originalPrediction={originalPrediction}
      />
    );

    const runButton = screen.getByRole('button', { name: /Run What-If Simulation/i });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(endpoints.previewClassify).toHaveBeenCalledWith({
        text: originalNarrative,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Simulation Delta Comparison/i)).toBeInTheDocument();
      expect(screen.getByText('Debt collection')).toBeInTheDocument();
      expect(screen.getByText(/Predicted Category Shift/i)).toBeInTheDocument();
    });
  });

  it('resets narrative when clicking Reset to Original', async () => {
    render(
      <WhatIfSandboxDrawer
        isOpen={true}
        onClose={vi.fn()}
        originalNarrative={originalNarrative}
        originalPrediction={originalPrediction}
      />
    );

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, ' Extra text added here for testing.');

    expect(textarea).toHaveValue(
      originalNarrative + ' Extra text added here for testing.'
    );

    const resetButton = screen.getByRole('button', { name: /Reset to Original/i });
    fireEvent.click(resetButton);

    expect(textarea).toHaveValue(originalNarrative);
  });
});
