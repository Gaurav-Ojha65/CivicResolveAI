import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
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

  it('applies active highlight styling to matching row and dims non-matching row', () => {
    render(
      <DivergingFeatureBarChart
        positiveFeatures={posFeatures}
        negativeFeatures={negFeatures}
        activeFeature="mortgage payment"
      />
    );

    const posRow = screen.getByRole('button', { name: /linear feature: mortgage payment/i });
    const negRow = screen.getByRole('button', { name: /linear feature: card balance/i });

    expect(posRow.className).toContain('ring-2 ring-teal-500 bg-teal-50/80 scale-[1.01]');
    expect(negRow.className).toContain('opacity-50');
    expect(screen.getByText(/Active Feature Focus:/i)).toBeInTheDocument();
  });

  it('wires onFeatureHover and onFeatureSelect on mouse interactions and allows resetting', async () => {
    const user = userEvent.setup();
    const onHover = vi.fn();
    const onSelect = vi.fn();

    render(
      <DivergingFeatureBarChart
        positiveFeatures={posFeatures}
        negativeFeatures={negFeatures}
        activeFeature="mortgage payment"
        onFeatureHover={onHover}
        onFeatureSelect={onSelect}
      />
    );

    const negRow = screen.getByRole('button', { name: /linear feature: card balance/i });
    await user.hover(negRow);
    expect(onHover).toHaveBeenCalledWith('card balance');

    await user.unhover(negRow);
    expect(onHover).toHaveBeenCalledWith(null);

    await user.click(negRow);
    expect(onSelect).toHaveBeenCalledWith('card balance');

    // Click Reset Filter button in indicator banner
    const resetBtn = screen.getByRole('button', { name: /clear active feature filter/i });
    await user.click(resetBtn);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('supports keyboard accessibility via Enter and Space on feature rows', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <DivergingFeatureBarChart
        positiveFeatures={posFeatures}
        negativeFeatures={negFeatures}
        onFeatureSelect={onSelect}
      />
    );

    const posRow = screen.getByRole('button', { name: /linear feature: mortgage payment/i });
    expect(posRow).toHaveAttribute('tabIndex', '0');

    posRow.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('mortgage payment');

    posRow.focus();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledWith('mortgage payment');
  });
});
