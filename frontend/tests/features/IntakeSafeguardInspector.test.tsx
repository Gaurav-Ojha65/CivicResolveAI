import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IntakeSafeguardInspector } from '../../src/features/grievances/components/IntakeSafeguardInspector';

describe('IntakeSafeguardInspector', () => {
  it('renders progress bar and tiers according to narrative word count', () => {
    // 0 words
    const { rerender } = render(
      <IntakeSafeguardInspector wordCount={0} hasPii={false} charCount={0} maxLength={5000} />
    );
    expect(screen.getByText(/No narrative yet/i)).toBeInTheDocument();

    // 15 words (< 20)
    rerender(
      <IntakeSafeguardInspector wordCount={15} hasPii={false} charCount={75} maxLength={5000} />
    );
    expect(screen.getByText(/Brief — add more context/i)).toBeInTheDocument();

    // 40 words (20-100)
    rerender(
      <IntakeSafeguardInspector wordCount={40} hasPii={false} charCount={200} maxLength={5000} />
    );
    expect(screen.getByText(/Good detail for triage/i)).toBeInTheDocument();

    // 120 words (> 100)
    rerender(
      <IntakeSafeguardInspector wordCount={120} hasPii={false} charCount={600} maxLength={5000} />
    );
    expect(screen.getByText(/Comprehensive narrative/i)).toBeInTheDocument();
  });

  it('reflects client-side PII detection state correctly', () => {
    // Clear state
    const { rerender } = render(
      <IntakeSafeguardInspector wordCount={30} hasPii={false} charCount={150} maxLength={5000} />
    );
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText(/No sensitive number patterns detected/i)).toBeInTheDocument();

    // Detected state
    rerender(
      <IntakeSafeguardInspector wordCount={30} hasPii={true} charCount={150} maxLength={5000} />
    );
    expect(screen.getByText('PII Detected')).toBeInTheDocument();
    expect(screen.getByText(/Potential SSN, card, or phone number detected/i)).toBeInTheDocument();
  });

  it('renders the 4-stage compliance workflow stepper', () => {
    render(
      <IntakeSafeguardInspector wordCount={25} hasPii={false} charCount={120} maxLength={5000} />
    );

    expect(screen.getByText('Public Intake')).toBeInTheDocument();
    expect(screen.getByText('NLP Auto-Classification')).toBeInTheDocument();
    expect(screen.getByText('Human Review')).toBeInTheDocument();
    expect(screen.getByText('Final Adjudication')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
  });
});

