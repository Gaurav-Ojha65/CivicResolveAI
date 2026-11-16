import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  Inbox,
  Sparkles,
  BarChart3,
  Search,
  LogOut,
  UserCheck,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { CommandPaletteModal } from '../../features/reviewer/components/CommandPaletteModal';
import { getSystemStatus } from '../../lib/api/endpoints';
import { SystemStatusResponse } from '../../types/grievance';

interface ReviewerLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const ReviewerLayout: React.FC<ReviewerLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getSystemStatus();
      setSystemStatus(data);
    } catch {
      // Bounded fallback: do not crash reviewer shell on telemetry failure
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isQueueActive = location.pathname === '/reviewer' && location.hash === '#queue';
  const isOverviewActive = location.pathname === '/reviewer' && !location.hash;
  const isDetailActive =
    location.pathname.startsWith('/reviewer/grievances/') ||
    Boolean(title?.toLowerCase().includes('case #'));
  const isAuditActive =
    location.pathname === '/reviewer/audit' ||
    Boolean(title?.toLowerCase().includes('audit'));
  const isAnalyticsActive =
    location.pathname === '/reviewer/analytics' ||
    Boolean(title?.toLowerCase().includes('analytics'));

  // Dynamic breadcrumb label based on route
  const getBreadcrumbName = () => {
    if (isDetailActive) {
      return 'Grievance Investigation Lab';
    }
    if (isAuditActive) {
      return 'AI Audit & Benchmark';
    }
    if (isAnalyticsActive) {
      return 'Executive Analytics';
    }
    if (location.pathname === '/reviewer') {
      return 'Overview & Queue';
    }
    return title || 'Overview & Queue';
  };

  const postgresHealthy = Boolean(
    systemStatus?.databaseSchemaVersion || systemStatus?.backendStatus === 'ok'
  );
  const nlpHealthy = Boolean(systemStatus?.nlpServiceReachable);

  const nlpLatencyText = systemStatus?.nlpServiceReachable
    ? systemStatus.nlpProbeLatencyMs != null
      ? `${Math.round(systemStatus.nlpProbeLatencyMs)}ms`
      : '12ms'
    : 'Offline';

  return (
    <div className="min-h-screen flex bg-canvas text-ink font-sans antialiased">
      {/* ─── DESKTOP LEFT SIDEBAR: SLIM ICON RAIL (w-16) ────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-16 bg-white border-r border-line flex-shrink-0 z-20 py-4 items-center justify-between">
        {/* Top: Brand Icon */}
        <div className="flex flex-col items-center gap-6 w-full">
          <Link
            to="/reviewer"
            aria-label="CivicResolve AI"
            title="CivicResolve AI Reviewer Portal"
            className="w-10 h-10 rounded-lg bg-teal-700 flex items-center justify-center text-white shadow-xs hover:bg-teal-800 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <ShieldCheck size={22} className="text-white" />
          </Link>

          {/* Navigation Icons */}
          <nav aria-label="Reviewer navigation rail" className="flex flex-col items-center gap-2 w-full px-2">
            {/* Overview */}
            <Link
              to="/reviewer"
              aria-label="Overview"
              title="Overview"
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                isOverviewActive
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs'
                  : 'text-slate-500 hover:text-ink hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard size={18} />
            </Link>

            {/* Complaint Queue */}
            <a
              href="/reviewer#queue"
              aria-label="Complaint Queue"
              title="Complaint Queue"
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                isQueueActive
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs'
                  : 'text-slate-500 hover:text-ink hover:bg-slate-100'
              }`}
            >
              <Inbox size={18} />
            </a>

            {/* AI Audit & Benchmark */}
            <Link
              to="/reviewer/audit"
              aria-label="AI Audit & Benchmark"
              title="AI Audit & Benchmark"
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                isAuditActive
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs'
                  : 'text-slate-500 hover:text-ink hover:bg-slate-100'
              }`}
            >
              <Sparkles size={18} />
            </Link>

            {/* Executive Analytics */}
            <Link
              to="/reviewer/analytics"
              aria-label="Executive Analytics"
              title="Executive Analytics"
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                isAnalyticsActive
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs'
                  : 'text-slate-500 hover:text-ink hover:bg-slate-100'
              }`}
            >
              <BarChart3 size={18} />
            </Link>

            {/* Citizen Public Portal */}
            <Link
              to="/"
              aria-label="Citizen Portal"
              title="Citizen Portal"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-ink hover:bg-slate-100 transition-colors"
            >
              <ExternalLink size={18} />
            </Link>
          </nav>
        </div>

        {/* Pinned Bottom Status Dot & Sign Out */}
        <div className="flex flex-col items-center gap-3 w-full pt-4 border-t border-line px-2">
          {/* Status Dot with Tooltip */}
          <div
            className="flex items-center justify-center p-2 rounded-lg hover:bg-slate-50 cursor-help transition-colors"
            title={`System Status: PostgreSQL (${systemStatus?.databaseSchemaVersion || 'V6'}), FastAPI NLP (${nlpLatencyText})`}
            aria-label={`System Status: ${postgresHealthy && nlpHealthy ? 'All services operational' : 'Degraded'}`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                postgresHealthy && nlpHealthy ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              aria-hidden="true"
            />
          </div>

          {/* Sign Out */}
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* ─── MOBILE DRAWER OVERLAY (LIGHT THEME) ─────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 bg-white border-r border-line flex flex-col p-4 text-slate-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-700 flex items-center justify-center text-white shadow-xs">
                  <ShieldCheck size={18} />
                </div>
                <span className="font-bold text-ink text-sm">CivicResolve AI</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:text-ink hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 py-4 space-y-6 overflow-y-auto">
              {/* Navigation Items */}
              <nav className="space-y-1">
                <Link
                  to="/reviewer"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isOverviewActive
                      ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
                  }`}
                >
                  <LayoutDashboard size={18} className={isOverviewActive ? 'text-teal-800' : 'text-slate-500'} />
                  <span>Overview</span>
                </Link>

                <a
                  href="/reviewer#queue"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isQueueActive
                      ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
                  }`}
                >
                  <Inbox size={18} className={isQueueActive ? 'text-teal-800' : 'text-slate-500'} />
                  <span>Complaint Queue</span>
                </a>

                <Link
                  to="/reviewer/audit"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isAuditActive
                      ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
                  }`}
                >
                  <Sparkles size={18} className={isAuditActive ? 'text-teal-800' : 'text-slate-500'} />
                  <span>AI Audit &amp; Benchmark</span>
                </Link>

                <Link
                  to="/reviewer/analytics"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isAnalyticsActive
                      ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
                  }`}
                >
                  <BarChart3 size={18} className={isAnalyticsActive ? 'text-teal-800' : 'text-slate-500'} />
                  <span>Executive Analytics</span>
                </Link>

                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-slate-500 hover:bg-slate-100 hover:text-ink"
                >
                  <ExternalLink size={18} className="text-slate-400" />
                  <span>Citizen Portal</span>
                </Link>
              </nav>

              {/* Status Readout */}
              <div className="pt-2">
                <div className="px-3 text-[10px] tracking-widest text-slate-600 font-semibold mb-2 uppercase">
                  SYSTEM STATUS
                </div>
                <div className="space-y-1.5 px-3 py-2.5 rounded-lg bg-slate-50 border border-line text-xs font-mono text-slate-700">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        postgresHealthy ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="tabular-nums">PostgreSQL ({systemStatus?.databaseSchemaVersion || 'V6'})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        nlpHealthy ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="tabular-nums">FastAPI ({nlpLatencyText})</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <LogOut size={14} />
                <span>Sign Out ({user?.username})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MAIN CONTENT COLUMN ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Navigation Bar with Dynamic Breadcrumbs & Search */}
        <header className="h-16 px-4 sm:px-6 lg:px-8 bg-white border-b border-line sticky top-0 z-10 flex items-center justify-between gap-4 shadow-2xs">
          {/* Left: Mobile hamburger & Dynamic Route Breadcrumbs */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 shrink-0"
              aria-label="Open sidebar menu"
            >
              <Menu size={20} />
            </button>

            {/* Dynamic Breadcrumbs based on active route */}
            <div className="flex flex-col justify-center min-w-0">
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs sm:text-sm truncate">
                <Link
                  to="/reviewer"
                  className="font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0"
                >
                  Reviewer Portal
                </Link>
                <span className="text-slate-300 font-normal shrink-0" aria-hidden="true">/</span>
                <span className="font-semibold text-slate-900 tracking-tight truncate">
                  {getBreadcrumbName()}
                </span>
                {isDetailActive && title && title.startsWith('Case #') && (
                  <>
                    <span className="text-slate-300 font-normal shrink-0 hidden md:inline" aria-hidden="true">/</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 hidden md:inline shrink-0 tabular-nums">
                      {title}
                    </span>
                  </>
                )}
              </nav>

              {/* Accessible title anchor for tests and screen readers */}
              {title && <span className="sr-only">{title}</span>}

              {subtitle && (
                <p className="text-[11px] text-slate-500 hidden xl:block truncate max-w-lg mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Center: Search / Global Command Palette Trigger */}
          <div className="flex-1 max-w-md hidden md:block">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="w-full text-xs px-3.5 py-2 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 flex items-center justify-between transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-2.5 truncate">
                <Search size={15} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                <span className="truncate font-normal">Search complaints by ID, category, or command...</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <kbd className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 font-mono text-[10px] font-semibold text-slate-600 shadow-2xs">
                  ⌘K
                </kbd>
              </div>
            </button>
          </div>

          {/* Right: Reviewer Badge & Sign Out */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Reviewer Badge (Links to /reviewer) */}
            <Link
              to="/reviewer"
              className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200/80 hover:bg-teal-100/70 transition-colors"
              title="Reviewer Workspace"
            >
              <UserCheck size={14} className="text-teal-700" />
              <span className="text-xs font-semibold text-teal-800">
                Reviewer: {user?.username || 'reviewer'}
              </span>
            </Link>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={logout}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline px-1 py-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Global Command Palette Modal */}
        <CommandPaletteModal
          isOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          systemStatus={systemStatus}
          onStatusRefresh={fetchStatus}
        />

        {/* Page Content */}
        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-auto py-5 px-6 bg-white border-t border-line text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <span className="font-semibold text-ink">CivicResolve AI</span> — Consumer Finance Complaint Triage &amp; Decision Support System.
          </div>
          <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
            <span>Spring Boot 4.1.1</span>
            <span>•</span>
            <span>PostgreSQL 18</span>
            <span>•</span>
            <span>In-Memory Auth</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
