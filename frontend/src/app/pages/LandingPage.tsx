import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ClipboardList, FolderOpen, KeyRound, ListFilter, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProductCategories } from '../../lib/api/endpoints';

const steps = [
  { title: 'Submit', icon: ClipboardList, text: 'Describe the financial product, what happened, and what you have already tried.' },
  { title: 'Classify', icon: ListFilter, text: 'The system suggests a product category and priority. Cases flagged for review enter the reviewer queue.' },
  { title: 'Track', icon: FolderOpen, text: 'Use the two credentials on your receipt to see your case status and any recorded review decisions.' },
];

const questions = [
  ['Do I need an account?', 'No. Submit a description and save the reference ID and tracking secret from your receipt. You need both to check your case again.'],
  ['What if I lose my tracking secret?', 'The secret is shown on the submission receipt and cannot be retrieved later. Keep the receipt somewhere private.'],
  ['Will a person review my complaint?', 'A reviewer must assess cases flagged for review. Other submissions can be routed automatically. The timeline shows review decisions when they are recorded.'],
  ['Will a submission contact my financial institution?', 'This demonstration records a case within CivicResolve AI. It does not send a complaint to your bank or a government agency.'],
];

function ProductCategories() {
  const [categories, setCategories] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    getProductCategories(controller.signal).then(
      ({ categories: labels }) => { if (!controller.signal.aborted) setCategories(labels); },
      () => { if (!controller.signal.aborted) setFailed(true); },
    );
    return () => controller.abort();
  }, [attempt]);

  return (
    <section aria-labelledby="categories-heading">
      <h2 id="categories-heading" className="text-2xl font-semibold tracking-tight">Supported financial products</h2>
      <p className="mt-3 max-w-xl text-ink-muted">Describe the issue in your own words. The classifier suggests a category from the service’s product list.</p>
      {failed ? (
        <div role="status" className="mt-5 text-sm text-ink-muted">The product list is unavailable. <button type="button" className="font-semibold text-teal-trust underline" onClick={() => setAttempt(n => n + 1)}>Try again</button></div>
      ) : categories === null ? <p role="status" className="mt-5 text-sm text-ink-muted">Loading supported products…</p>
        : categories.length === 0 ? <p role="status" className="mt-5 text-sm text-ink-muted">The service currently lists no products.</p>
        : <ul className="mt-6 grid gap-x-6 sm:grid-cols-2">{categories.map(category => <li key={category} className="flex items-start gap-2 border-t border-line py-3 text-sm font-medium"><Check size={15} className="mt-0.5 shrink-0 text-teal-trust" aria-hidden="true"/>{category}</li>)}</ul>}
    </section>
  );
}

function CasePreview() {
  return (
    <aside aria-labelledby="preview-heading" className="min-w-0 rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-ink px-5 py-4 text-white sm:px-7">
        <span className="inline-flex items-center gap-2 text-sm font-semibold"><FolderOpen size={18} aria-hidden="true"/>Case progress</span>
        <span className="rounded border border-white/35 px-2 py-1 text-xs font-medium">Illustrative example</span>
      </div>
      <div className="p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Complaint summary</p>
        <h2 id="preview-heading" className="mt-2 text-2xl font-semibold tracking-tight">Duplicate card charge</h2>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-900">Pending review</span>
          <span className="rounded-full border border-line px-3 py-1.5 font-medium text-ink-muted">Credit card</span>
        </div>
        <ol className="mt-6 space-y-4 border-t border-line pt-5">
          {[
            ['Complaint received', 'Reference and tracking secret issued.'],
            ['Product classified', 'A preliminary category was assigned.'],
            ['Awaiting review', 'The case is in the reviewer queue.'],
          ].map(([title, detail], i) => (
            <li key={title} className="relative flex gap-3">
              {i < 2 && <span aria-hidden="true" className="absolute left-3 top-6 h-full w-px bg-line" />}
              <span aria-hidden="true" className={'relative grid size-6 shrink-0 place-items-center rounded-full ' + (i < 2 ? 'bg-teal-50 text-teal-trust' : 'border border-teal-trust bg-white text-teal-trust')}>{i < 2 ? <Check size={14} /> : <UserRound size={13} />}</span>
              <div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-sm text-ink-muted">{detail}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

export function LandingPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section aria-labelledby="hero-heading" className="border-b border-line bg-canvas">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-12 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-teal-trust"><span aria-hidden="true" className="h-px w-8 bg-teal-trust"/>Demonstration system</p>
            <h1 id="hero-heading" className="mt-5 max-w-2xl text-balance font-serif text-4xl font-medium leading-tight tracking-tight text-ink sm:text-5xl lg:text-6xl">A clearer way to submit and track your financial complaint.</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">Describe the issue, receive a secure tracking reference, and see its progress through AI-assisted triage.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-trust px-5 text-sm font-semibold text-white hover:bg-teal-trust-hover">Start a complaint <ArrowRight size={17} aria-hidden="true" /></Link>
              <Link to="/track" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line bg-white px-5 text-sm font-semibold hover:border-teal-trust hover:text-teal-trust">Track a complaint</Link>
            </div>
          </div>
          <CasePreview />
        </div>
      </section>
      <section aria-labelledby="how-heading" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
          <h2 id="how-heading" className="font-serif text-3xl tracking-tight sm:text-4xl">How it works</h2>
          <ol className="mt-7 grid gap-6 md:grid-cols-3 md:gap-9">
            {steps.map(({ title, icon: Icon, text }) => <li key={title} className="border-t border-line pt-5"><Icon className="mb-3 text-teal-trust" size={22} aria-hidden="true"/><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{text}</p></li>)}
          </ol>
        </div>
      </section>
      <div className="border-y border-line bg-canvas">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-12 lg:py-16">
          <ProductCategories />
          <section className="self-start rounded-xl border border-line bg-white p-6 sm:p-8" aria-label="AI and privacy">
            <h2 className="text-xl font-semibold">Where AI fits</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">Category and priority are preliminary suggestions. A reviewer can approve, change, or reject a classification. These decisions concern intake and routing, and do not settle a financial dispute.</p>
            <h2 className="mt-6 flex items-center gap-2 border-t border-line pt-5 text-xl font-semibold"><KeyRound size={19} aria-hidden="true" className="text-teal-trust"/>Keep your receipt private</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">Anyone with both credentials can view case updates. Use fictional details in this demonstration and leave out account numbers, passwords, and other identifying information.</p>
          </section>
        </div>
      </div>
      <section aria-labelledby="faq-heading" className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_2fr] lg:px-12 lg:py-16">
        <h2 id="faq-heading" className="font-serif text-3xl tracking-tight sm:text-4xl">Common questions</h2>
        <div>{questions.map(([q, a]) => <details key={q} className="group border-b border-line first:border-t"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-semibold marker:content-none">{q}<ChevronDown className="shrink-0 text-teal-trust group-open:rotate-180" size={18} aria-hidden="true"/></summary><p className="max-w-2xl pb-5 text-sm leading-relaxed text-ink-muted">{a}</p></details>)}</div>
      </section>
    </main>
  );
}
