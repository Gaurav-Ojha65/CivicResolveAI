import type { ReactNode } from 'react';
import { ArrowUpRight, Layers3 } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Overview' },
  { to: '/submit', label: 'Submit' },
  { to: '/track', label: 'Track' },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>
      <header className="border-b border-line bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 px-5 sm:px-8 lg:px-12">
          <Link to="/" aria-label="CivicResolve AI home" className="my-3 inline-flex items-center gap-2.5 rounded-md text-lg font-bold tracking-tight">
            <span className="grid size-9 place-items-center rounded-lg bg-ink text-white"><Layers3 size={21} aria-hidden="true" /></span>
            <span>CivicResolve <span className="font-medium text-teal-trust">AI</span></span>
          </Link>
          <nav aria-label="Main navigation" className="order-last flex w-full gap-6 sm:order-none sm:ml-auto sm:w-auto sm:self-stretch">
            {navigation.map(({ to, label }) => (
              <NavLink key={to} to={to} end className={({ isActive }) => 'inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold ' + (isActive ? 'border-teal-trust text-teal-trust' : 'border-transparent text-ink-muted hover:text-ink')}>{label}</NavLink>
            ))}
          </nav>
          <Link to="/reviewer/login" className="inline-flex min-h-10 items-center gap-1 rounded-md border border-line px-3 text-sm font-semibold text-ink-muted hover:border-teal-trust hover:text-teal-trust sm:ml-5">
            Reviewer sign in <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-line bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-ink-muted sm:px-8 md:flex-row md:items-start md:justify-between lg:px-12">
          <div>
            <p className="font-semibold text-ink">CivicResolve AI</p>
            <p className="mt-1 max-w-lg">Independent demonstration of financial complaint intake and tracking. Use fictional information only.</p>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 font-medium">
            <Link className="hover:underline" to="/">Overview</Link>
            <Link className="hover:underline" to="/submit">Submit a complaint</Link>
            <Link className="hover:underline" to="/track">Track a complaint</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
