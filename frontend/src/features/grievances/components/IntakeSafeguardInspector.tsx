/**
 * IntakeSafeguardInspector.tsx
 *
 * Sticky right-column compliance inspector for the SubmitGrievancePage
 * split-screen layout (lg:col-span-5).
 *
 * Displays:
 *  1. Narrative Context Depth — live visual progress bar driven by word count.
 *  2. Client-Side Privacy Scanner — live PII detection status card.
 *  3. 4-Stage Compliance Workflow Stepper.
 *
 * All data is passed as props; no API calls or state of its own.
 */

import React from 'react';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  FileSearch,
  UserCheck,
  Gavel,
  Lock,
} from 'lucide-react';

// ── Narrative depth scoring ─────────────────────────────────────────────────
interface DepthLevel {
  minWords: number;
  label: string;
  color: string;        // Tailwind text colour
  barColor: string;     // Tailwind bg colour for the bar fill
  pct: number;          // bar fill percentage (0-100)
  icon: React.ReactNode;
}

function getNarrativeDepth(wordCount: number): DepthLevel {
  if (wordCount === 0) {
    return {
      minWords: 0, label: 'No narrative yet', color: 'text-slate-500',
      barColor: 'bg-slate-400', pct: 0,
      icon: <Circle className="w-4 h-4" aria-hidden="true" />,
    };
  }
  if (wordCount < 20) {
    return {
      minWords: 1, label: `Brief — add more context (${wordCount}/20 words)`,
      color: 'text-amber-700', barColor: 'bg-amber-500', pct: Math.round((wordCount / 20) * 33),
      icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />,
    };
  }
  if (wordCount < 100) {
    return {
      minWords: 20, label: `Good detail for triage (${wordCount}/100 words)`,
      color: 'text-teal-700', barColor: 'bg-teal-500', pct: 33 + Math.round(((wordCount - 20) / 80) * 34),
      icon: <CheckCircle2 className="w-4 h-4" aria-hidden="true" />,
    };
  }
  return {
    minWords: 100, label: `Comprehensive narrative (${wordCount} words)`,
    color: 'text-emerald-700', barColor: 'bg-emerald-500', pct: Math.min(100, 67 + Math.round(((wordCount - 100) / 150) * 33)),
    icon: <CheckCircle2 className="w-4 h-4" aria-hidden="true" />,
  };
}

// ── Compliance stepper ──────────────────────────────────────────────────────
interface StepperStage {
  id: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const STEPPER_STAGES: StepperStage[] = [
  {
    id: 1,
    icon: <FileSearch className="w-4 h-4" aria-hidden="true" />,
    title: 'Public Intake',
    description: 'Citizen submits complaint narrative via secure public portal.',
  },
  {
    id: 2,
    icon: <Clock className="w-4 h-4" aria-hidden="true" />,
    title: 'NLP Auto-Classification',
    description: 'AI pipeline assigns CFPB category, priority, and safety gate flags.',
  },
  {
    id: 3,
    icon: <UserCheck className="w-4 h-4" aria-hidden="true" />,
    title: 'Human Review',
    description: 'Trained reviewer validates or overrides the AI routing decision.',
  },
  {
    id: 4,
    icon: <Gavel className="w-4 h-4" aria-hidden="true" />,
    title: 'Final Adjudication',
    description: 'Complaint status recorded in audit log; citizen can track outcome.',
  },
];

// ── Component ───────────────────────────────────────────────────────────────
interface IntakeSafeguardInspectorProps {
  wordCount: number;
  hasPii: boolean;
  charCount: number;
  maxLength: number;
}

export const IntakeSafeguardInspector: React.FC<IntakeSafeguardInspectorProps> = ({
  wordCount,
  hasPii,
  charCount,
  maxLength,
}) => {
  const depth = getNarrativeDepth(wordCount);
  const charPct = Math.min(100, Math.round((charCount / maxLength) * 100));
  const charWarning = charCount > maxLength * 0.9;

  return (
    <aside
      aria-label="Intake safeguard inspector"
      className="space-y-4"
    >
      {/* ── Narrative Context Depth ───────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <FileSearch className="w-4 h-4 text-teal-trust shrink-0" aria-hidden="true" />
          <span className="text-xs font-bold text-ink-deep">Narrative Context Depth</span>
        </div>

        {/* Progress bar */}
        <div
          className="h-3 w-full rounded-full bg-canvas border border-border overflow-hidden mb-2"
          role="progressbar"
          aria-valuenow={depth.pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Narrative context depth"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${depth.barColor}`}
            style={{ width: `${depth.pct}%` }}
          />
        </div>

        {/* Label */}
        <div className={`flex items-center gap-1.5 text-xs font-medium ${depth.color}`}>
          {depth.icon}
          <span>{depth.label}</span>
        </div>

        {/* Guidance tiers */}
        <div className="mt-3 space-y-1">
          {[
            { threshold: 20,  label: '20 words — minimum for AI routing', met: wordCount >= 20 },
            { threshold: 100, label: '100 words — comprehensive for reviewer', met: wordCount >= 100 },
          ].map(({ threshold, label, met }) => (
            <div key={threshold} className="flex items-center gap-1.5 text-[11px]">
              {met
                ? <CheckCircle2 className="w-3 h-3 text-teal-trust shrink-0" aria-hidden="true" />
                : <Circle className="w-3 h-3 text-border shrink-0" aria-hidden="true" />
              }
              <span className={met ? 'text-teal-trust font-medium' : 'text-ink-muted'}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Character count */}
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px]">
          <span className="text-ink-muted">Character usage</span>
          <span className={`font-mono font-semibold ${charWarning ? 'text-semantic-warning-fg' : 'text-ink-muted'}`}>
            {charCount} of {maxLength}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-canvas border border-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${charWarning ? 'bg-amber-500' : 'bg-teal-trust'}`}
            style={{ width: `${charPct}%` }}
          />
        </div>
      </div>

      {/* ── Client-Side Privacy Scanner ───────────────────────────────── */}
      <div className={[
        'rounded-xl border p-4 shadow-xs transition-all duration-300',
        hasPii
          ? 'border-amber-300/80 bg-amber-50'
          : 'border-border bg-surface',
      ].join(' ')}>
        <div className="flex items-center gap-2 mb-2">
          {hasPii
            ? <EyeOff className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            : <Eye className="w-4 h-4 text-teal-trust shrink-0" aria-hidden="true" />
          }
          <span className={`text-xs font-bold ${hasPii ? 'text-amber-900' : 'text-ink-deep'}`}>
            Client-Side Privacy Scanner
          </span>
          <span className={[
            'ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold',
            hasPii
              ? 'bg-amber-200 text-amber-900'
              : 'bg-teal-trust/10 text-teal-trust',
          ].join(' ')}>
            {hasPii ? 'PII Detected' : 'Clear'}
          </span>
        </div>

        {hasPii ? (
          <p className="text-xs text-amber-800 leading-relaxed">
            Potential SSN, card, or phone number detected. Use the{' '}
            <strong>Mask Sensitive Numbers</strong> button in the editor to redact
            before submitting.
          </p>
        ) : (
          <p className="text-xs text-ink-muted leading-relaxed">
            No sensitive number patterns detected in your narrative. Scan runs
            locally — your text is never sent to a third party for privacy analysis.
          </p>
        )}

        <div className="mt-3 pt-3 border-t border-border/50 flex items-start gap-1.5">
          <Lock className="w-3 h-3 text-ink-muted/60 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[10px] text-ink-muted/80 leading-relaxed">
            Privacy scan is 100% client-side. Checks SSN (XXX-XX-XXXX), 16-digit cards,
            and phone numbers via regex — no external service is called.
          </p>
        </div>
      </div>

      {/* ── Compliance Workflow Stepper ───────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-teal-trust shrink-0" aria-hidden="true" />
          <span className="text-xs font-bold text-ink-deep">Compliance Workflow</span>
        </div>

        <ol className="space-y-0" aria-label="4-stage compliance workflow">
          {STEPPER_STAGES.map((stage, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === STEPPER_STAGES.length - 1;
            const isActive = isFirst; // current stage is always Intake

            return (
              <li key={stage.id} className="flex gap-3">
                {/* Timeline spine */}
                <div className="flex flex-col items-center">
                  <div className={[
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 text-xs font-bold transition-colors',
                    isActive
                      ? 'bg-teal-trust border-teal-trust text-white'
                      : 'bg-canvas border-border text-ink-muted',
                  ].join(' ')}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {isActive
                      ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      : <span>{stage.id}</span>
                    }
                  </div>
                  {!isLast && (
                    <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-[20px]" aria-hidden="true" />
                  )}
                </div>

                {/* Step content */}
                <div className={`pb-4 pt-0.5 min-w-0 ${isLast ? '' : ''}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-xs font-bold ${isActive ? 'text-teal-trust' : 'text-ink-muted'}`}>
                      {stage.title}
                    </span>
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded-full bg-teal-trust/10 text-teal-trust text-[9px] font-bold">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    {stage.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* AI disclosure footer */}
        <div className="mt-2 pt-3 border-t border-border">
          <p className="text-[10px] text-ink-muted leading-relaxed">
            <strong className="text-ink-deep">AI Disclosure:</strong> Step 2 produces
            uncalibrated probability estimates and a preliminary routing suggestion —
            not a legal determination. All routing is subject to human reviewer
            adjudication before any final decision.
          </p>
        </div>
      </div>
    </aside>
  );
};
