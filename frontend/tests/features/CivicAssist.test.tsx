import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CivicAssist } from '../../src/features/assistant/CivicAssist';
import { ExplainButton } from '../../src/features/assistant/ExplainButton';
const auth = vi.hoisted(() => ({ isAuthenticated: false }));

const ask = vi.fn();
vi.mock('../../src/features/assistant/assistant-api', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/features/assistant/assistant-api')>();
  return { ...original, askAssistant: (...args: unknown[]) => ask(...args) };
});
vi.mock('../../src/app/providers/AuthProvider', () => ({ useAuth: () => auth }));

const answer = {
  answer: 'Open the Track page and enter both receipt details.',
  sources: [{ id: 'tracking', title: 'Track a complaint', reference: 'docs/SECURITY.md' }],
  followUps: ['Explain that again'], navigation: [{ label: 'Open /track', route: '/track' }],
  responseMode: 'local', knowledgeId: 'tracking', warning: null, model: null,
};

describe('CivicAssist', () => {
  beforeEach(() => { auth.isAuthenticated = false; ask.mockReset(); ask.mockResolvedValue(answer); });

  it('opens, submits a question, and renders a sourced answer as text', async () => {
    render(<MemoryRouter initialEntries={['/track']}><CivicAssist /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open CivicAssist AI' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask CivicAssist' }), { target: { value: 'How do I track it?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await waitFor(() => expect(screen.getByText(answer.answer)).toBeInTheDocument());
    expect(ask).toHaveBeenCalledWith('How do I track it?', '/track', 'en', 'simple', null, false, expect.any(AbortSignal));
    expect(screen.getByRole('link', { name: 'Track a complaint' })).toHaveAttribute('href', 'https://github.com/Gaurav-Ojha65/CivicResolveAI/blob/main/docs/SECURITY.md');
    expect(screen.getByRole('link', { name: 'Open /track' })).toHaveAttribute('href', '/track');
  });

  it('changes language and detail, clears chat, and closes with Escape', async () => {
    render(<MemoryRouter><CivicAssist /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open CivicAssist AI' }));
    fireEvent.change(screen.getByLabelText('Assistant language'), { target: { value: 'hi' } });
    fireEvent.change(screen.getByLabelText('Explanation detail'), { target: { value: 'technical' } });
    fireEvent.click(screen.getByRole('button', { name: 'How do I track it?' }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask.mock.calls[0]?.[2]).toBe('hi');
    expect(ask.mock.calls[0]?.[3]).toBe('technical');
    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation' }));
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open CivicAssist AI' })).toBeInTheDocument();
  });

  it('opens contextual explanation without copying case data', async () => {
    render(<MemoryRouter><CivicAssist /><ExplainButton question="What does confidence mean?" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Explain with CivicAssist' }));
    await waitFor(() => expect(ask).toHaveBeenCalledWith('What does confidence mean?', '/', 'en', 'simple', null, false, expect.any(AbortSignal)));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders generated-looking HTML without executing it', async () => {
    ask.mockResolvedValue({ ...answer, answer: '<img src=x onerror=alert(1)>' });
    render(<MemoryRouter><CivicAssist /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open CivicAssist AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'How do I track it?' }));
    await waitFor(() => expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument());
    expect(document.querySelector('img')).toBeNull();
  });

  it('preserves a citizen conversation across public route navigation', async () => {
    render(<MemoryRouter initialEntries={['/']}><Routes>
      <Route path="/" element={<Link to="/track">Go to tracking</Link>} />
      <Route path="/track" element={<p>Tracking page</p>} />
    </Routes><CivicAssist /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open CivicAssist AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'How do I track it?' }));
    await waitFor(() => expect(screen.getByText(answer.answer)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('link', { name: 'Go to tracking' }));
    expect(screen.getByText('Tracking page')).toBeInTheDocument();
    expect(screen.getByText(answer.answer)).toBeInTheDocument();
  });

  it('ignores a late response after clearing the conversation', async () => {
    let resolve!: (value: typeof answer) => void;
    ask.mockImplementation(() => new Promise<typeof answer>(done => { resolve = done; }));
    render(<MemoryRouter><CivicAssist /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open CivicAssist AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'How do I track it?' }));
    expect(screen.getByRole('status')).toHaveTextContent('finding an answer');
    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation' }));
    resolve(answer);
    await waitFor(() => expect(screen.queryByText(answer.answer)).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears reviewer history and aborts a pending request when authorization ends', async () => {
    auth.isAuthenticated = true;
    let resolve!: (value: typeof answer) => void;
    ask.mockImplementation(() => new Promise<typeof answer>(done => { resolve = done; }));
    const { rerender } = render(<MemoryRouter initialEntries={['/reviewer']}><CivicAssist /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open CivicAssist AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'How does the reviewer queue work?' }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    const signal = ask.mock.calls[0]?.[6] as AbortSignal;
    auth.isAuthenticated = false;
    rerender(<MemoryRouter initialEntries={['/reviewer']}><CivicAssist /></MemoryRouter>);
    expect(signal.aborted).toBe(true);
    resolve(answer);
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open CivicAssist AI' })).toBeInTheDocument();
  });
});
