import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SubmitGrievancePage } from '../../src/features/grievances/SubmitGrievancePage';

vi.mock('../../src/lib/api/endpoints', () => ({
  submitGrievance: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/submit']}>
      <SubmitGrievancePage />
    </MemoryRouter>
  );
}

describe('SubmitGrievancePage Privacy & Presets', () => {
  it('loads sample CFPB presets into textarea on button click', () => {
    renderPage();

    const mortgagePresetBtn = screen.getByRole('button', {
      name: /Critical Mortgage Foreclosure/i,
    });
    expect(mortgagePresetBtn).toBeInTheDocument();

    fireEvent.click(mortgagePresetBtn);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('wrongfully initiated foreclosure proceedings');
  });

  it('detects sensitive SSN pattern and displays non-blocking privacy banner', () => {
    renderPage();

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, {
      target: {
        value: 'My SSN is 123-45-6789 and the bank reported incorrect late payments.',
      },
    });

    expect(screen.getByText(/Sensitive Numbers Detected:/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Mask Sensitive Numbers as XXXX/i })
    ).toBeInTheDocument();
  });

  it('masks SSN, card, and phone numbers when clicking the mask button', () => {
    renderPage();

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: 'My SSN is 123-45-6789 and card is 4111-2222-3333-4444 and phone is 555-123-4567.',
      },
    });

    const maskBtn = screen.getByRole('button', {
      name: /Mask Sensitive Numbers as XXXX/i,
    });
    fireEvent.click(maskBtn);

    expect(textarea.value).toContain('XXX-XX-6789');
    expect(textarea.value).toContain('XXXX-XXXX-XXXX-4444');
    expect(textarea.value).toContain('(XXX) XXX-4567');
  });

  it('updates narrative completeness guidance according to word count', () => {
    renderPage();

    const textarea = screen.getByRole('textbox');

    // 1. Brief narrative (< 20 words)
    fireEvent.change(textarea, {
      target: { value: 'Short text for banking complaint.' },
    });
    expect(
      screen.getByText(/Brief narrative • More details help AI routing/i)
    ).toBeInTheDocument();

    // 2. Good detail (20-100 words)
    const goodDetail =
      'I was charged unauthorized overdraft fees three consecutive times on my checking account despite having sufficient deposited funds. The branch manager refused to reverse the charges despite providing bank transaction statements.';
    fireEvent.change(textarea, { target: { value: goodDetail } });
    expect(
      screen.getByText(/Good level of detail for triage/i)
    ).toBeInTheDocument();
  });
});
