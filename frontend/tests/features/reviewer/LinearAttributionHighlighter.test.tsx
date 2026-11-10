import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { LinearAttributionHighlighter } from '../../../src/features/reviewer/components/LinearAttributionHighlighter';
import { FeatureContribution } from '../../../src/types/grievance';

describe('LinearAttributionHighlighter', () => {
  const sampleNarrative =
    'My escrow account was double billed and I received a notice of foreclosure.';

  const positiveFeatures: FeatureContribution[] = [
    { feature: 'escrow', contribution: 0.6543, tfidfValue: 0.25 },
  ];

  const negativeFeatures: FeatureContribution[] = [
    { feature: 'billed', contribution: -0.321, tfidfValue: 0.15 },
  ];

  it('renders narrative and toggle controls', () => {
    render(
      <LinearAttributionHighlighter
        narrative={sampleNarrative}
        topPositiveFeatures={positiveFeatures}
        topNegativeFeatures={negativeFeatures}
      />
    );

    expect(screen.getByText(/Contextual In-Text Attribution/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /positive drivers/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /negative \/ competing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /triage risk keywords/i })).toBeInTheDocument();
  });

  it('highlights positive driver tokens with mark elements', () => {
    const { container } = render(
      <LinearAttributionHighlighter
        narrative={sampleNarrative}
        topPositiveFeatures={positiveFeatures}
        topNegativeFeatures={negativeFeatures}
      />
    );

    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    expect(screen.getByText('escrow')).toBeInTheDocument();
  });

  it('shows tooltip details on hover', async () => {
    const user = userEvent.setup();
    render(
      <LinearAttributionHighlighter
        narrative={sampleNarrative}
        topPositiveFeatures={positiveFeatures}
        topNegativeFeatures={negativeFeatures}
      />
    );

    const mark = screen.getByText('escrow');
    await user.hover(mark);

    expect(screen.getByText(/Linear Driver: escrow/i)).toBeInTheDocument();
    expect(screen.getByText(/\+0.6543/)).toBeInTheDocument();
  });
});
