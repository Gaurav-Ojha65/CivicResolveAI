import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { InteractiveTriageHero } from '../../src/features/grievances/components/InteractiveTriageHero';

describe('InteractiveTriageHero', () => {
  it('renders all platform telemetry badges', () => {
    render(<InteractiveTriageHero onLoadScenario={vi.fn()} />);

    expect(screen.getByText('8 CFPB Divisions')).toBeInTheDocument();
    expect(screen.getByText('0.7488 Test Macro-F1')).toBeInTheDocument();
    expect(screen.getByText('0.55 / 0.15 Safety Gates')).toBeInTheDocument();
    expect(screen.getByText('Salted SHA-256 Tracking')).toBeInTheDocument();
  });

  it('switches scenario tabs and displays linear attribution tokens', async () => {
    render(<InteractiveTriageHero onLoadScenario={vi.fn()} />);

    // Default tab is Critical Mortgage
    expect(screen.getByText('Top-1: Mortgage')).toBeInTheDocument();
    expect(screen.getByText('foreclosure')).toBeInTheDocument();

    // Click Ambiguous Dual-Class tab
    const debtTab = screen.getByRole('tab', { name: /Ambiguous Dual-Class/i });
    await userEvent.click(debtTab);

    expect(screen.getByText('Top-1: Debt collection')).toBeInTheDocument();
    expect(screen.getByText('collection agency')).toBeInTheDocument();
  });

  it('invokes onLoadScenario when clicking load scenario CTA', async () => {
    const onLoadScenarioMock = vi.fn();
    render(<InteractiveTriageHero onLoadScenario={onLoadScenarioMock} />);

    const loadBtn = screen.getByRole('button', { name: /Load Critical Mortgage scenario into the intake form below/i });
    await userEvent.click(loadBtn);

    expect(onLoadScenarioMock).toHaveBeenCalledWith('foreclosure');
  });

  it('displays truthful AI disclosure qualification', () => {
    render(<InteractiveTriageHero onLoadScenario={vi.fn()} />);
    expect(
      screen.getByText(/Probabilities are uncalibrated estimates • Preliminary AI assessment only/i)
    ).toBeInTheDocument();
  });
});
