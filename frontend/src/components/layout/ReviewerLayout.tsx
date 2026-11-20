import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Inbox,
  Sparkles,
  BarChart3,
  Search,
  LogOut,
  UserCheck,
  Menu,
  X,
  ExternalLink,
  ChevronRight,
  FileText,
  RotateCcw,
} from 'lucide-react';
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

export const ReviewerLayout: React.FC<ReviewerLayoutProps> = ({
  children,
  title,
  subtitle,
  onRefresh,
  isRefreshing = false,
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
  const isTriageActive = isOverviewActive || isQueueActive;
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
      return 'Investigation Lab';
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
    <div className="min-h-screen flex bg-slate-50/70 text-slate-900 font-sans antialiased">
      {/* ─── DESKTOP LEFT SIDEBAR (w-64) ─────────────────────────────────── */}
      <aside
        aria-label="Reviewer navigation rail"
        className="hidden lg:flex lg:flex-col lg:w-64 bg-white border-r border-slate-200/90 flex-shrink-0 z-20 select-none shadow-[1px_0_2px_rgba(0,0,0,0.02)]"
      >
        {/* Brand & Console Identity */}
        <div className="h-16 px-5 border-b border-slate-200/80 flex items-center justify-between">
          <Link
            to="/reviewer"
            aria-label="CivicResolve AI Staff Console"
            title="CivicResolve AI Reviewer Portal"
            className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-lg p-0.5"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-700 group-hover:bg-teal-800 flex items-center justify-center text-white shadow-xs transition-colors">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-slate-900 leading-tight">
                CivicResolve AI
              </span>
              <span className="text-[10px] font-mono tracking-wider text-slate-600 uppercase">
                Staff Console
              </span>
            </div>
          </Link>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-teal-50 text-teal-800 border border-teal-200/80">
            v0.7
          </span>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 py-4 px-3 space-y-6 overflow-y-auto">
          {/* Operations Section */}
          <div className="space-y-1">
            <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Operations
            </div>

            {/* Overview & Triage Queue */}
            <Link
              to="/reviewer"
              aria-label="Triage Queue"
              title="Operational Intake Queue & Triage"
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isTriageActive
                  ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200/90 shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Inbox
                  size={17}
                  className={isTriageActive ? 'text-teal-700' : 'text-slate-500'}
                />
                <span>Triage Queue</span>
              </div>
              {isTriageActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600" aria-hidden="true" />
              )}
            </Link>

            {/* Investigation Lab (Active contextual case view) */}
            {isDetailActive ? (
              <div
                aria-current="page"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold bg-teal-50 text-teal-900 border border-teal-200/90 shadow-2xs"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <FileText size={17} className="text-teal-700 shrink-0" />
                  <span className="truncate">Investigation Lab</span>
                </div>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-teal-100/80 text-teal-800 border border-teal-200 shrink-0">
                  Active
                </span>
              </div>
            ) : (
              <div
                title="Select a grievance from the triage queue to begin deep investigation"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-500 cursor-not-allowed select-none"
              >
                <div className="flex items-center gap-2.5">
                  <FileText size={17} className="text-slate-400" />
                  <span>Investigation Lab</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">Contextual</span>
              </div>
            )}
          </div>

          {/* Governance Section */}
          <div className="space-y-1">
            <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Governance
            </div>

            {/* Executive Analytics */}
            <Link
              to="/reviewer/analytics"
              aria-label="Executive Analytics"
              title="Operational telemetry, velocity, and Monte Carlo stress lab"
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isAnalyticsActive
                  ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200/90 shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3
                  size={17}
                  className={isAnalyticsActive ? 'text-teal-700' : 'text-slate-500'}
                />
                <span>Executive Analytics</span>
              </div>
              {isAnalyticsActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600" aria-hidden="true" />
              )}
            </Link>

            {/* AI Audit & Benchmark */}
            <Link
              to="/reviewer/audit"
              aria-label="AI Audit & Benchmark"
              title="Model calibration, ECE reliability, and active learning"
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isAuditActive
                  ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200/90 shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sparkles
                  size={17}
                  className={isAuditActive ? 'text-teal-700' : 'text-slate-500'}
                />
                <span>AI Audit &amp; Benchmark</span>
              </div>
              {isAuditActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600" aria-hidden="true" />
              )}
            </Link>
          </div>

          {/* Portals & Resources */}
          <div className="space-y-1">
            <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Portals
            </div>

            <Link
              to="/"
              aria-label="Citizen Portal"
              title="Public Citizen Grievance Submission Portal"
              className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <ExternalLink size={16} className="text-slate-400" />
                <span>Public Citizen Portal</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Public</span>
            </Link>
          </div>
        </div>

        {/* Pinned Bottom Telemetry & Reviewer Identity */}
        <div className="p-3 border-t border-slate-200/80 space-y-3 bg-slate-50/50">
          {/* System Status Panel */}
          <div
            className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-xs shadow-2xs"
            title={`System Telemetry: PostgreSQL Schema (${systemStatus?.databaseSchemaVersion || 'V8'}), FastAPI NLP (${nlpLatencyText})`}
            aria-label={`System Status: ${postgresHealthy && nlpHealthy ? 'All services operational' : 'Degraded'}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
                System Telemetry
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  postgresHealthy && nlpHealthy ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
            </div>
            <div className="space-y-1 font-mono text-[11px] text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">PostgreSQL</span>
                <span className="font-semibold text-slate-700">
                  {systemStatus?.databaseSchemaVersion || 'V8'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">FastAPI NLP</span>
                <span className="font-semibold text-slate-700 tabular-nums">
                  {nlpLatencyText}
                </span>
              </div>
            </div>
          </div>

          {/* Reviewer User Dock & Sign Out */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-teal-400 font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                {user?.username ? user.username.charAt(0).toUpperCase() : 'R'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-900 truncate leading-tight">
                  {user?.username || 'reviewer'}
                </span>
                <span className="text-[10px] font-mono text-slate-500 truncate">
                  ROLE_REVIEWER
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              title="Sign out of reviewer session"
              aria-label="Sign out"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── MOBILE DRAWER OVERLAY ───────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 flex flex-col p-4 text-slate-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-700 flex items-center justify-center text-white shadow-xs">
                  <ShieldCheck size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 text-sm">CivicResolve AI</span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Staff Console</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 py-4 space-y-6 overflow-y-auto">
              {/* Operations */}
              <div className="space-y-1">
                <div className="px-3 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Operations
                </div>
                <Link
                  to="/reviewer"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isTriageActive
                      ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Inbox size={18} className={isTriageActive ? 'text-teal-700' : 'text-slate-500'} />
                  <span>Triage Queue</span>
                </Link>
              </div>

              {/* Governance */}
              <div className="space-y-1">
                <div className="px-3 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Governance
                </div>
                <Link
                  to="/reviewer/analytics"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isAnalyticsActive
                      ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 size={18} className={isAnalyticsActive ? 'text-teal-700' : 'text-slate-500'} />
                  <span>Executive Analytics</span>
                </Link>

                <Link
                  to="/reviewer/audit"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isAuditActive
                      ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Sparkles size={18} className={isAuditActive ? 'text-teal-700' : 'text-slate-500'} />
                  <span>AI Audit &amp; Benchmark</span>
                </Link>
              </div>

              {/* Portals */}
              <div className="space-y-1">
                <div className="px-3 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Portals
                </div>
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <ExternalLink size={18} className="text-slate-400" />
                  <span>Public Citizen Portal</span>
                </Link>
              </div>

              {/* Status Readout */}
              <div className="pt-2">
                <div className="px-3 text-[10px] tracking-widest text-slate-500 font-semibold mb-2 uppercase">
                  SYSTEM STATUS
                </div>
                <div className="space-y-1.5 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        postgresHealthy ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="tabular-nums">PostgreSQL ({systemStatus?.databaseSchemaVersion || 'V8'})</span>
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

            <div className="pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <LogOut size={14} />
                <span>Sign Out ({user?.username || 'reviewer'})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MAIN CONTENT COLUMN ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Navigation Bar with Dynamic Breadcrumbs & Search */}
        <header className="h-16 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200/90 sticky top-0 z-10 flex items-center justify-between gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
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

            {/* Dynamic Breadcrumbs */}
            <div className="flex flex-col justify-center min-w-0">
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm shrink-0">
                <Link
                  to="/reviewer"
                  className="font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0"
                >
                  Reviewer Portal
                </Link>
                <ChevronRight size={13} className="text-slate-400 shrink-0" aria-hidden="true" />
                <span className="font-semibold text-slate-900 tracking-tight shrink-0">
                  {getBreadcrumbName()}
                </span>
                {isDetailActive && title && title.startsWith('Case #') && (
                  <>
                    <ChevronRight size={13} className="text-slate-400 shrink-0 hidden sm:inline" aria-hidden="true" />
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 hidden sm:inline shrink-0 tabular-nums">
                      {title}
                    </span>
                  </>
                )}
              </nav>

              {/* Accessible title anchor for tests and screen readers */}
              {title && <span className="sr-only">{title}</span>}

              {subtitle && (
                <p className="text-[11px] text-slate-500 hidden 2xl:block truncate max-w-sm mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Center: Search / Global Command Palette Trigger */}
          <div className="hidden md:flex justify-center flex-1 px-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="w-full max-w-xs xl:max-w-sm text-xs px-3.5 py-2 bg-slate-50 hover:bg-slate-100/90 border border-slate-200/90 rounded-xl text-slate-500 hover:text-slate-700 flex items-center justify-between transition-all shadow-2xs group focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <div className="flex items-center gap-2 truncate">
                <Search size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
                <span className="truncate font-normal">Search cases, commands...</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <kbd className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 font-mono text-[10px] font-semibold text-slate-600 shadow-2xs">
                  ⌘K
                </kbd>
              </div>
            </button>
          </div>

          {/* Right: Refresh trigger, Reviewer Badge & Sign Out */}
          <div className="flex items-center gap-3 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Refresh dashboard data"
                aria-label="Refresh dashboard data"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50"
              >
                <RotateCcw
                  size={13}
                  className={`text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                <span>Refresh</span>
              </button>
            )}

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

        {/* Enterprise Footer */}
        <footer className="mt-auto py-5 px-6 bg-white border-t border-slate-200/80 text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_-1px_2px_rgba(0,0,0,0.01)]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">CivicResolve AI</span>
            <span className="text-slate-400">•</span>
            <span>Enterprise Grievance Triage &amp; Human-in-the-Loop Decision Support</span>
          </div>
          <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
            <span>Spring Boot 3.3</span>
            <span>•</span>
            <span>PostgreSQL 18</span>
            <span>•</span>
            <span>In-Memory Security</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
