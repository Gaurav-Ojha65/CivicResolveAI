import { Bot } from 'lucide-react';
import { explainWithCivicAssist } from './assistant-api';

export function ExplainButton({ question }: { question: string }) {
  return <button type="button" onClick={() => explainWithCivicAssist(question)}
    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-teal-trust/30 px-3 py-1.5 text-xs font-semibold text-teal-trust hover:bg-teal-50">
    <Bot size={15} aria-hidden="true" /> Explain with CivicAssist
  </button>;
}
