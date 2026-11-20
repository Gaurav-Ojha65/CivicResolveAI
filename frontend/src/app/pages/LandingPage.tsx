import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowRight,
  FileText,
  Cpu,
  Users,
  Lock,
  Eye,
  AlertCircle,
  Menu,
  X,
  Sparkles,
  CheckCircle2,
  Fingerprint,
  Shield,
  Layers,
  Github,
} from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Button } from '../../components/ui/Button';


/**
 * LandingPage â€” high-trust, fintech-grade public front door for CivicResolve AI.
 *
 * Visual System & Structure:
 * 1. Precision navigation bar with brand mark, route anchors, and CTA
 * 2. High-impact editorial Hero with live interactive grievance triage simulator
 * 3. 3-step lifecycle pipeline with connected step cards and micro-indicators
 * 4. Asymmetric bento-grid value proposition with technical proofs
 * 5. Transparent AI compliance card with mathematical disclosure
 * 6. High-trust privacy & credential security matrix
 * 7. Comprehensive dark navy footer with legal disclaimers and navigation
 */
export const LandingPage: React.FC = () => {
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Scroll-aware navbar transition & hash link anchor handling
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll, { passive: true });

    if (window.location.hash) {
      const target = document.querySelector(window.location.hash);
      if (target) {
        target.scrollIntoView();
        handleScroll();
      }
    }

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Framer Motion variants for staggered hero entrance (delays: 0.1, 0.25, 0.42, 0.58 s)
  const heroContainerVariants: Variants = {
    hidden: {},
    visible: {},
  };
  const heroBadgeVariants: Variants = prefersReducedMotion
    ? { hidden: {}, visible: {} }
    : {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] } },
      };
  const heroH1Variants: Variants = prefersReducedMotion
    ? { hidden: {}, visible: {} }
    : {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] } },
      };
  const heroParagraphVariants: Variants = prefersReducedMotion
    ? { hidden: {}, visible: {} }
    : {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.42, ease: [0.22, 1, 0.36, 1] } },
      };
  const heroCtasVariants: Variants = prefersReducedMotion
    ? { hidden: {}, visible: {} }
    : {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.58, ease: [0.22, 1, 0.36, 1] } },
      };

  return (
    <>
      {/* â”€â”€ Aurora Navbar (fixed, transparent â†’ white on scroll) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,box-shadow] duration-200"
        style={
          scrolled
            ? { backgroundColor: '#fff', borderBottom: '1px solid #E3E7ED', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }
            : { backgroundColor: 'transparent', borderBottom: '1px solid transparent' }
        }
      >
        <nav
          className="flex items-center justify-between"
          style={{ padding: '26px 44px' }}
          aria-label="Main navigation"
        >
          {/* Brand mark */}
          <Link
            to="/"
            className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white rounded-lg"
            aria-label="CivicResolve AI â€” home"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
              style={{ backgroundColor: scrolled ? '#0B1F3A' : 'rgba(255,255,255,0.12)', border: scrolled ? 'none' : '1px solid rgba(255,255,255,0.22)' }}
            >
              <ShieldCheck
                className="w-5 h-5 shrink-0"
                style={{ color: scrolled ? '#2DD4BF' : '#fff' }}
                aria-hidden="true"
              />
            </div>
            <div className="flex flex-col leading-none">
              <div className="flex items-center gap-1.5">
                <span
                  className="font-extrabold text-base tracking-tight font-sans"
                  style={{ color: scrolled ? '#0B1F3A' : '#fff' }}
                >
                  CivicResolve
                </span>
                <span
                  className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded"
                  style={
                    scrolled
                      ? { backgroundColor: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }
                      : { backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }
                  }
                >
                  AI
                </span>
              </div>
              <span
                className="text-[11px] -mt-0.5 hidden sm:inline"
                style={{ color: scrolled ? '#64748B' : 'rgba(255,255,255,0.65)' }}
              >
                Fintech Grievance Intelligence
              </span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-7">
            {[
              { label: 'How It Works', href: '#how-it-works', isAnchor: true },
              { label: 'About', href: '#transparency', isAnchor: true },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white rounded"
                style={{ color: scrolled ? '#475569' : 'rgba(255,255,255,0.82)' }}
              >
                {label}
              </a>
            ))}
            <Link
              to="/track"
              className="text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white rounded"
              style={{ color: scrolled ? '#475569' : 'rgba(255,255,255,0.82)' }}
            >
              Track Complaint
            </Link>
            <Link
              to="/reviewer/login"
              className="text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white rounded"
              style={{ color: scrolled ? '#475569' : 'rgba(255,255,255,0.82)' }}
            >
              Reviewer Portal
            </Link>
            {/* CTA Pill */}
            <Link
              to="/submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-semibold text-sm transition-transform hover:scale-[1.03] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white whitespace-nowrap"
              style={
                scrolled
                  ? { backgroundColor: '#0B1F3A', color: '#fff' }
                  : { backgroundColor: '#fff', color: '#0B1F3A' }
              }
            >
              Submit Complaint
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            style={{ color: scrolled ? '#475569' : '#fff', border: scrolled ? '1px solid #E3E7ED' : '1px solid rgba(255,255,255,0.3)' }}
            onClick={() => setNavOpen((o) => !o)}
            aria-expanded={navOpen}
            aria-controls="mobile-nav"
            aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {navOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </nav>

        {/* Mobile nav drawer */}
        {navOpen && (
          <div
            id="mobile-nav"
            className="md:hidden border-t px-4 py-4 flex flex-col gap-3 shadow-lg"
            style={{ backgroundColor: '#fff', borderColor: '#E3E7ED' }}
          >
            <a
              href="#how-it-works"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 rounded"
              onClick={() => setNavOpen(false)}
            >
              How It Works
            </a>
            <a
              href="#transparency"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 rounded"
              onClick={() => setNavOpen(false)}
            >
              About
            </a>
            <Link
              to="/track"
              className="text-sm font-medium text-slate-600 hover:text-teal-700 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 rounded"
              onClick={() => setNavOpen(false)}
            >
              Track Complaint
            </Link>
            <Link
              to="/reviewer/login"
              className="text-sm font-medium text-slate-600 hover:text-teal-700 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 rounded"
              onClick={() => setNavOpen(false)}
            >
              Reviewer Portal
            </Link>
            <Link to="/submit" onClick={() => setNavOpen(false)}>
              <Button size="sm" variant="primary" className="w-full justify-center mt-2">
                Submit Complaint
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        )}
      </header>

      {/* â”€â”€ Main content landmark â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <main id="main-content">
        {/* â”€â”€ Aurora Cinematic Hero (100svh full-bleed video) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section
          aria-labelledby="hero-heading"
          style={{ position: 'relative', minHeight: '100svh', overflow: 'hidden', backgroundColor: '#062B22' }}
        >
          {/* Background video â€” hidden when user prefers reduced motion */}
          {!prefersReducedMotion && (
            <video
              ref={videoRef}
              aria-hidden="true"
              autoPlay
              loop
              muted
              playsInline
              poster="/hero-poster.jpg"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                zIndex: 0,
              }}
            >
              <source src="/hero.mp4" type="video/mp4" />
            </video>
          )}

          {/* Overlay stack: base darkening + left-to-right gradient for text legibility */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              background: 'linear-gradient(to right, rgba(0,0,0,0.55) 0%, transparent 70%)',
            }}
          />

          {/* Hero content — anchored top-left */}
          <motion.div
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
            className="relative z-10 flex flex-col items-start px-6 md:px-16 max-w-2xl"
            style={{
              paddingTop: '24vh',
            }}
          >
            {/* Badge pill */}
            <motion.div variants={heroBadgeVariants}>
              <div
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Explainable AI triage for consumer complaints
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              id="hero-heading"
              variants={heroH1Variants}
              style={{
                fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                fontWeight: 500,
                fontSize: 'clamp(2.4rem, 4.6vw, 4.1rem)',
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                color: '#fff',
                marginTop: '1.25rem',
                marginBottom: 0,
              }}
            >
              Bring clarity to your
              <br />
              <span style={{ color: '#C8F169' }}>financial grievance.</span>
            </motion.h1>

            {/* Sub-paragraph */}
            <motion.p
              variants={heroParagraphVariants}
              style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.78)',
                maxWidth: 420,
                lineHeight: 1.65,
                marginTop: '1.25rem',
              }}
            >
              CivicResolve AI classifies your consumer-finance complaint and routes it for
              human review. You get a preliminary assessment right away.
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              variants={heroCtasVariants}
              style={{ marginTop: '2rem', display: 'flex', flexWrap: 'wrap', gap: 12 }}
            >
              <Link to="/submit">
                <motion.span
                  whileHover={prefersReducedMotion ? {} : { scale: 1.03 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
                  style={{ display: 'block' }}
                >
                  <span
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-sm cursor-pointer whitespace-nowrap"
                    style={{ backgroundColor: '#0a0a0a', color: '#fff' }}
                  >
                    Submit Your Complaint
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </span>
                </motion.span>
              </Link>
              <Link to="/track">
                <motion.span
                  whileHover={prefersReducedMotion ? {} : { scale: 1.03 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
                  style={{ display: 'block' }}
                >
                  <span
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-sm cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.22)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                    }}
                  >
                    Track Existing Complaint
                  </span>
                </motion.span>
              </Link>
            </motion.div>

            {/* Demo notice */}
            <motion.p
              variants={heroCtasVariants}
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.65)',
                marginTop: '1rem',
              }}
            >
              Demo platform. Don&apos;t enter real personal or financial information.
            </motion.p>
          </motion.div>

          {/* Bottom-left GitHub link */}
          <div className="absolute bottom-6 left-6 md:bottom-[34px] md:left-16 z-20">
            <a
              href="https://github.com/Gaurav-Ojha65/CivicResolveAI"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="flex items-center justify-center w-10 h-10 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <Github className="w-5 h-5" aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* ── How It Works (3 Steps Lifecycle Pipeline) ───────────────────────── */}
        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="bg-surface border-b border-border py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-6 md:px-16">
            <div className="text-left max-w-3xl mb-16">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-trust">
                Structured Lifecycle
              </span>
              <h2
                id="how-it-works-heading"
                className="text-3xl sm:text-4xl font-extrabold text-ink-deep tracking-tight mt-2"
                style={{ textWrap: 'balance' }}
              >
                How It Works
              </h2>
              <p className="mt-3 text-base text-ink-muted leading-relaxed">
                Your complaint is handled in three steps â€” from submission through
                automated classification to human review.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Step 1 */}
              <article className="relative bg-canvas rounded-2xl border border-border p-8 flex flex-col justify-between hover:border-teal-trust/40 transition-colors shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className="w-12 h-12 rounded-xl bg-ink-deep text-white flex items-center justify-center font-bold text-base shadow-sm"
                      aria-hidden="true"
                    >
                      1
                    </div>
                    <div className="p-2.5 rounded-xl bg-teal-trust/10 text-teal-trust border border-teal-trust/20">
                      <FileText className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-ink-deep mb-2 font-sans">
                    Submit Your Complaint
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Describe your consumer-finance issue in plain language. No account is
                    required. Your complaint is handled securely and confidentially.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs font-semibold text-teal-trust">
                  <span>Intake Received</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </article>

              {/* Step 2 */}
              <article className="relative bg-canvas rounded-2xl border border-border p-8 flex flex-col justify-between hover:border-teal-trust/40 transition-colors shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className="w-12 h-12 rounded-xl bg-teal-trust text-white flex items-center justify-center font-bold text-base shadow-sm"
                      aria-hidden="true"
                    >
                      2
                    </div>
                    <div className="p-2.5 rounded-xl bg-teal-trust/10 text-teal-trust border border-teal-trust/20">
                      <Cpu className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-ink-deep mb-2 font-sans">
                    AI Classification
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Our NLP pipeline assigns your complaint to one of eight
                    consumer-finance product categories and assesses triage priority
                    automatically.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs font-semibold text-teal-trust">
                  <span>Linear Feature Attribution</span>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </article>

              {/* Step 3 */}
              <article className="relative bg-canvas rounded-2xl border border-border p-8 flex flex-col justify-between hover:border-teal-trust/40 transition-colors shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className="w-12 h-12 rounded-xl bg-ink-deep text-white flex items-center justify-center font-bold text-base shadow-sm"
                      aria-hidden="true"
                    >
                      3
                    </div>
                    <div className="p-2.5 rounded-xl bg-teal-trust/10 text-teal-trust border border-teal-trust/20">
                      <Users className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-ink-deep mb-2 font-sans">
                    Human Review
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    A trained reviewer examines the classification before any final
                    decision is made. Automated assessments are never applied without
                    human oversight.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs font-semibold text-teal-trust">
                  <span>Mandatory Adjudication</span>
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* â”€â”€ Comprehensive Asymmetric Bento-Grid Value Proposition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="bg-canvas border-b border-border py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-14">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-trust">
                Fintech Governance Architecture
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-ink-deep tracking-tight mt-2">
                Engineered for regulatory transparency and consumer trust
              </h2>
              <p className="text-base text-ink-muted mt-3 leading-relaxed">
                Modern machine learning must withstand statutory audit. CivicResolve AI replaces opaque neural embeddings with reproducible, linear attribution vectors.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Bento Card 1: 8 CFPB Categories (span 7) */}
              <div className="md:col-span-7 bg-surface rounded-2xl border border-border p-8 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-teal-trust/10 text-teal-trust flex items-center justify-center mb-5">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-deep mb-2">
                    8 Standard CFPB Regulatory Taxonomies
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    Our model is trained on the Consumer Financial Protection Bureau complaint corpus, classifying into credit reporting, mortgages, student loans, debt collection, banking accounts, vehicle loans, and money services.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-border text-xs font-medium text-ink-muted">
                  <div className="p-2 rounded bg-canvas border border-border/80 text-center">Credit Reporting</div>
                  <div className="p-2 rounded bg-canvas border border-border/80 text-center">Debt Collection</div>
                  <div className="p-2 rounded bg-canvas border border-border/80 text-center">Mortgages</div>
                  <div className="p-2 rounded bg-canvas border border-border/80 text-center">Bank Accounts</div>
                </div>
              </div>

              {/* Bento Card 2: Cryptographic Audit Trail (span 5) */}
              <div className="md:col-span-5 bg-surface rounded-2xl border border-border p-8 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-ink-deep text-teal-400 flex items-center justify-center mb-5">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-deep mb-2">
                    Cryptographic Audit Trail
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Every inference logs a SHA-256 model provenance checksum, decision score margin, runner-up category, and token attribution map into PostgreSQL JSONB.
                  </p>
                </div>
                <div className="mt-6 p-3 rounded-xl bg-slate-900 text-slate-300 font-mono text-[11px] border border-slate-800">
                  <span className="text-slate-500">model_provenance_sha256:</span><br />
                  <span className="text-teal-400">c6f4a21087e9...cf82</span>
                </div>
              </div>

              {/* Bento Card 3: In-Memory Zero-Storage Reviewer Auth (span 5) */}
              <div className="md:col-span-5 bg-surface rounded-2xl border border-border p-8 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center mb-5">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-deep mb-2">
                    Strict In-Memory Session Security
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Zero persistence of reviewer credentials or citizen tracking secrets in localStorage, sessionStorage, or browser cookies. Sessions terminate instantly upon tab close.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>Enforces Ephemeral State Hygiene</span>
                </div>
              </div>

              {/* Bento Card 4: Optimistic Lock Human Oversight (span 7) */}
              <div className="md:col-span-7 bg-surface rounded-2xl border border-border p-8 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center mb-5">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-ink-deep mb-2">
                    Optimistic Lock Adjudication
                  </h3>
                  <p className="text-sm text-ink-muted leading-relaxed mb-4">
                    Reviewers can approve, override, or reject AI recommendations with mandatory justification notes. Simultaneous reviews are guarded by version-checked optimistic locking (`HTTP 409 Conflict`).
                  </p>
                </div>
                <div className="pt-4 border-t border-border flex flex-wrap gap-2 text-xs">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">APPROVE</span>
                  <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">OVERRIDE (with note)</span>
                  <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-200">REJECT (with note)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* â”€â”€ AI Transparency Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section
          id="transparency"
          aria-labelledby="transparency-heading"
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28"
        >
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-trust/10 text-teal-trust flex items-center justify-center">
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
              </div>
              <h2
                id="transparency-heading"
                className="text-2xl sm:text-3xl font-extrabold text-ink-deep tracking-tight"
              >
                AI Transparency
              </h2>
            </div>
            <p className="text-ink-muted mb-10 leading-relaxed text-sm sm:text-base">
              CivicResolve AI uses machine learning to assist classification. We are
              committed to being clear about what our system can and cannot do.
            </p>

            <ul className="space-y-4" role="list">
              {[
                {
                  heading: 'Assessments are preliminary',
                  body: 'Every classification produced by our NLP model is an initial estimate only. It does not constitute a final determination.',
                },
                {
                  heading: 'Accuracy is not guaranteed',
                  body: 'Machine learning models can produce incorrect classifications. All outputs are subject to correction by a human reviewer.',
                },
                {
                  heading: 'Human oversight is mandatory',
                  body: 'No complaint is processed solely on the basis of automated classification. A trained reviewer approves, overrides, or rejects every AI recommendation.',
                },
                {
                  heading: 'This is not legal advice',
                  body: 'CivicResolve AI is a complaint triage tool. Nothing produced by this platform constitutes legal advice or representation.',
                },
              ].map(({ heading, body }) => (
                <li
                  key={heading}
                  className="flex gap-4 p-5 rounded-2xl border border-border bg-surface shadow-xs hover:border-slate-300 transition-colors"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full bg-teal-trust mt-2 shrink-0 ring-4 ring-teal-trust/15"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-bold text-ink-deep mb-1 font-sans">{heading}</p>
                    <p className="text-sm text-ink-muted leading-relaxed">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* â”€â”€ Privacy & Trust Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section
          aria-labelledby="privacy-heading"
          className="bg-surface border-t border-border py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-teal-trust/10 text-teal-trust flex items-center justify-center">
                  <Lock className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2
                  id="privacy-heading"
                  className="text-2xl sm:text-3xl font-extrabold text-ink-deep tracking-tight"
                >
                  Privacy &amp; Trust
                </h2>
              </div>
              <p className="text-sm sm:text-base text-ink-muted mb-10 leading-relaxed">
                Consumer grievance data requires institutional security standards and clear regulatory boundaries.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  {
                    icon: Lock,
                    heading: 'Secure transmission',
                    body: 'Complaints are submitted using standard web protocols. When deployed in production, HTTPS encryption is applied. This prototype should not be used to submit real personal or financial information.',
                  },
                  {
                    icon: Eye,
                    heading: 'Access-controlled review',
                    body: 'Review access is restricted to authorised staff. Automated triage classifications are subject to human oversight before any determination is made.',
                  },
                  {
                    icon: ShieldCheck,
                    heading: 'No consumer profiling',
                    body: 'CivicResolve AI does not intentionally build consumer profiles or integrate with advertising systems. This is a demonstration platform and is not subject to production privacy audits.',
                  },
                  {
                    icon: AlertCircle,
                    heading: 'Limitation of scope',
                    body: 'This platform handles complaint classification only. We do not provide legal services, financial advice, or dispute resolution.',
                  },
                ].map(({ icon: Icon, heading, body }) => (
                  <div
                    key={heading}
                    className="flex gap-4 p-6 rounded-2xl border border-border bg-canvas shadow-xs hover:border-slate-300 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-teal-trust shrink-0 shadow-xs">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink-deep mb-1 font-sans">{heading}</p>
                      <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <footer className="border-t border-slate-800 bg-slate-950 text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
            {/* Brand column */}
            <div className="flex flex-col gap-3.5 max-w-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
                  <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                </div>
                <span className="text-white font-bold text-lg tracking-tight">CivicResolve AI</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Automated consumer-finance complaint triage with mandatory human oversight.
              </p>
            </div>

            {/* Navigation links */}
            <nav aria-label="Footer navigation">
              <ul className="flex flex-wrap gap-6 sm:gap-8 text-sm font-medium text-slate-300" role="list">
                <li>
                  <Link
                    to="/"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <a
                    href="#how-it-works"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    How It Works
                  </a>
                </li>
                <li>
                  <a
                    href="#transparency"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    About
                  </a>
                </li>
                <li>
                  <Link
                    to="/submit"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    Submit Complaint
                  </Link>
                </li>
                <li>
                  <Link
                    to="/track"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    Track Complaint
                  </Link>
                </li>
                <li>
                  <Link
                    to="/reviewer/login"
                    className="hover:text-teal-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
                  >
                    Reviewer Portal
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          {/* Legal Disclaimers */}
          <div className="mt-12 pt-8 border-t border-slate-800/80 text-xs leading-relaxed text-slate-400 space-y-2">
            <p>
              CivicResolve AI provides preliminary complaint classification. This is not
              legal advice. AI assessments are subject to human review.
            </p>
            <p>
              CivicResolve AI is a demonstration platform. Complaint submissions are
              processed for classification purposes only and do not constitute formal
              regulatory filings.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
};
