/**
 * LandingPage.test.tsx
 *
 * Tests for the public landing page: navigation, hero, how-it-works,
 * transparency, footer, and mobile nav toggle.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../../src/app/pages/LandingPage';
import { PublicLayout } from '../../src/components/layout/PublicLayout';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  it('renders the main hero headline', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /bring clarity to your/i })
    ).toBeInTheDocument();
  });

  it('renders the brand mark', () => {
    renderPage();
    expect(screen.getByLabelText(/CivicResolve AI/i)).toBeInTheDocument();
  });

  it('renders a "Submit Complaint" CTA link pointing to /submit', () => {
    renderPage();
    // Multiple CTAs expected; at least one must link to /submit
    const ctaLinks = screen
      .getAllByRole('link', { name: /submit/i })
      .filter((el) => el.getAttribute('href') === '/submit');
    expect(ctaLinks.length).toBeGreaterThan(0);
  });

  it('renders the "How It Works" section heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /how it works/i })
    ).toBeInTheDocument();
  });

  it('renders three How It Works step headings', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /submit your complaint/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /ai classification/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /human review/i })
    ).toBeInTheDocument();
  });

  it('renders the AI Transparency section', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /ai transparency/i })
    ).toBeInTheDocument();
    // Check key bullets
    expect(screen.getByText(/assessments are preliminary/i)).toBeInTheDocument();
    expect(screen.getByText(/not guaranteed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/this is not legal advice/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Privacy & Trust section', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /privacy & trust/i })
    ).toBeInTheDocument();
  });

  it('renders the footer with a disclaimer', () => {
    renderPage();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
    expect(within(footer).getByText(/not legal advice/i)).toBeInTheDocument();
    expect(within(footer).getByText(/human review/i)).toBeInTheDocument();
  });

  it('renders footer navigation links', () => {
    renderPage();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: /submit complaint/i })).toBeInTheDocument();
  });

  it('shows the mobile nav hamburger button', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /open navigation menu/i })
    ).toBeInTheDocument();
  });

  it('toggles mobile nav open and closed when hamburger is clicked', async () => {
    renderPage();
    const toggle = screen.getByRole('button', { name: /open navigation menu/i });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: /close navigation menu/i })
    ).toHaveAttribute('aria-expanded', 'true');

    // Mobile nav drawer items visible
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /close navigation menu/i })
    );
    expect(
      screen.getByRole('button', { name: /open navigation menu/i })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('desktop nav does not have the hamburger visible in a wide viewport (structure test)', () => {
    renderPage();
    // The hamburger is in the DOM but visually hidden on md+ via CSS class
    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });
    expect(hamburger.className).toContain('md:hidden');
  });

  it('has exactly one <main id="main-content"> landmark', () => {
    renderPage();
    const mainLandmarks = screen.getAllByRole('main');
    expect(mainLandmarks).toHaveLength(1);
    expect(mainLandmarks[0]).toHaveAttribute('id', 'main-content');
  });

  it('renders a skip-to-main-content link in PublicLayout targeting #main-content', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicLayout>
          <LandingPage />
        </PublicLayout>
      </MemoryRouter>
    );

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });
});

