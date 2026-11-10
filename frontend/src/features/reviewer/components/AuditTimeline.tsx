import React from 'react';
import { History, Shield, User, ArrowRight, Clock } from 'lucide-react';
import { AuditHistoryItem } from '../../../types/grievance';

interface AuditTimelineProps {
  auditHistory?: AuditHistoryItem[];
  submittedAt?: string;
  initialPriority?: string;
  initialCategory?: string;
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({
  auditHistory = [],
  submittedAt,
  initialPriority,
  initialCategory,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <History size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Immutable Case Audit Trail
            </h3>
            <p className="text-[11px] text-slate-500">
              Cryptographically verified chronological transition events.
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono text-slate-400">
          {auditHistory.length} event{auditHistory.length !== 1 ? 's' : ''}
        </span>
      </div>

      {auditHistory.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400 italic space-y-1">
          <p>Initial automated intake recorded.</p>
          {submittedAt && (
            <p className="text-[10px] text-slate-400 font-mono">
              Submitted: {new Date(submittedAt).toLocaleString()} ({initialCategory || 'Auto'} &bull; {initialPriority || 'P'})
            </p>
          )}
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {auditHistory.map((item, index) => {
            const isSystem = item.actor.toLowerCase().includes('system');
            const isOverride = item.action === 'OVERRIDE';
            const isApprove = item.action === 'APPROVE';
            const isReject = item.action === 'REJECT';

            let dotColor = 'bg-slate-400';
            if (isSystem) dotColor = 'bg-teal-600 ring-4 ring-teal-100';
            else if (isApprove) dotColor = 'bg-emerald-600 ring-4 ring-emerald-100';
            else if (isOverride) dotColor = 'bg-amber-500 ring-4 ring-amber-100';
            else if (isReject) dotColor = 'bg-rose-600 ring-4 ring-rose-100';

            return (
              <div key={item.id || index} className="relative text-xs space-y-1.5">
                {/* Timeline node */}
                <span
                  className={`absolute -left-6 top-1 w-3 h-3 rounded-full ${dotColor} transition-all`}
                />

                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isSystem
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-teal-100 text-teal-800'
                      }`}
                    >
                      {isSystem ? <Shield size={10} /> : <User size={10} />}
                      {item.actor}
                    </span>

                    <span className="font-bold text-slate-900 font-mono">
                      {item.action}
                    </span>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>

                {/* State changes */}
                {(item.previousStatus || item.newStatus) && (
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600">
                    <span>{item.previousStatus || '—'}</span>
                    <ArrowRight size={10} className="text-slate-400" />
                    <span className="font-bold text-slate-900">{item.newStatus}</span>
                  </div>
                )}

                {/* Category changes */}
                {(item.previousCategory || item.newCategory) && (
                  <div className="text-[11px] text-slate-600">
                    <span className="text-slate-400">Category: </span>
                    <span className="font-medium text-slate-800">
                      {item.previousCategory ? `${item.previousCategory} → ` : ''}
                      {item.newCategory}
                    </span>
                  </div>
                )}

                {/* Priority changes */}
                {(item.previousPriority || item.newPriority) && (
                  <div className="text-[11px] text-slate-600">
                    <span className="text-slate-400">Priority: </span>
                    <span className="font-medium text-slate-800">
                      {item.previousPriority ? `${item.previousPriority} → ` : ''}
                      {item.newPriority}
                    </span>
                  </div>
                )}

                {/* Review Note */}
                {item.reviewNote && (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 text-slate-700 text-[11px] leading-relaxed italic">
                    &ldquo;{item.reviewNote}&rdquo;
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
