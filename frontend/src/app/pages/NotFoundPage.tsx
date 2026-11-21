import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <p className="text-sm font-semibold text-teal-trust">404</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Page not found</h1>
      <p className="mt-4 text-ink-muted">Check the address or return to the overview to submit or track a complaint.</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-teal-trust px-4 font-semibold text-white hover:bg-teal-trust-hover">Return to overview</Link>
    </main>
  );
}
