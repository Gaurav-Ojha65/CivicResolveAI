import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
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
    expect(screen.getByRole('button', { name: /attribution token: escrow/i })).toBeInTheDocument();
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

    const mark = screen.getByRole('button', { name: /attribution token: escrow/i });
    await user.hover(mark);

    expect(screen.getByText(/Linear Driver: escrow/i)).toBeInTheDocument();
    expect(screen.getByText(/\+0.6543/)).toBeInTheDocument();
  });

  it('applies active highlight styling to matching tokens and dims non-matching tokens', () => {
    render(
      <LinearAttributionHighlighter
        narrative={sampleNarrative}
        topPositiveFeatures={positiveFeatures}
        topNegativeFeatures={negativeFeatures}
        activeFeature="escrow"
      />
    );

    const escrowMark = screen.getByRole('button', { name: /attribution token: escrow/i });
    const billedMark = screen.getByRole('button', { name: /attribution token: billed/i });

    expect(escrowMark.className).toContain('ring-2 ring-teal-500 scale-[1.02] shadow-xs');
    expect(billedMark.className).toContain('opacity-60');
    expect(screen.getByText(/Active Feature Focus:/i)).toBeInTheDocument();
  });

  it('wires onFeatureHover and onFeatureSelect on mouse interactions and allows resetting', async () => {
    const user = userEvent.setup();
    const onHover = vi.fn();
    const onSelect = vi.fn();

    render(
      <LinearAttributionHighlighter
        narrative={sampleNarrative}
        topPositiveFeatures={positiveFeatures}
        topNegativeFeatures={negativeFeatures}
        activeFeature="escrow"
        onFeatureHover={onHover}
        onFeatureSelect={onSelect}
      />
    );

    const billedMark = screen.getByRole('button', { name: /attribution token: billed/i });
    await user.hover(billedMark);
    expect(onHover).toHaveBeenCalledWith('billed');

    await user.unhover(billedMark);
    expect(onHover).toHaveBeenCalledWith(null);

    await user.click(billedMark);
    expect(onSelect).toHaveBeenCalledWith('billed');

    // Click Reset Filter button in reset indicator banner
    const resetBtn = screen.getByRole('button', { name: /reset active feature selection/i });
    await user.click(resetBtn);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('supports keyboard accessibility via Enter and Space on mark spans', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <LinearAttributionHighlighter
        narrative={sampleNarrative}
        topPositiveFeatures={positiveFeatures}
        topNegativeFeatures={negativeFeatures}
        onFeatureSelect={onSelect}
      />
    );

    const escrowMark = screen.getByRole('button', { name: /attribution token: escrow/i });
    expect(escrowMark).toHaveAttribute('role', 'button');
    expect(escrowMark).toHaveAttribute('tabIndex', '0');

    escrowMark.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('escrow');

    escrowMark.focus();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledWith('escrow');
  });
});
