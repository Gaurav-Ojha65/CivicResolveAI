import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import {
  X,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { GrievanceDetailResponse } from '../../../types/grievance';
import { Button } from '../../../components/ui/Button';

export interface QuickPeekDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  grievanceId: string | null;
  detail: GrievanceDetailResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

const tokenContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02,
    },
  },
};

const tokenItemVariants: Variants = {
  hidden: { opacity: 0, y: 3, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 450, damping: 28 },
  },
};

export const QuickPeekDrawer: React.FC<QuickPeekDrawerProps> = ({
  isOpen,
  onClose,
  grievanceId,
  detail,
  isLoading,
  error,
  onRetry,
  triggerRef,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus management & Escape listener
  useEffect(() => {
    if (isOpen) {
      const prevActive = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      // Prevent background scrolling while open
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = originalOverflow;
        // Restore focus to trigger element if available
        if (triggerRef?.current) {
          triggerRef.current.focus();
        } else if (prevActive && typeof prevActive.focus === 'function') {
          prevActive.focus();
        }
      };
    }
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const pred = detail?.originalPrediction;
  const topPos = pred?.explanation?.topPositiveFeatures?.slice(0, 6) || [];
  const topNeg = pred?.explanation?.topNegativeFeatures?.slice(0, 6) || [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="quick-peek-title">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex sm:pl-10">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="w-full sm:w-screen sm:max-w-lg bg-white border-l border-slate-200/90 shadow-2xl flex flex-col max-w-[100vw]"
        >
          {/* Header */}
          <div className="h-16 px-4 sm:px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0" aria-hidden="true" />
              <h2 id="quick-peek-title" className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight font-mono uppercase truncate">
                Quick Peek
              </h2>
              {grievanceId && (
                <span className="font-mono text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 shrink-0 tabular-nums">
                  #{grievanceId.substring(0, 8)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {detail && (
                <Link
                  to={`/reviewer/grievances/${detail.id}`}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <Sparkles size={12} className="text-teal-200 shrink-0" />
                  <span>Open Investigation Lab</span>
                  <ArrowRight size={11} className="shrink-0" />
                </Link>
              )}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
            {isLoading ? (
              <div data-testid="quick-peek-skeleton" className="space-y-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                <div className="space-y-2">
                  <div className="h-3.5 bg-slate-200 rounded w-full"></div>
                  <div className="h-3.5 bg-slate-200 rounded w-5/6"></div>
                  <div className="h-3.5 bg-slate-200 rounded w-4/6"></div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="h-16 bg-slate-200 rounded-lg"></div>
                  <div className="h-16 bg-slate-200 rounded-lg"></div>
                  <div className="h-16 bg-slate-200 rounded-lg"></div>
                </div>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle size={15} className="text-red-600" />
                  <span>Failed to load grievance details</span>
                </div>
                <p className="text-red-700">{error}</p>
                {onRetry && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onRetry}
                    className="mt-2 text-xs bg-white text-red-800 border-red-200 hover:bg-red-50"
                  >
                    <RotateCcw size={12} className="mr-1.5" />
                    Retry
                  </Button>
                )}
              </div>
            ) : detail ? (
              <div data-testid="quick-peek-content" className="space-y-5">
                {/* ID & Model Provenance Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/90 text-xs font-mono">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-slate-500">ID:</span>
                    <span className="font-bold text-slate-800 select-all truncate">
                      {detail.id}
                    </span>
                  </div>
                  {pred?.modelUsed && (
                    <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200/80 font-semibold text-[11px] shrink-0">
                      {pred.modelUsed} {pred.modelVersion ? `v${pred.modelVersion}` : ''}
                    </span>
                  )}
                </div>

                {/* Consumer Narrative Snippet */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Consumer Narrative Snippet
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {detail.narrative?.length || 0} characters
                    </span>
                  </div>
                  <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 text-slate-700 text-xs leading-relaxed font-sans shadow-2xs">
                    &ldquo;{detail.narrative}&rdquo;
                  </div>
                </div>

                {/* Classification Metrics Bento Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Category & Confidence */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Classification
                    </span>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-xs font-bold text-slate-900 truncate" title={pred?.predictedCategory || detail.assignedCategory}>
                        {pred?.predictedCategory || detail.assignedCategory}
                      </span>
                      <span className="text-xs font-mono font-bold text-teal-800 tabular-nums shrink-0">
                        {pred ? `${Math.round(pred.confidence * 100)}%` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Decision Margin */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Decision Margin
                    </span>
                    <div className="flex items-center justify-between font-mono text-xs tabular-nums">
                      <span className="font-semibold text-slate-800">
                        {pred ? `Δ ${(pred.margin * 100).toFixed(1)}%` : '—'}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          pred && pred.margin >= 0.15
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {pred && pred.margin >= 0.15 ? 'Robust' : 'Narrow'}
                      </span>
                    </div>
                  </div>

                  {/* Priority & Flag */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Triage Priority
                    </span>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">{detail.priority}</span>
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          detail.reviewRequired
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                        }`}
                      >
                        {detail.reviewRequired ? 'HITL Flag' : 'Auto'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Feature Attribution Chips */}
                {(topPos.length > 0 || topNeg.length > 0) && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                      <span>Feature Attribution Chips</span>
                      <span className="text-slate-500 font-mono text-[11px]">TF-IDF Weights</span>
                    </div>
                    <motion.div
                      variants={tokenContainerVariants}
                      initial="hidden"
                      animate="visible"
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      {topPos.map((feat, idx) => (
                        <motion.span
                          key={`pos-${idx}-${feat.feature}`}
                          variants={tokenItemVariants}
                          title={`Contribution: +${feat.contribution.toFixed(3)}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-teal-50 text-teal-800 border border-teal-200 tabular-nums"
                        >
                          <span>+{feat.feature}</span>
                          <span className="text-[10px] text-teal-700 font-bold opacity-80">
                            {feat.contribution > 0
                              ? `+${feat.contribution.toFixed(2)}`
                              : feat.contribution.toFixed(2)}
                          </span>
                        </motion.span>
                      ))}
                      {topNeg.map((feat, idx) => (
                        <motion.span
                          key={`neg-${idx}-${feat.feature}`}
                          variants={tokenItemVariants}
                          title={`Contribution: ${feat.contribution.toFixed(3)}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-red-50 text-red-800 border border-red-200 tabular-nums"
                        >
                          <span>{feat.feature}</span>
                          <span className="text-[10px] text-red-700 font-bold opacity-80">
                            {feat.contribution.toFixed(2)}
                          </span>
                        </motion.span>
                      ))}
                    </motion.div>
                  </div>
                )}

                {/* Case Actions Dock */}
                <div className="pt-2">
                  <Link
                    to={`/reviewer/grievances/${detail.id}`}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-xs"
                  >
                    <span>Proceed to Investigation Lab</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
