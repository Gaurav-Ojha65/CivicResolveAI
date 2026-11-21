import { BookOpen, ShieldCheck } from 'lucide-react';

interface IntakeSafeguardInspectorProps {
  wordCount: number;
  hasPii: boolean;
}

export function IntakeSafeguardInspector({ wordCount, hasPii }: IntakeSafeguardInspectorProps) {
  return (
    <aside aria-label="Submission guidance" className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen size={18} aria-hidden="true" className="text-teal-trust" />Before you submit</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">Include when the issue began and any steps you took with the provider. Approximate dates are fine.</p>
      <p className="mt-2 text-sm font-medium tabular-nums">Draft length · {wordCount} {wordCount === 1 ? 'word' : 'words'}</p>
      <h3 className="mt-5 flex items-center gap-2 border-t border-line pt-5 font-semibold"><ShieldCheck size={17} className="text-teal-trust" aria-hidden="true" />Privacy check</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{hasPii
        ? 'A number matches a common phone, card or Social Security number format.'
        : 'The browser checks for common phone, card and Social Security number formats.'} Review the text yourself for other identifying details.</p>
      <h3 className="mt-5 border-t border-line pt-5 font-semibold">What happens next?</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">The system will automatically assign a preliminary product category and priority. Flagged cases go to a reviewer. Other cases can be routed automatically.</p>
    </aside>
  );
}
