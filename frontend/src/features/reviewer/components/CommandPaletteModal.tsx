import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Sparkles,
  BarChart3,
  ExternalLink,
  Database,
  ArrowRight,
  CornerDownLeft,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { listGrievances, seedDemoTelemetry } from '../../../lib/api/endpoints';
import { GrievanceResponse, SystemStatusResponse } from '../../../types/grievance';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemStatus: SystemStatusResponse | null;
  onStatusRefresh?: () => void;
}

interface PaletteAction {
  id: string;
  title: string;
  subtitle: string;
  category: 'ROUTE' | 'ACTION' | 'CASE';
  icon: React.ReactNode;
  perform: () => void;
  disabled?: boolean;
  badge?: string;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  systemStatus,
  onStatusRefresh,
}) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<GrievanceResponse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [confirmSeedOpen, setConfirmSeedOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHighlightedIndex(0);
      setConfirmSeedOpen(false);
      setSeedNotice(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search for complaint ID or category
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await listGrievances({ search: trimmed, size: 5 });
        setSearchResults(res.content || []);
      } catch (err) {
        console.error('Command palette search error:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSeedExecution = async () => {
    setIsSeeding(true);
    setSeedNotice(null);
    try {
      const res = await seedDemoTelemetry(true);
      setSeedNotice(res.message || 'Demo dataset initialized successfully.');
      setConfirmSeedOpen(false);
      if (onStatusRefresh) {
        onStatusRefresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to seed demo data';
      setSeedNotice(`Error: ${msg}`);
    } finally {
      setIsSeeding(false);
    }
  };

  // Base navigation routes
  const staticRoutes: PaletteAction[] = [
    {
      id: 'route-overview',
      title: 'Reviewer Overview & Queue',
      subtitle: 'Triage pending consumer grievances, SLA alerts, and real-time workload',
      category: 'ROUTE',
      icon: <LayoutDashboard size={16} className="text-teal-600" />,
      perform: () => {
        navigate('/reviewer');
        onClose();
      },
    },
    {
      id: 'route-audit',
      title: 'AI Audit & Model Calibration',
      subtitle: 'Explore 8×8 confusion matrix, reliability diagrams, and held-out test benchmarks',
      category: 'ROUTE',
      icon: <Sparkles size={16} className="text-teal-600" />,
      perform: () => {
        navigate('/reviewer/audit');
        onClose();
      },
    },
    {
      id: 'route-analytics',
      title: 'Executive Analytics & Telemetry',
      subtitle: 'SLA aging compliance, category volume breakdown, and daily intake trends',
      category: 'ROUTE',
      icon: <BarChart3 size={16} className="text-teal-600" />,
      perform: () => {
        navigate('/reviewer/analytics');
        onClose();
      },
    },
    {
      id: 'route-intake',
      title: 'Citizen Public Intake Portal',
      subtitle: 'Test public anonymous complaint submission and real-time inference',
      category: 'ROUTE',
      icon: <ExternalLink size={16} className="text-slate-500" />,
      perform: () => {
        navigate('/submit');
        onClose();
      },
    },
  ];

  // Actions
  const isAlreadySeeded = Boolean(systemStatus?.demoBatchSeeded);
  const actions: PaletteAction[] = [
    {
      id: 'action-seed-demo',
      title: 'Load Synthetic Demo Cases',
      subtitle: isAlreadySeeded
        ? 'Synthetic dataset already initialized in database (32 cases across 8 categories)'
        : 'Seed 32 realistic CFPB grievances across 8 categories with clock-driven SLA distribution',
      category: 'ACTION',
      icon: <Database size={16} className={isAlreadySeeded ? 'text-slate-400' : 'text-amber-600'} />,
      disabled: isAlreadySeeded,
      badge: isAlreadySeeded ? 'Already Seeded' : 'Action',
      perform: () => {
        if (!isAlreadySeeded) {
          setConfirmSeedOpen(true);
        }
      },
    },
  ];

  // Search Results Actions
  const caseActions: PaletteAction[] = searchResults.map((item) => ({
    id: `case-${item.id}`,
    title: `${item.assignedCategory}`,
    subtitle: `ID: ${item.id.slice(0, 8)}... • Priority: ${item.priority} • Status: ${item.status}`,
    category: 'CASE',
    icon: <FileText size={16} className="text-teal-700" />,
    badge: item.status,
    perform: () => {
      navigate(`/reviewer/grievances/${item.id}`);
      onClose();
    },
  }));

  // Filter actions based on query
  const queryLower = query.toLowerCase().trim();
  const filteredRoutes = staticRoutes.filter(
    (r) =>
      r.title.toLowerCase().includes(queryLower) ||
      r.subtitle.toLowerCase().includes(queryLower)
  );

  const filteredActions = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(queryLower) ||
      a.subtitle.toLowerCase().includes(queryLower)
  );

  // Combined flat list for keyboard navigation
  const allItems: PaletteAction[] = [
    ...caseActions,
    ...filteredRoutes,
    ...filteredActions,
  ];

  // Keep highlightedIndex in bounds
  useEffect(() => {
    if (highlightedIndex >= allItems.length) {
      setHighlightedIndex(Math.max(0, allItems.length - 1));
    }
  }, [allItems.length, highlightedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (confirmSeedOpen) {
      if (e.key === 'Escape') {
        setConfirmSeedOpen(false);
      }
      return;
    }

    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, allItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + allItems.length) % Math.max(1, allItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = allItems[highlightedIndex];
      if (current && !current.disabled) {
        current.perform();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[80vh] text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <Search size={18} className="text-slate-400 flex-shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={allItems.length > 0}
            aria-controls="command-palette-results"
            placeholder="Search complaint ID, category, or command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          {isSearching && (
            <Loader2 size={16} className="text-teal-600 animate-spin ml-2 flex-shrink-0" />
          )}
          {query && !isSearching && (
            <button
              onClick={() => {
                setQuery('');
                setSearchResults([]);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Inline Confirmation Prompt for Seeding */}
        {confirmSeedOpen && (
          <div className="p-4 bg-amber-50 border-b border-amber-200 flex flex-col gap-2.5 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900">
                  Confirm Synthetic Telemetry Seeding
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  This action will persist 32 realistic synthetic CFPB complaints with SLA distributions. The operation is idempotent.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmSeedOpen(false)}
                disabled={isSeeding}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSeedExecution}
                disabled={isSeeding}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors flex items-center gap-1.5"
              >
                {isSeeding ? <Loader2 size={12} className="animate-spin" /> : null}
                <span>{isSeeding ? 'Seeding...' : 'Confirm & Seed'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Notice Banner */}
        {seedNotice && (
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
            <span>{seedNotice}</span>
          </div>
        )}

        {/* Action / Result Lists */}
        <div id="command-palette-results" role="listbox" className="flex-1 overflow-y-auto p-2 space-y-4">
          {allItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No matching routes, complaints, or actions found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {/* Complaints Search Matches */}
              {caseActions.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Complaints Found
                  </div>
                  <div className="space-y-0.5">
                    {caseActions.map((action, idx) => {
                      const isSelected = highlightedIndex === idx;
                      return (
                        <div
                          key={action.id}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => action.perform()}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-teal-50 text-teal-950 font-medium'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-7 h-7 rounded-lg bg-teal-100/60 flex items-center justify-center flex-shrink-0">
                              {action.icon}
                            </div>
                            <div className="overflow-hidden">
                              <p className="font-semibold text-slate-900 truncate">
                                {action.title}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono truncate">
                                {action.subtitle}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {action.badge && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-600">
                                {action.badge}
                              </span>
                            )}
                            <ArrowRight size={14} className="text-slate-300" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Navigation Routes */}
              {filteredRoutes.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Navigation Routes
                  </div>
                  <div className="space-y-0.5">
                    {filteredRoutes.map((action) => {
                      const overallIndex = allItems.indexOf(action);
                      const isSelected = highlightedIndex === overallIndex;
                      return (
                        <div
                          key={action.id}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => action.perform()}
                          onMouseEnter={() => setHighlightedIndex(overallIndex)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-teal-50 text-teal-950 font-medium'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                              {action.icon}
                            </div>
                            <div className="overflow-hidden">
                              <p className="font-semibold text-slate-900 truncate">
                                {action.title}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {action.subtitle}
                              </p>
                            </div>
                          </div>
                          <ArrowRight size={14} className="text-slate-300" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Operational Actions */}
              {filteredActions.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Operational Actions
                  </div>
                  <div className="space-y-0.5">
                    {filteredActions.map((action) => {
                      const overallIndex = allItems.indexOf(action);
                      const isSelected = highlightedIndex === overallIndex;
                      return (
                        <div
                          key={action.id}
                          role="option"
                          aria-selected={isSelected}
                          aria-disabled={action.disabled}
                          onClick={() => !action.disabled && action.perform()}
                          onMouseEnter={() => !action.disabled && setHighlightedIndex(overallIndex)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                            action.disabled
                              ? 'opacity-60 cursor-not-allowed text-slate-400 bg-slate-50/50'
                              : isSelected
                              ? 'bg-teal-50 text-teal-950 font-medium cursor-pointer'
                              : 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                              {action.icon}
                            </div>
                            <div className="overflow-hidden">
                              <p className="font-semibold text-slate-900 truncate">
                                {action.title}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {action.subtitle}
                              </p>
                            </div>
                          </div>
                          {action.badge && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                                action.disabled
                                  ? 'bg-slate-100 text-slate-500'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {action.badge}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] shadow-2xs">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] shadow-2xs">
                ↓
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] shadow-2xs">
                <CornerDownLeft size={10} className="inline" />
              </kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] shadow-2xs">
                esc
              </kbd>
              close
            </span>
          </div>

          <div className="font-mono text-[10px] text-slate-400">
            Schema: {systemStatus?.databaseSchemaVersion || 'V6'} • NLP: {systemStatus?.nlpServiceReachable ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>
    </div>
  );
};
