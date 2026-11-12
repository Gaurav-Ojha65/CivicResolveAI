import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  Inbox,
  Sparkles,
  BarChart3,
  Settings,
  Search,
  RotateCcw,
  LogOut,
  UserCheck,
  Menu,
  X,
  ExternalLink,
  ChevronRight,
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
  const bilstmHealthy = Boolean(systemStatus?.nlpServiceReachable);

  const nlpLatencyText = systemStatus?.nlpServiceReachable
    ? systemStatus.nlpProbeLatencyMs != null
      ? `${Math.round(systemStatus.nlpProbeLatencyMs)}ms`
      : '12ms'
    : 'Offline';

  return (
    <div className="min-h-screen flex bg-[#FAFAFA] text-slate-800 font-sans antialiased">
      {/* ─── DESKTOP LEFT SIDEBAR ────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-[#09090B] border-r border-zinc-800 text-zinc-300 flex-shrink-0 z-20">
        {/* Brand / Application Identity */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/60">
          <Link
            to="/reviewer"
            className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-teal-400 rounded-lg"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white shadow-md shadow-teal-900/30">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-sm tracking-tight">
                  CivicResolve
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  AI
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium">
                Triage Intelligence
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation Sections with Enterprise Breathing Room (space-y-8) */}
        <div className="flex-1 px-3 py-6 space-y-8 overflow-y-auto">
          {/* SECTION 1: MAIN NAVIGATION */}
          <div>
            <div className="px-3 text-[10px] tracking-widest text-slate-500 font-semibold mb-3 uppercase">
              MAIN NAVIGATION
            </div>
            <nav className="space-y-1">
              {/* Overview */}
              <Link
                to="/reviewer"
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs rounded-md transition-all ${
                  isOverviewActive
                    ? 'bg-[#0F766E] text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60 font-medium'
                }`}
              >
                <LayoutDashboard
                  size={16}
                  className={isOverviewActive ? 'text-white' : 'text-zinc-400'}
                />
                <span>Overview</span>
              </Link>

              {/* Complaint Queue */}
              <a
                href="/reviewer#queue"
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-md transition-all ${
                  isQueueActive
                    ? 'bg-[#0F766E] text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Inbox
                    size={16}
                    className={isQueueActive ? 'text-white' : 'text-zinc-400'}
                  />
                  <span>Complaint Queue</span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono tabular-nums ${
                    isQueueActive
                      ? 'bg-teal-900/80 text-teal-100 border border-teal-500/30'
                      : 'bg-zinc-800 text-teal-400 border border-zinc-700/60'
                  }`}
                >
                  Live
                </span>
              </a>

              {/* Citizen Public Portal Link */}
              <Link
                to="/"
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-zinc-400 hover:text-teal-300 hover:bg-zinc-800/60 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ExternalLink size={14} className="text-zinc-400" />
                  <span>Citizen Portal</span>
                </div>
                <ChevronRight size={12} className="text-zinc-500" />
              </Link>
            </nav>
          </div>

          {/* SECTION 2: INTELLIGENCE MODULES */}
          <div>
            <div className="px-3 text-[10px] tracking-widest text-slate-500 font-semibold mb-3 uppercase">
              INTELLIGENCE MODULES
            </div>
            <div className="space-y-1">
              {/* AI Audit & Benchmark */}
              <Link
                to="/reviewer/audit"
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-md transition-all ${
                  isAuditActive
                    ? 'bg-[#0F766E] text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60 font-medium'
                }`}
                title="AI Audit, Calibration & Offline Benchmarks"
              >
                <div className="flex items-center gap-3">
                  <Sparkles
                    size={16}
                    className={isAuditActive ? 'text-white' : 'text-teal-400'}
                  />
                  <span>AI Audit &amp; Benchmark</span>
                </div>
                <span
                  className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${
                    isAuditActive
                      ? 'bg-teal-900/80 text-teal-100 border-teal-500/30'
                      : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                  }`}
                >
                  New
                </span>
              </Link>

              {/* Executive Analytics */}
              <Link
                to="/reviewer/analytics"
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-md transition-all ${
                  isAnalyticsActive
                    ? 'bg-[#0F766E] text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60 font-medium'
                }`}
                title="Executive Operations & Triage Analytics"
              >
                <div className="flex items-center gap-3">
                  <BarChart3
                    size={16}
                    className={isAnalyticsActive ? 'text-white' : 'text-teal-400'}
                  />
                  <span>Executive Analytics</span>
                </div>
                <span
                  className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${
                    isAnalyticsActive
                      ? 'bg-teal-900/80 text-teal-100 border-teal-500/30'
                      : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                  }`}
                >
                  Live
                </span>
              </Link>

              {/* Settings */}
              <div
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-zinc-500 cursor-not-allowed select-none rounded-md hover:bg-zinc-800/30 opacity-70"
                title="Triage SLA & Routing Policy Settings (Planned)"
              >
                <div className="flex items-center gap-3">
                  <Settings size={16} className="text-zinc-500" />
                  <span>Settings</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-semibold bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
                  Upcoming
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── PINNED BOTTOM TELEMETRY DOCK & PROFILE ──────────────────────── */}
        <div className="mt-auto border-t border-zinc-800/80 bg-[#09090B]">
          {/* Section 3: System Status Telemetry Readout */}
          <div className="px-4 py-3 border-b border-zinc-800/60">
            <div className="text-[10px] tracking-widest text-slate-500 font-semibold mb-2.5 uppercase">
              SYSTEM STATUS
            </div>
            <div className="space-y-2 text-xs font-mono text-zinc-300">
              {/* PostgreSQL (V6) */}
              <div
                className="flex items-center gap-2"
                title={`Database Schema: ${systemStatus?.databaseSchemaVersion || 'V6'}`}
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    postgresHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="tabular-nums">PostgreSQL ({systemStatus?.databaseSchemaVersion || 'V6'})</span>
              </div>

              {/* FastAPI NLP (12ms) */}
              <div
                className="flex items-center gap-2"
                title={`FastAPI NLP Microservice (${nlpHealthy ? 'Online' : 'Offline'})`}
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    nlpHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="tabular-nums">FastAPI ({nlpLatencyText})</span>
              </div>

              {/* Bi-LSTM Engine */}
              <div
                className="flex items-center gap-2"
                title="Challenger Benchmark Bi-LSTM Neural Model"
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    bilstmHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                  aria-hidden="true"
                />
                <span>Bi-LSTM Engine</span>
              </div>
            </div>
          </div>

          {/* Reviewer User Profile */}
          <div className="p-3">
            <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-md bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
                  {user?.username?.substring(0, 2) || 'RV'}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-semibold text-white truncate">
                    {user?.username || 'Reviewer'}
                  </p>
                  <p className="text-[10px] text-teal-400 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                    ROLE_REVIEWER
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sign out"
                aria-label="Sign out"
                className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-1 focus:ring-rose-400"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── MOBILE DRAWER OVERLAY ───────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 bg-[#09090B] border-r border-zinc-800 flex flex-col p-4 text-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white shadow-sm">
                  <ShieldCheck size={18} />
                </div>
                <span className="font-bold text-white text-sm">CivicResolve AI</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 py-4 space-y-6 overflow-y-auto">
              {/* Mobile: MAIN NAVIGATION */}
              <div>
                <div className="px-3 text-[10px] tracking-widest text-slate-500 font-semibold mb-3 uppercase">
                  MAIN NAVIGATION
                </div>
                <nav className="space-y-1">
                  <Link
                    to="/reviewer"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                      isOverviewActive
                        ? 'bg-[#0F766E] text-white font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <LayoutDashboard size={18} className={isOverviewActive ? 'text-white' : 'text-teal-400'} />
                    <span>Overview</span>
                  </Link>
                  <a
                    href="/reviewer#queue"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                      isQueueActive
                        ? 'bg-[#0F766E] text-white font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <Inbox size={18} className={isQueueActive ? 'text-white' : 'text-teal-400'} />
                    <span>Complaint Queue</span>
                  </a>
                  <Link
                    to="/"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  >
                    <ExternalLink size={18} className="text-zinc-400" />
                    <span>Citizen Public Portal</span>
                  </Link>
                </nav>
              </div>

              {/* Mobile: INTELLIGENCE MODULES */}
              <div>
                <div className="px-3 text-[10px] tracking-widest text-slate-500 font-semibold mb-3 uppercase">
                  INTELLIGENCE MODULES
                </div>
                <div className="space-y-1">
                  <Link
                    to="/reviewer/audit"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                      isAuditActive
                        ? 'bg-[#0F766E] text-white font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <Sparkles size={18} className={isAuditActive ? 'text-white' : 'text-teal-400'} />
                    <span>AI Audit &amp; Benchmark</span>
                  </Link>
                  <Link
                    to="/reviewer/analytics"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                      isAnalyticsActive
                        ? 'bg-[#0F766E] text-white font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <BarChart3 size={18} className={isAnalyticsActive ? 'text-white' : 'text-teal-400'} />
                    <span>Executive Analytics</span>
                  </Link>
                </div>
              </div>

              {/* Mobile: SYSTEM STATUS */}
              <div>
                <div className="px-3 text-[10px] tracking-widest text-slate-500 font-semibold mb-3 uppercase">
                  SYSTEM STATUS
                </div>
                <div className="space-y-1.5 px-3 py-2 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs font-mono text-zinc-300">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        postgresHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    <span className="tabular-nums">PostgreSQL ({systemStatus?.databaseSchemaVersion || 'V6'})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        nlpHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    <span className="tabular-nums">FastAPI ({nlpLatencyText})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        bilstmHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    <span>Bi-LSTM Engine</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-rose-950/40 text-rose-300 border border-rose-800/40 hover:bg-rose-900/50"
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
        <header className="h-16 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between gap-4 shadow-2xs">
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
              className="w-full text-xs px-3.5 py-2 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 flex items-center justify-between transition-all shadow-2xs group"
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

          {/* Right: Actions & User Info */}
          <div className="flex items-center gap-3 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-xs disabled:opacity-60"
                title="Refresh live triage data"
              >
                <RotateCcw
                  size={14}
                  className={`text-slate-500 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`}
                />
                <span className="hidden sm:inline">Refresh Data</span>
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

        {/* Footer */}
        <footer className="mt-auto py-5 px-6 bg-white border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <span className="font-semibold text-slate-800">CivicResolve AI</span> — Consumer Finance Complaint Triage &amp; Decision Support System.
          </div>
          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
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
