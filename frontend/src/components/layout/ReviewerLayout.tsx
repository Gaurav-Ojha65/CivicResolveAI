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
  const isDetailActive = location.pathname.startsWith('/reviewer/grievances/');
  const isAuditActive = location.pathname === '/reviewer/audit';
  const isAnalyticsActive = location.pathname === '/reviewer/analytics';

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-slate-800 font-sans antialiased">
      {/* ─── DESKTOP LEFT SIDEBAR ────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex-shrink-0 z-20">
        {/* Brand / Application Identity */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800/80 bg-slate-950/40">
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
              <p className="text-[10px] text-slate-400 font-medium">
                Triage Intelligence
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
          {/* Main Navigation */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Navigation
            </div>
            <nav className="space-y-1">
              {/* Overview */}
              <Link
                to="/reviewer"
                className={`flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  isOverviewActive
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-950/40 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <LayoutDashboard size={16} className={isOverviewActive ? 'text-white' : 'text-slate-400'} />
                <span>Overview</span>
              </Link>

              {/* Complaint Queue */}
              <a
                href="/reviewer#queue"
                className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  isQueueActive
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-950/40 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Inbox size={16} className={isQueueActive ? 'text-white' : 'text-slate-400'} />
                  <span>Complaint Queue</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-teal-400 px-1.5 py-0.5 rounded font-mono">
                  Live
                </span>
              </a>
            </nav>
          </div>

          {/* Intelligence Modules (Upcoming / Phase 9) */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Modules
            </div>
            <div className="space-y-1">
              {/* AI Audit & Benchmark */}
              <Link
                to="/reviewer/audit"
                className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  isAuditActive
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-950/40 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
                title="AI Audit, Calibration & Offline Benchmarks"
              >
                <div className="flex items-center gap-3">
                  <Sparkles size={16} className={isAuditActive ? 'text-white' : 'text-teal-400'} />
                  <span>AI Audit & Benchmark</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-semibold bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/30">
                  New
                </span>
              </Link>

              {/* Analytics */}
              <Link
                to="/reviewer/analytics"
                className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  isAnalyticsActive
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-950/40 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
                title="Executive Operations & Triage Analytics"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 size={16} className={isAnalyticsActive ? 'text-white' : 'text-teal-400'} />
                  <span>Executive Analytics</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-semibold bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/30">
                  Live
                </span>
              </Link>

              {/* Settings */}
              <div
                className="flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-400 cursor-not-allowed select-none rounded-lg hover:bg-slate-800/30 opacity-70"
                title="Triage SLA & Routing Policy Settings (Planned)"
              >
                <div className="flex items-center gap-3">
                  <Settings size={16} className="text-slate-400" />
                  <span>Settings</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-semibold bg-slate-800/80 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                  Upcoming
                </span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="pt-2 border-t border-slate-800">
            <Link
              to="/"
              className="flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-400 hover:text-teal-300 hover:bg-slate-800/50 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <ExternalLink size={14} />
                <span>Citizen Portal</span>
              </div>
              <ChevronRight size={12} />
            </Link>
          </div>
        </div>

        {/* Sidebar Footer — Reviewer Profile */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <div className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
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
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition-colors focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── MOBILE DRAWER OVERLAY ───────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 bg-slate-900 border-r border-slate-800 flex flex-col p-4 text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white">
                  <ShieldCheck size={18} />
                </div>
                <span className="font-bold text-white text-sm">CivicResolve AI</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 py-4 space-y-1">
              <Link
                to="/reviewer"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white hover:bg-slate-800"
              >
                <LayoutDashboard size={18} className="text-teal-400" />
                <span>Overview</span>
              </Link>
              <a
                href="/reviewer#queue"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                <Inbox size={18} className="text-teal-400" />
                <span>Complaint Queue</span>
              </a>
              <Link
                to="/reviewer/audit"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                <Sparkles size={18} className="text-teal-400" />
                <span>AI Audit &amp; Benchmark</span>
              </Link>
              <Link
                to="/reviewer/analytics"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                <BarChart3 size={18} className="text-teal-400" />
                <span>Executive Analytics</span>
              </Link>
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                <ExternalLink size={18} className="text-slate-400" />
                <span>Citizen Public Portal</span>
              </Link>
            </nav>

            <div className="pt-4 border-t border-slate-800">
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
        {/* Top Navigation Bar */}
        <header className="h-16 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200/80 sticky top-0 z-10 flex items-center justify-between gap-4 shadow-sm">
          {/* Left: Mobile hamburger & Context Header */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Open sidebar menu"
            >
              <Menu size={20} />
            </button>

            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Reviewer Portal</span>
                {isDetailActive ? (
                  <>
                    <ChevronRight size={12} className="text-slate-400" />
                    <span className="text-teal-700 font-semibold">Case Investigation</span>
                  </>
                ) : (
                  <>
                    <ChevronRight size={12} className="text-slate-400" />
                    <span className="text-slate-900 font-medium">Dashboard</span>
                  </>
                )}
              </div>
              <h2 className="text-sm font-bold text-slate-900 hidden sm:block tracking-tight">
                {title || 'Triage & Queue Management'}
              </h2>
              {subtitle && (
                <p className="text-[11px] text-slate-500 hidden sm:block">
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
              className="w-full text-xs px-3.5 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-slate-500 flex items-center justify-between transition-all shadow-inner group"
            >
              <div className="flex items-center gap-2.5 truncate">
                <Search size={15} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                <span className="truncate">Search complaint by ID, category, or command...</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] text-slate-500 shadow-2xs">
                  Ctrl+K
                </kbd>
              </div>
            </button>
          </div>

          {/* Right: Actions & User Info */}
          <div className="flex items-center gap-3">
            {/* Live Header Telemetry Pill */}
            {systemStatus && (
              <div
                className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-mono"
                title={`Database Schema: ${systemStatus.databaseSchemaVersion || 'V6'} • Latency: ${systemStatus.nlpProbeLatencyMs != null ? `${systemStatus.nlpProbeLatencyMs.toFixed(1)}ms` : '—'} • Active Model: ${systemStatus.activeModelName || 'baseline'} • Server Time: ${systemStatus.serverTimestamp ? new Date(systemStatus.serverTimestamp).toLocaleTimeString() : '—'}`}
              >
                <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-bold text-[10px]">
                  {systemStatus.databaseSchemaVersion || 'V6'}
                </span>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      systemStatus.nlpServiceReachable
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span className={systemStatus.nlpServiceReachable ? 'text-slate-700 font-medium' : 'text-rose-600 font-bold'}>
                    {systemStatus.nlpServiceReachable
                      ? `NLP ${systemStatus.nlpProbeLatencyMs != null ? `${systemStatus.nlpProbeLatencyMs.toFixed(0)}ms` : 'UP'}`
                      : 'NLP Offline'}
                  </span>
                </div>
              </div>
            )}

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
            <span className="font-semibold text-slate-800">CivicResolve AI</span> — Consumer Finance Complaint Triage & Decision Support System.
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
