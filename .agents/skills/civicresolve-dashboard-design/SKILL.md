---
name: civicresolve-dashboard-design
description: Specialized UI/UX design and frontend implementation skill for the CivicResolve AI enterprise grievance-management platform. Enforces premium enterprise SaaS aesthetics, accessibility, information hierarchy, and non-negotiable preservation of existing backend APIs, security guarantees, and business logic.
---

# CivicResolve AI — Enterprise Dashboard UI/UX Design & Implementation Skill

## 1. Purpose & Scope

This skill guides the design, visual modernization, and frontend implementation of all user-facing interfaces within the **CivicResolve AI** consumer finance grievance-management system. It transforms screens into a unified, **premium enterprise SaaS** workspace (evoking top-tier case management, legal compliance, and fintech tools such as Linear, Stripe, or Palantir Foundry) while strictly protecting existing backend contracts, cryptographic guarantees, and data pipelines.

---

## 2. Design Direction: Premium Enterprise SaaS

The visual identity of CivicResolve AI must reflect serious, compliant, audit-ready enterprise software:
- **Restrained & Professional**: Quiet chrome, intentional color accents, generous whitespace, and sharp visual hierarchy.
- **Queue & Data-Dense**: Fast keyboard navigation, glanceable status rails, tabular data, and high-density queues without visual noise.
- **Truthful & Honest AI**: Explicit model provenance (SHA-256 checksums, uncalibrated vs. calibrated confidence, decision margins, and linear feature attribution). Never disguise AI estimation as certainty.
- **Anti-Clutter Guardrails**: Avoid generic AI-template tropes—no rainbow gradients, no gratuitous glassmorphism on operational data, no oversized floating cards, and no decorative animations that delay user adjudication workflows.

---

## 3. Core Design Principles

1. **Systemic Design Consistency**: Rely on unified design tokens (typography, color palettes, spacing rails, border radiuses, and shadows) defined in `tailwind.config.js` and shared UI components rather than ad-hoc page-specific hacks.
2. **Strict Information Hierarchy**: Establish immediate visual priority: primary queues and key status indicators take precedence over telemetry and historical archives.
3. **Typography & Readability**:
   - Body font: Clean neo-grotesque (`Inter`, min 14px for body, 12px for micro-badges/captions).
   - Metrics, UUIDs & timestamps: Strict tabular numbers (`JetBrains Mono`, `tabular-nums`).
   - Editorial accents: `Source Serif 4` or `Plus Jakarta Sans` reserved strictly for page titles and brand headings.
   - Text contrast must exceed WCAG AA standards (secondary labels must be `slate-600` or darker).
4. **Data Density without Overwhelm**:
   - Use connected Bento strips and slim icon rails rather than scattered multi-layer boxes.
   - Default sorting: Order by earliest SLA breach (`getBreachTimestamp(a) - getBreachTimestamp(b)`).
   - Shorten long identifiers gracefully (e.g., `12345678...`) while providing instant 1-click clipboard copying.
5. **Purposeful Visual Aids**:
   - Status badges must always pair semantic color with text or an iconography glyph (never communicate state via color alone).
   - Progress indicators and SLA aging rails must communicate remaining time or breach status in clear text (e.g., "2d left" vs "1d over").
6. **Responsive Layout Architecture**:
   - Desktop: Multi-column sidecar/rail and wide table grids.
   - Tablet/Mobile: Responsive collapsing into accessible drawers, stacked KPI rows, and thumb-friendly controls.
7. **Comprehensive Operational States**: Every screen and async widget must implement:
   - Polished skeleton loaders matching exact container geometry (no layout shifting).
   - Meaningful empty states with actionable remediation or reset filters.
   - Resilient, non-retrying error states when backend outcomes are uncertain.
   - Clear optimistic or cryptographic confirmation receipts.
8. **Subtle Motion Physics**: Use spring physics (`stiffness: 300, damping: 30`) via `framer-motion` for row expansions, drawers, and modal transitions. Respect `prefers-reduced-motion` at all times.
9. **Zero Fake Metrics**: Every number, chart point, and status chip must originate directly from verified API responses or seeded PRNG stochastic pipelines.
10. **Maximum Architecture Reuse**: Leverage existing React 18, React Router v6, Lucide icons, Tailwind utility classes, and custom UI components located in `frontend/src/components/ui/`.

---

## 4. CRITICAL PROJECT PROTECTION RULES (Non-Negotiable)

Any redesign task executed under this skill **MUST NEVER VIOLATE** the following system invariants:

1. **Zero Backend & Schema Modifications**: Do NOT modify Spring Boot Java code, Python FastAPI NLP code, PostgreSQL database schemas, Flyway migrations, or `.env` configurations during a UI redesign.
2. **Preserve API Contracts**: All REST endpoints (`/api/grievances`, `/api/auth`, `/api/categories`, `/api/tracking`, etc.) and their exact request/response JSON schemas must remain completely untouched.
3. **Preserve RBAC & Auth Security**: Maintain strict in-memory JWT authentication for reviewer sessions; never persist bearer tokens in `localStorage` or `sessionStorage`.
4. **Preserve Complaint Lifecycle Transitions**: Adhere to the strict backend status state machine:
   `SUBMITTED` → `AUTO_ROUTED` / `UNDER_REVIEW` → `RESOLVED` / `DISMISSED`.
5. **Preserve Cryptographic Verification Logic**: Maintain the one-time receipt generation, salted SHA-256 verification, and secret token confirmation for public case tracking.
6. **Preserve Sanitized Public Responses**: Public tracking endpoints must never expose internal reviewer notes, reviewer identities, or raw internal routing flags to unauthenticated citizens.
7. **Preserve Append-Only Audit Logging**: Every adjudication decision (APPROVE, OVERRIDE, REJECT) must transmit the `expectedVersion` optimistic lock and reviewer notes as required by the backend.
8. **No Mock Replacement of Real APIs**: Never replace live endpoints with static mock data in production code. Use mocks strictly within automated test suites (`vitest`).
9. **No Feature Stripping**: Never remove filters, pagination controls, telemetry badges, or security disclosures under the pretext of visual simplification.
10. **Zero Metric Invention**: Do not hardcode fictitious compliance claims, customer counts, or artificial precision estimates.

---

## 5. Execution Workflow

When redesigning or polishing any screen in the CivicResolve AI platform, agents must follow this step-by-step workflow:

```
[Phase 1: Inspection]
  └─ Read existing screen component, child components, and related tests
  └─ Catalog routes, accessible role names, test IDs, and API hooks

[Phase 2: Design Proposal]
  └─ Document proposed layout, typography, tokens, and component restructuring
  └─ Verify alignment with Enterprise SaaS principles & guardrails

[Phase 3: Implementation]
  └─ Implement changes incrementally (one screen / layout component at a time)
  └─ Apply design tokens from tailwind.config.js and shared component libraries

[Phase 4: Verification & Test Suite]
  └─ Run unit & component test suites: npm --prefix frontend test -- --run
  └─ Run typecheck & production build: npm --prefix frontend run build
  └─ Ensure all existing test queries remain green (or update updated labels in-place)

[Phase 5: Visual Verification]
  └─ Capture headless browser screenshots across desktop (1280px) and mobile (390px)
  └─ Validate contrast, spacing, overflow, and scroll transitions

[Phase 6: Reporting]
  └─ Report modified files, test outputs, screenshots, and remaining considerations
```

---

## 6. Design System Tokens Reference

When applying styling, use the following tokens established in `frontend/tailwind.config.js`:

| Token | Class / Hex | Recommended Use |
| :--- | :--- | :--- |
| **Ink Deep** | `#0B1F3A` / `text-ink` | Primary headings, dark badges, primary brand labels |
| **Slate Canvas** | `#F6F7F9` / `bg-canvas` | Main platform backdrop, subtle table row alt |
| **Enterprise Line** | `#E3E7ED` / `border-line` | Card borders, table dividers, panel outlines |
| **Brand Teal** | `#0D9488` / `text-brand-600` | Primary interactive links, success indicators, focus rings |
| **Accent Lime** | `#C8F169` | Hero headline accent, highlight contrast marks |
| **Card Shadow** | `shadow-card` / `0 1px 3px rgba(11,31,58,0.06)` | Enterprise Bento card elevation |
| **Card Radius** | `rounded-[10px]` | Standard border radius for all cards and modals |

### Priority Badge Specifications:
- **CRITICAL**: `bg-red-50 text-red-800 border-red-200`
- **HIGH**: `bg-amber-50 text-amber-900 border-amber-200`
- **MEDIUM**: `bg-blue-50 text-blue-800 border-blue-200`
- **LOW**: `bg-slate-100 text-slate-700 border-slate-200`

---

## 7. Quality Checklist Before Completing Any Redesign Task

- [ ] All Vitest component, a11y, and feature tests pass (`npm --prefix frontend test -- --run`).
- [ ] TypeScript compilation succeeds with zero errors (`tsc -b`).
- [ ] No changes outside frontend scope (`backend/` and `nlp-service/` are completely untouched).
- [ ] Accessible landmark elements (`<main id="main-content">`, `<nav>`, `<header>`, `<footer>`) are preserved.
- [ ] Responsive layouts verified on both desktop (`1280px`) and mobile (`390px`).
- [ ] Headless browser screenshots captured and verified before reporting completion.
