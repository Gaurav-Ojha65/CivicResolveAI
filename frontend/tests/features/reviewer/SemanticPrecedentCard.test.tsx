import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticPrecedentCard } from '../../../src/features/reviewer/components/SemanticPrecedentCard';
import * as endpoints from '../../../src/lib/api/endpoints';
import { SemanticPrecedentResponse } from '../../../src/types/grievance';

vi.mock('../../../src/lib/api/endpoints', () => ({
  getPrecedents: vi.fn(),
}));

describe('SemanticPrecedentCard', () => {
  const samplePrecedentResponse: SemanticPrecedentResponse = {
    queryGrievanceId: '123e4567-e89b-12d3-a456-426614174000',
    candidatesEvaluated: 15,
    precedents: [
      {
        grievanceId: '223e4567-e89b-12d3-a456-426614174001',
        similarityScore: 0.8421,
        similarityMetric: 'Lexical TF-IDF Cosine Similarity',
        predictedCategory: 'Debt collection',
        assignedCategory: 'Debt collection',
        status: 'APPROVED',
        sanitizedSnippet: 'Collector calls repeatedly during work hours without consent...',
        adjudicatedAt: '2026-11-08T14:30:00Z',
      },
      {
        grievanceId: '333e4567-e89b-12d3-a456-426614174002',
        similarityScore: 0.6512,
        similarityMetric: 'Lexical TF-IDF Cosine Similarity',
        predictedCategory: 'Credit card',
        assignedCategory: 'Debt collection',
        status: 'OVERRIDDEN',
        sanitizedSnippet: 'Unauthorized credit charges forwarded to third-party agency...',
        adjudicatedAt: '2026-11-07T11:00:00Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially and then displays top precedents', async () => {
    vi.mocked(endpoints.getPrecedents).mockResolvedValueOnce(samplePrecedentResponse);

    render(<SemanticPrecedentCard grievanceId="123e4567-e89b-12d3-a456-426614174000" />);

    await waitFor(() => {
      expect(screen.getByText(/84.2% Similarity/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/65.1% Similarity/i)).toBeInTheDocument();
    expect(screen.getByText(/Pool: 15 cases/i)).toBeInTheDocument();
  });

  it('renders fallback notice when no precedents are returned', async () => {
    vi.mocked(endpoints.getPrecedents).mockResolvedValueOnce({
      queryGrievanceId: '123e4567-e89b-12d3-a456-426614174000',
      candidatesEvaluated: 0,
      precedents: [],
    });

    render(<SemanticPrecedentCard grievanceId="123e4567-e89b-12d3-a456-426614174000" />);

    await waitFor(() => {
      expect(
        screen.getByText(/No finalized human-adjudicated precedents available yet in the pool/i)
      ).toBeInTheDocument();
    });
  });
});
