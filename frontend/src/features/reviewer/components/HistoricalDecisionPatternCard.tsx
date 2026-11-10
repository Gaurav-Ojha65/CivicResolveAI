import React from 'react';
import { AlertTriangle, CheckCircle2, History, Scale } from 'lucide-react';
import { SemanticPrecedentItem } from '../../../types/grievance';

interface HistoricalDecisionPatternCardProps {
  precedents: SemanticPrecedentItem[];
  totalCandidates: number;
}

export const HistoricalDecisionPatternCard: React.FC<HistoricalDecisionPatternCardProps> = ({
  precedents,
  totalCandidates,
}) => {
  const totalRetrieved = precedents.length;
  const categoryAgreementCount = precedents.filter(
    (p) => p.predictedCategory && p.assignedCategory && p.predictedCategory === p.assignedCategory
  ).length;
  const categoryAgreementRate =
    totalRetrieved > 0 ? Math.round((categoryAgreementCount / totalRetrieved) * 100) : 0;

  const workflowApprovedCount = precedents.filter((p) => p.status === 'APPROVED').length;
  const workflowOverriddenCount = precedents.filter((p) => p.status === 'OVERRIDDEN').length;

  const priorityOnlyOverrides = precedents.filter(
    (p) => p.status === 'OVERRIDDEN' && p.predictedCategory && p.assignedCategory && p.predictedCategory === p.assignedCategory
  ).length;

  const maxSimilarity =
    totalRetrieved > 0 ? Math.max(...precedents.map((p) => p.similarityScore)) : 0;

  const isInsufficientEvidence = totalRetrieved < 2 || maxSimilarity < 0.25;

  return (
    <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Scale size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
              Historical Decision Pattern Analysis
            </h3>
            <p className="text-[11px] text-slate-500">
              Correlations across {totalRetrieved} retrieved precedents (pool of {totalCandidates} cases).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full shadow-2xs">
            n = {totalRetrieved} / {totalCandidates}
          </span>
        </div>
      </div>

      {/* Evidence Sufficiency Warning */}
      {isInsufficientEvidence && (
        <div className="p-3.5 bg-amber-50/90 border border-amber-300/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 shadow-2xs">
          <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-amber-950">Evidence Sufficiency Warning</p>
            <p className="text-[11px] leading-relaxed text-amber-900/90">
              Insufficient historical precedent evidence (small sample size or lexical similarity &lt; 0.25). Historical correlation does not establish legal or routing correctness.
            </p>
          </div>
        </div>
      )}

      {/* Metric Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Category Agreement Card */}
        <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium text-[11px]">
              Historical Category Agreement
            </span>
            <span className="font-mono font-bold text-sm text-indigo-700 tabular-nums">
              {categoryAgreementRate}%
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <CheckCircle2 size={13} className="text-indigo-600" />
            <span>
              {categoryAgreementCount} of {totalRetrieved} cases matched AI category recommendation
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono pt-0.5">
            computed via: predictedCategory === assignedCategory
          </p>
        </div>

        {/* Workflow Adjudication Actions */}
        <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium text-[11px]">
              Workflow Action Counts
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                APP: {workflowApprovedCount}
              </span>
              <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                OVR: {workflowOverriddenCount}
              </span>
            </div>
          </div>

          {priorityOnlyOverrides > 0 ? (
            <div className="text-[11px] text-amber-900 bg-amber-50/70 p-1.5 rounded-lg border border-amber-200/60 leading-snug">
              <strong>Priority-Only Override Notice:</strong> {priorityOnlyOverrides} case(s) maintained AI category and adjusted priority only.
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 flex items-center gap-1 pt-1">
              <History size={13} className="text-slate-400" />
              <span>Full category &amp; priority disposition breakdown.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
