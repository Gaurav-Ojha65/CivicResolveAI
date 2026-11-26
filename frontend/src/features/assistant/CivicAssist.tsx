import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, ChevronDown, Copy, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { askAssistant, type AssistantAnswer } from './assistant-api';

type Message = { role: 'user'; text: string } | { role: 'assistant'; data: AssistantAnswer };
function starterQuestions(path: string): string[] {
  if (path === '/submit') return ['What should I include in a complaint?', 'Which categories are supported?', 'What does AI confidence mean?'];
  if (path === '/track') return ['How do I track a complaint?', 'What does pending review mean?', 'Why keep the tracking secret private?'];
  if (path.startsWith('/reviewer/grievances/')) return ['What does classification confidence mean?', 'What is the top-two probability margin?', 'What triggers human review?'];
  if (path === '/reviewer/audit') return ['How do the two models differ?', 'What does calibration mean?', 'What is macro F1?'];
  if (path === '/reviewer/analytics') return ['What do analytics counts mean?', 'How is review history recorded?'];
  if (path === '/reviewer') return ['How does the reviewer queue work?', 'What triggers human review?', 'Where is audit history?'];
  return ['How do I submit a complaint?', 'How do I track it?', 'What does AI confidence mean?'];
}
const allowedRoutes = new Set(['/', '/submit', '/track', '/reviewer', '/reviewer/analytics', '/reviewer/audit']);

function pageContext(path: string): string {
  if (/^\/reviewer\/grievances\/[^/]+$/.test(path)) return '/reviewer/grievances';
  return allowedRoutes.has(path) ? path : '/';
}

export function CivicAssist() {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [contextQuestion, setContextQuestion] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [mode, setMode] = useState<'simple' | 'technical'>('simple');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const previousReviewer = useRef(false);
  const previouslyOpen = useRef(false);
  const lastQuestion = useRef('');
  const generation = useRef(0);

  const reviewer = pathname.startsWith('/reviewer') && pathname !== '/reviewer/login' && isAuthenticated;
  useEffect(() => {
    if (previousReviewer.current && !reviewer) {
      clear(); setOpen(false);
    }
    previousReviewer.current = reviewer;
  }, [reviewer]);
  useEffect(() => {
    const listener = (event: Event) => {
      const question = (event as CustomEvent<string>).detail;
      if (typeof question === 'string') { setOpen(true); setContextQuestion(question); }
    };
    window.addEventListener('civicassist:explain', listener);
    return () => window.removeEventListener('civicassist:explain', listener);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open && previouslyOpen.current) launcher.current?.focus();
    previouslyOpen.current = open;
  }, [open]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages, busy]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (contextQuestion) { void send(contextQuestion); setContextQuestion(null); }
  }, [contextQuestion]);

  async function send(question = draft) {
    const clean = question.trim();
    if (!clean || busy || clean.length > 500) return;
    lastQuestion.current = clean;
    const prior = [...messages].reverse().find((message): message is Extract<Message, { role: 'assistant' }> => message.role === 'assistant');
    setMessages(current => [...current, { role: 'user', text: clean }]);
    setDraft(''); setError(''); setBusy(true);
    const controller = new AbortController(); abort.current = controller;
    const requestGeneration = generation.current;
    try {
      const data = await askAssistant(clean, pageContext(pathname), language, mode,
        prior?.data.knowledgeId ?? null, reviewer, controller.signal);
      if (!controller.signal.aborted && requestGeneration === generation.current) setMessages(current => [...current, { role: 'assistant', data }]);
    } catch {
      if (!controller.signal.aborted && requestGeneration === generation.current) setError('CivicAssist is unavailable. Try again when the connection returns.');
    } finally { if (requestGeneration === generation.current) { setBusy(false); abort.current = null; } }
  }

  function close() { setOpen(false); }
  function clear() { generation.current++; abort.current?.abort(); abort.current = null; setBusy(false); setMessages([]); setError(''); setDraft(''); setContextQuestion(null); lastQuestion.current = ''; input.current?.focus(); }

  return <div className={`fixed right-4 z-40 print:hidden sm:bottom-6 sm:right-6 ${pathname.startsWith('/reviewer/grievances/') ? 'bottom-20' : 'bottom-4'}`}>
    {!open && <button ref={launcher} type="button" aria-label="Open CivicAssist AI" onClick={() => setOpen(true)}
      className="flex min-h-12 items-center gap-2 rounded-full bg-ink-deep px-4 py-3 text-sm font-semibold text-white shadow-xl transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-trust motion-reduce:transition-none">
      <Bot size={21} aria-hidden="true" /> CivicAssist AI
    </button>}
    {open && <section role="dialog" aria-label="CivicAssist AI" onKeyDown={event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, select, a[href]'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}
      className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl ${expanded ? 'h-[min(85dvh,750px)] w-[min(92vw,650px)]' : 'h-[min(78dvh,600px)] w-[min(92vw,400px)]'}`}>
      <header className="flex items-center gap-3 bg-ink-deep px-4 py-3 text-white">
        <span className="grid size-9 place-items-center rounded-lg bg-teal-trust"><Bot size={20} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><h2 className="font-semibold">CivicAssist AI</h2><p className="text-xs text-slate-200">Read-only guide · do not share secrets</p></div>
        <button type="button" aria-label={expanded ? 'Shrink assistant' : 'Expand assistant'} onClick={() => setExpanded(!expanded)} className="rounded p-1 hover:bg-white/10"><ChevronDown className={expanded ? '' : 'rotate-180'} size={18} /></button>
        <button type="button" aria-label="Close assistant" onClick={close} className="rounded p-1 hover:bg-white/10"><X size={20} /></button>
      </header>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs">
        <label>Language <select aria-label="Assistant language" value={language} onChange={event => setLanguage(event.target.value as 'en' | 'hi')} className="ml-1 rounded border border-line p-1"><option value="en">English</option><option value="hi">हिन्दी</option></select></label>
        <label>Detail <select aria-label="Explanation detail" value={mode} onChange={event => setMode(event.target.value as 'simple' | 'technical')} className="ml-1 rounded border border-line p-1"><option value="simple">Simple</option><option value="technical">Technical</option></select></label>
        <button type="button" aria-label="Clear conversation" onClick={clear} className="ml-auto rounded p-2 hover:bg-canvas"><Trash2 size={16} /></button>
      </div>
      <div ref={scroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && <div className="space-y-4"><p className="text-sm leading-relaxed text-ink-muted">Ask about submitting, tracking, complaint statuses, or how AI classification works. I cannot access or change your case.</p><div className="flex flex-wrap gap-2">{starterQuestions(pathname).map(question => <button key={question} type="button" onClick={() => void send(question)} className="rounded-full border border-teal-trust/30 px-3 py-2 text-left text-xs text-teal-trust hover:bg-teal-50">{question}</button>)}</div></div>}
        {messages.map((message, index) => message.role === 'user'
          ? <p key={index} className="ml-8 rounded-xl bg-ink-deep p-3 text-sm text-white">{message.text}</p>
          : <article key={index} className="mr-5 space-y-2 rounded-xl bg-canvas p-3 text-sm text-ink"><p className="whitespace-pre-wrap leading-relaxed">{message.data.answer}</p><p className="text-xs text-ink-muted">{message.data.responseMode === 'local' ? 'Verified local knowledge' : `Generated explanation · ${message.data.model ?? 'configured model'}`}</p>
            {message.data.sources.length > 0 && <div className="text-xs text-ink-muted">Sources: <ul className="list-inside list-disc">{message.data.sources.map(source => <li key={source.id}>{source.reference === 'README.md' || /^docs\/[A-Za-z0-9_./-]+$/.test(source.reference)
              ? <a className="underline hover:text-teal-trust" href={`https://github.com/Gaurav-Ojha65/CivicResolveAI/blob/main/${source.reference}`} target="_blank" rel="noopener noreferrer">{source.title}</a>
              : <span title={source.reference}>{source.title}</span>}</li>)}</ul></div>}
            {message.data.warning && <p className="text-xs text-ink-muted">{message.data.warning}</p>}
            {message.data.followUps.length > 0 && <div className="flex flex-wrap gap-1">{message.data.followUps.map(question => <button key={question} type="button" onClick={() => void send(question)} className="rounded-full border border-line px-2 py-1 text-xs text-ink-muted hover:bg-white">{question}</button>)}</div>}
            <div className="flex flex-wrap gap-2">{message.data.navigation.filter(item => allowedRoutes.has(item.route) || item.route === '/reviewer/grievances').map(item => <Link key={item.route} to={item.route === '/reviewer/grievances' ? '/reviewer' : item.route} className="text-xs font-semibold text-teal-trust underline">{item.label}</Link>)}</div>
            <button type="button" aria-label="Copy answer" onClick={() => void navigator.clipboard?.writeText(message.data.answer)} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"><Copy size={13} /> Copy</button>
          </article>)}
        {busy && <p role="status" className="text-sm text-ink-muted">CivicAssist is finding an answer…</p>}
        {error && <div role="alert" className="text-sm text-red-700">{error}<button type="button" onClick={() => void send(lastQuestion.current)} className="ml-2 underline"><RotateCcw size={13} className="inline" /> Retry</button></div>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void send(); }} className="border-t border-line bg-white p-3">
        <div className="flex items-end gap-2"><textarea ref={input} rows={2} maxLength={500} aria-label="Ask CivicAssist" placeholder="Ask a question about CivicResolve…" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} className="min-h-11 max-h-24 min-w-0 flex-1 resize-none rounded-lg border border-line p-2 text-sm focus:outline-teal-trust" /><button type="submit" disabled={busy || !draft.trim()} aria-label="Send question" className="grid size-11 place-items-center rounded-lg bg-teal-trust text-white disabled:opacity-50"><Send size={18} /></button></div>
        <p className="mt-2 text-[11px] text-ink-muted">Answers guide this demo; they are not financial or legal advice.</p>
      </form>
    </section>}
  </div>;
}
