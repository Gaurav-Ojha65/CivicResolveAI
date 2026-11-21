import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Activity, BarChart3, ClipboardList, ExternalLink, LogOut, Menu, RotateCcw, Search, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { CommandPaletteModal } from '../../features/reviewer/components/CommandPaletteModal';
import { getSystemStatus } from '../../lib/api/endpoints';
import { SystemStatusResponse } from '../../types/grievance';

export interface ReviewerLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const destinations = [
  { to: '/reviewer', label: 'Complaint queue', icon: ClipboardList },
  { to: '/reviewer/analytics', label: 'Executive analytics', icon: BarChart3 },
  { to: '/reviewer/audit', label: 'Model audit', icon: Activity },
];

export const ReviewerLayout: React.FC<ReviewerLayoutProps> = ({ children, title, onRefresh, isRefreshing }) => {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const statusRequest = useRef<AbortController>();
  const menuTrigger = useRef<HTMLButtonElement>(null);

  const fetchStatus = useCallback(async () => {
    statusRequest.current?.abort();
    const controller = new AbortController();
    statusRequest.current = controller;
    try {
      const data = await getSystemStatus(controller.signal);
      if (!controller.signal.aborted) setSystemStatus(data);
    } catch {
      if (!controller.signal.aborted) setSystemStatus(null);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = window.setInterval(fetchStatus, 30000);
    return () => { window.clearInterval(interval); statusRequest.current?.abort(); };
  }, [fetchStatus]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (document.querySelector('[aria-modal="true"]') && !paletteOpen) return;
        event.preventDefault();
        setMobileMenuOpen(false);
        setPaletteOpen(open => !open);
      } else if (event.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuTrigger.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileMenuOpen, paletteOpen]);

  const locationLabel = destinations.find(item => item.to === pathname)?.label || title || 'Case review';
  const schema = systemStatus?.databaseSchemaVersion;
  const latency = systemStatus?.nlpProbeLatencyMs;
  const nlpProbe = !systemStatus || systemStatus.nlpServiceReachable == null ? 'Unavailable'
    : !systemStatus.nlpServiceReachable ? 'Unreachable'
    : typeof latency === 'number' && Number.isFinite(latency) && latency >= 0 ? `${Math.round(latency)} ms`
    : 'Reachable · latency unavailable';

  return (
    <div className="min-h-screen bg-canvas text-ink lg:flex">
      <a className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:p-3 focus:bg-white" href="#main-content">Skip to content</a>
      <aside className="bg-ink-deep text-white lg:sticky lg:top-0 lg:h-screen lg:w-56 xl:w-60 lg:shrink-0 lg:flex lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6 lg:py-7">
          <Link to="/reviewer" className="inline-flex items-center gap-3 rounded">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-teal-200/30 bg-teal-100/10 text-teal-100"><ShieldCheck size={21} /></span>
            <span className="leading-tight"><strong className="block text-base">CivicResolve AI</strong><span className="text-xs text-slate-300">Reviewer workspace</span></span>
          </Link>
          <button ref={menuTrigger} type="button" className="p-2 lg:hidden" aria-expanded={mobileMenuOpen} aria-controls="reviewer-navigation" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
        <div id="reviewer-navigation" className={`${mobileMenuOpen ? 'flex' : 'hidden'} flex-col gap-5 px-4 pb-5 lg:flex lg:min-h-0 lg:flex-1 lg:overflow-y-auto`}>
          <nav aria-label="Reviewer navigation" className="space-y-1">
            {destinations.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-slate-200 hover:bg-white/10'}`}>
                <Icon size={17} />{label}
              </NavLink>
            ))}
          </nav>
          <div className="space-y-4 lg:mt-auto">
            <section aria-label="Service status" className="rounded-lg border border-white/20 p-3 text-xs">
              <h2 className="font-semibold text-slate-100">Service status</h2>
              <dl className="mt-3 space-y-2 text-slate-200">
                <div className="flex flex-wrap justify-between gap-2"><dt>Database schema</dt><dd>{schema && schema.toUpperCase() !== 'UNKNOWN' ? schema : 'Unavailable'}</dd></div>
                <div className="flex flex-wrap justify-between gap-2"><dt>NLP probe</dt><dd>{nlpProbe}</dd></div>
              </dl>
            </section>
            <Link to="/" className="flex items-center gap-2 rounded px-2 py-2 text-sm text-slate-200 hover:text-white"><ExternalLink size={15} />Citizen portal</Link>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-white px-4 py-3 sm:px-6 lg:px-8">
          <p className="min-w-0 text-sm font-semibold text-ink">{locationLabel}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog" aria-label="Search cases and commands" className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm text-ink-muted hover:bg-canvas">
              <Search size={16} /><span className="hidden sm:inline">Search workspace</span>
            </button>
            {onRefresh && <button type="button" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh current view" title="Refresh current view" className="rounded-lg p-2 text-ink-muted hover:bg-canvas disabled:opacity-50"><RotateCcw size={16} /></button>}
            <span className="hidden max-w-32 truncate border-l border-border pl-3 text-sm text-ink-muted sm:block">{user?.username}</span>
            <button type="button" onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-ink-muted hover:bg-canvas"><LogOut size={16} /></button>
          </div>
        </header>
        <CommandPaletteModal isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} systemStatus={systemStatus} onStatusRefresh={fetchStatus} />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <footer className="mx-4 border-t border-border py-4 text-xs text-ink-muted sm:mx-6 lg:mx-8">CivicResolve AI · Demonstration workspace</footer>
      </div>
    </div>
  );
};
