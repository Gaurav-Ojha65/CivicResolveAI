import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DivergingFeatureBarChart } from '../../../src/features/reviewer/components/DivergingFeatureBarChart';
import { FeatureContribution } from '../../../src/types/grievance';

describe('DivergingFeatureBarChart', () => {
  const posFeatures: FeatureContribution[] = [
    { feature: 'mortgage payment', contribution: 0.8123, tfidfValue: 0.32 },
  ];
  const negFeatures: FeatureContribution[] = [
    { feature: 'card balance', contribution: -0.4567, tfidfValue: 0.21 },
  ];

  it('renders diverging bar chart profile centered on zero', () => {
    render(
      <DivergingFeatureBarChart
        positiveFeatures={posFeatures}
        negativeFeatures={negFeatures}
        predictedClass="Mortgage"
        runnerUpClass="Credit card"
      />
    );

    expect(
      screen.getByText(/Diverging Feature Contribution Profile/i)
    ).toBeInTheDocument();
    expect(screen.getByText('mortgage payment')).toBeInTheDocument();
    expect(screen.getByText('+0.8123')).toBeInTheDocument();
    expect(screen.getByText('card balance')).toBeInTheDocument();
    expect(screen.getByText('-0.4567')).toBeInTheDocument();
  });

  it('renders fallback notice when feature lists are empty', () => {
    render(<DivergingFeatureBarChart positiveFeatures={[]} negativeFeatures={[]} />);
    expect(
      screen.getByText(/no linear attribution coefficients available/i)
    ).toBeInTheDocument();
  });
});
