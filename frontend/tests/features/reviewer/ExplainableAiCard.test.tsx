/**
 * ExplainableAiCard.test.tsx
 *
 * Tests for the Explainable AI card:
 *  - Prediction metrics, flags, priority reasons, and probability distribution.
 *  - Stage 4 explanation empty state.
 *  - Stage 4 feature attribution decomposition (linear contributions, decision scores, margin, SHA-256).
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ExplainableAiCard } from '../../../src/features/reviewer/components/ExplainableAiCard';
import type { PredictionSummary } from '../../../src/types/grievance';

const BASE_PREDICTION: PredictionSummary = {
  predictedCategory: 'Mortgage',
  modelUsed: 'tfidf_logistic',
  modelVersion: 'v1.0.0',
  confidence: 0.92,
  margin: 0.54,
  probabilities: {
    Mortgage: 0.92,
    'Debt collection': 0.05,
    'Credit card': 0.03,
  },
  flagForReview: true,
  reviewReasons: ['High financial threshold'],
  triagePriority: 'HIGH',
  priorityReasons: ['Escrow foreclosure risk'],
  sentimentScore: -0.72,
  sentimentLabel: 'NEGATIVE',
  predictedAt: '2026-11-01T10:00:00Z',
};

const PREDICTION_WITH_EXPLANATION: PredictionSummary = {
  ...BASE_PREDICTION,
  explanation: {
    predictedClass: 'Mortgage',
    predictedDecisionScore: 3.4512,
    predictedIntercept: 0.123,
    runnerUpClass: 'Debt collection',
    runnerUpDecisionScore: 1.2055,
    runnerUpIntercept: -0.456,
    decisionScoreMargin: 2.2457,
    topPositiveFeatures: [
      {
        feature: 'escrow',
        tfidfValue: 0.452,
        coefficient: 2.311,
        contribution: 1.0446,
      },
      {
        feature: 'foreclosure',
        tfidfValue: 0.388,
        coefficient: 1.844,
        contribution: 0.7155,
      },
    ],
    topNegativeFeatures: [
      {
        feature: 'cardholder',
        tfidfValue: 0.215,
        coefficient: -1.25,
        contribution: -0.2688,
      },
    ],
    topDifferenceFeatures: [
      {
        feature: 'escrow',
        tfidfValue: 0.452,
        coefficient: 1.95,
        contribution: 0.8814,
      },
    ],
    modelProvenanceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    explanationGeneratedAt: '2026-11-01T10:00:01Z',
  },
};

describe('ExplainableAiCard', () => {
  it('renders fallback notice when prediction is null', () => {
    render(<ExplainableAiCard prediction={null} />);
    expect(
      screen.getByText(/no automated prediction audit record is attached/i)
    ).toBeInTheDocument();
  });

  it('renders standard prediction metrics and Stage 4 placeholder when explanation is absent', () => {
    render(<ExplainableAiCard prediction={BASE_PREDICTION} />);

    expect(screen.getAllByText('Mortgage').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('92.0%')).toBeInTheDocument();
    expect(screen.getByText('54.0%')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('High financial threshold')).toBeInTheDocument();
    expect(screen.getByText('Escrow foreclosure risk')).toBeInTheDocument();
    expect(screen.getByText('NEGATIVE')).toBeInTheDocument();
    expect(screen.getByText(/explainable ai attribution \(ready for stage 4\)/i)).toBeInTheDocument();
  });

  it('renders linear feature decomposition when Stage 4 explanation is present', () => {
    render(<ExplainableAiCard prediction={PREDICTION_WITH_EXPLANATION} />);

    // Decision scores
    expect(screen.getByText('3.4512')).toBeInTheDocument();
    expect(screen.getByText('1.2055')).toBeInTheDocument();
    expect(screen.getByText('2.2457')).toBeInTheDocument();

    // Feature items
    expect(screen.getByText('escrow')).toBeInTheDocument();
    expect(screen.getByText('foreclosure')).toBeInTheDocument();
    expect(screen.getByText('cardholder')).toBeInTheDocument();
    expect(screen.getByText('+1.0446')).toBeInTheDocument();
    expect(screen.getByText('-0.2688')).toBeInTheDocument();

    // Provenance SHA
    expect(screen.getByText(/e3b0c44298fc1c14/i)).toBeInTheDocument();
  });

  it('renders linear feature decomposition when tfidfValue and coefficient are omitted without error and without displaying fake metrics', () => {
    const predictionWithoutTfidf: PredictionSummary = {
      ...BASE_PREDICTION,
      explanation: {
        predictedClass: 'Mortgage',
        predictedDecisionScore: 3.4512,
        predictedIntercept: 0.123,
        runnerUpClass: 'Debt collection',
        runnerUpDecisionScore: 1.2055,
        runnerUpIntercept: -0.456,
        decisionScoreMargin: 2.2457,
        topPositiveFeatures: [
          {
            feature: 'escrow',
            contribution: 1.0446,
          },
        ],
        topNegativeFeatures: [
          {
            feature: 'cardholder',
            contribution: -0.2688,
          },
        ],
        topDifferenceFeatures: [
          {
            feature: 'escrow',
            contribution: 0.8814,
          },
        ],
        modelProvenanceSha256: '7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0',
        explanationGeneratedAt: '2026-11-07T12:00:00Z',
      },
    };

    render(<ExplainableAiCard prediction={predictionWithoutTfidf} />);

    // Renders features and contributions cleanly
    expect(screen.getByText('escrow')).toBeInTheDocument();
    expect(screen.getByText('+1.0446')).toBeInTheDocument();
    expect(screen.getByText('cardholder')).toBeInTheDocument();
    expect(screen.getByText('-0.2688')).toBeInTheDocument();

    // Verifies no fabricated "tf-idf:" metrics are displayed
    expect(screen.queryByText(/tf-idf:/i)).not.toBeInTheDocument();
  });

  it('renders linear feature decomposition when tfidfValue and coefficient are null', () => {
    const predictionWithNullTfidf: PredictionSummary = {
      ...BASE_PREDICTION,
      explanation: {
        predictedClass: 'Mortgage',
        predictedDecisionScore: 3.4512,
        predictedIntercept: 0.123,
        runnerUpClass: 'Debt collection',
        runnerUpDecisionScore: 1.2055,
        runnerUpIntercept: -0.456,
        decisionScoreMargin: 2.2457,
        topPositiveFeatures: [
          {
            feature: 'escrow',
            tfidfValue: null,
            coefficient: null,
            contribution: 1.0446,
          },
        ],
        topNegativeFeatures: [],
        topDifferenceFeatures: [],
        modelProvenanceSha256: '7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0',
        explanationGeneratedAt: '2026-11-07T12:00:00Z',
      },
    };

    render(<ExplainableAiCard prediction={predictionWithNullTfidf} />);
    expect(screen.getByText('escrow')).toBeInTheDocument();
    expect(screen.getByText('+1.0446')).toBeInTheDocument();
    expect(screen.queryByText(/tf-idf:/i)).not.toBeInTheDocument();
  });
});
