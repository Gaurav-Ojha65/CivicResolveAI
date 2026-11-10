import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProbabilityMarginMeter } from '../../../src/features/reviewer/components/ProbabilityMarginMeter';

describe('ProbabilityMarginMeter', () => {
  const sampleProbabilities: Record<string, number> = {
    'Mortgage': 0.88,
    'Credit card': 0.08,
    'Debt collection': 0.02,
    'Student loan': 0.01,
    'Checking or savings account': 0.005,
    'Vehicle loan or lease': 0.003,
    'Money transfer, virtual currency, or money service': 0.001,
    'Credit reporting or other personal consumer reports': 0.001,
  };

  it('renders probability header, truthful AI notice, and top class', () => {
    render(
      <ProbabilityMarginMeter
        probabilities={sampleProbabilities}
        predictedCategory="Mortgage"
        confidence={0.88}
        margin={0.80}
      />
    );

    expect(screen.getByText(/8-Class Probability & Margin Calibration/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Uncalibrated model probability estimates/i).length).toBeGreaterThan(0);
    expect(screen.getByText('8 Classes')).toBeInTheDocument();
    expect(screen.getByText('Mortgage')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument(); // margin
  });

  it('renders safe margin and high confidence status badges when above thresholds', () => {
    render(
      <ProbabilityMarginMeter
        probabilities={sampleProbabilities}
        predictedCategory="Mortgage"
        confidence={0.88}
        margin={0.80}
        minConfidenceThreshold={0.55}
        minMarginThreshold={0.15}
      />
    );

    expect(screen.getByText(/Decisive class separation/i)).toBeInTheDocument();
    expect(screen.getByText(/High preliminary estimate/i)).toBeInTheDocument();
  });

  it('renders warning badges when margin is narrow or confidence is low', () => {
    const narrowProbabilities = {
      'Debt collection': 0.42,
      'Credit card': 0.38,
      'Mortgage': 0.10,
      'Student loan': 0.10,
    };

    render(
      <ProbabilityMarginMeter
        probabilities={narrowProbabilities}
        predictedCategory="Debt collection"
        confidence={0.42}
        margin={0.04}
        minConfidenceThreshold={0.55}
        minMarginThreshold={0.15}
      />
    );

    expect(screen.getByText(/Below minimum safety margin/i)).toBeInTheDocument();
    expect(screen.getByText(/Below confidence threshold/i)).toBeInTheDocument();
  });

  it('toggles expansion to show all 8 classes when clicked', () => {
    render(
      <ProbabilityMarginMeter
        probabilities={sampleProbabilities}
        predictedCategory="Mortgage"
        confidence={0.88}
        margin={0.80}
      />
    );

    // Initially displays top 4 classes
    const expandButton = screen.getByRole('button', { name: /Show All 8 Product Classes/i });
    expect(expandButton).toBeInTheDocument();

    fireEvent.click(expandButton);

    // Now all classes are visible and toggle button says "Show Top 4 Classes Only"
    expect(screen.getByRole('button', { name: /Show Top 4 Classes Only/i })).toBeInTheDocument();
    expect(screen.getByText('Vehicle loan or lease')).toBeInTheDocument();
  });
});
