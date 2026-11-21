import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../../src/app/pages/LandingPage';
import { PublicLayout } from '../../src/components/layout/PublicLayout';
import { getProductCategories } from '../../src/lib/api/endpoints';

vi.mock('../../src/lib/api/endpoints', () => ({ getProductCategories: vi.fn() }));

function renderPage() {
  return render(<MemoryRouter><PublicLayout><LandingPage /></PublicLayout></MemoryRouter>);
}

describe('public landing page', () => {
  beforeEach(() => {
    vi.mocked(getProductCategories).mockReset().mockResolvedValue({ categories: ['Student loan', 'Credit card'] });
  });

  it('shows the demonstration notice, illustrative preview and navigable primary actions', async () => {
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('A clearer way to submit and track your financial complaint.');
    expect(screen.getByText('Illustrative example')).toBeVisible();
    expect(screen.getByText('Demonstration system')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start a complaint' })).toHaveAttribute('href', '/submit');
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Track a complaint' })).toHaveAttribute('href', '/track');
    expect(container.querySelector('video')).toBeNull();
  });

  it('uses a single main landmark and exposes navigation and demo status on narrow screens', async () => {
    renderPage();
    await screen.findByText('Student loan');
    expect(screen.getByRole('link', { name: /skip to main/i })).toHaveAttribute('href', '#' + screen.getByRole('main').id);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /reviewer sign in/i })).toHaveAttribute('href', '/reviewer/login');
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/independent demonstration/i);
  });

  it('uses the products returned by the service', async () => {
    renderPage();
    const list = screen.getByRole('region', { name: /supported financial products/i });
    expect(await within(list).findByText('Credit card')).toBeVisible();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('recovers from a failed category request and displays an explicitly empty response', async () => {
    vi.mocked(getProductCategories).mockRejectedValueOnce(new Error()).mockResolvedValueOnce({ categories: [] });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/currently lists no products/i)).toBeVisible();
    expect(getProductCategories).toHaveBeenCalledTimes(2);
  });

  it('makes the FAQ keyboard operable and explains conditional human review', async () => {
    renderPage();
    await screen.findByText('Student loan');
    const disclosure = screen.getByText('Will a person review my complaint?');
    await userEvent.click(disclosure);
    expect(disclosure.parentElement).toHaveAttribute('open');
    expect(screen.getByText(/other submissions can be routed automatically/i)).toBeVisible();
  });
});
