---
name: civicresolve-dashboard-design
description: Design and verify the CivicResolve complaint intake, tracking and reviewer interfaces against their implemented API and security contracts.
---

# CivicResolve product design

## Product and language

CivicResolve is an independent financial complaint management demonstration. Ask visitors to use fictional information. A routing or review decision describes what happened inside this system. It does not guarantee a resolution, a response from a financial institution, government affiliation or regulatory compliance.

## Contracts to check before editing

- Consult `backend/src/main/java/ai/civicresolve/backend/entity/GrievanceStatus.java` and the grievance service. The five statuses are `PENDING_REVIEW`, `AUTO_ROUTED`, `APPROVED`, `OVERRIDDEN` and `REJECTED`. At submission the model review flag determines pending or automatic routing. Describe the actual status and recorded events. Reviewers can act on pending and auto-routed cases. Approved, overridden and rejected decisions are final in this workflow. Override and rejection require notes.
- The reviewer session uses HTTP Basic. `frontend/src/features/auth/auth-client.ts` verifies credentials at `GET /api/auth/me`. The API client holds the authorization header in module memory. Refresh and logout clear the session. Keep credentials out of browser storage, logs, screenshots and URLs.
- `GET /api/grievances` owns search, filters, ordering, page boundaries and totals. Preserve the returned order (submission time descending, then UUID descending). Reset the page when filters change, debounce text search and cancel superseded requests. Display elapsed case age from the submission time. The application has no configured statutory deadline.
- Load product names from `GET /api/product-categories`. Submit through `POST /api/grievances`. The receipt supplies the public reference and a one-time tracking secret. The backend stores a salted hash. Tracking requires both values in the body of `POST /api/grievances/track` and exposes a limited timeline. Keep the secret masked until requested and out of URLs, analytics and persistent frontend storage.
- Send the displayed `expectedVersion` with each review action. On conflict retrieve the current record and require a fresh decision. A case update and its audit entry belong to one backend transaction. Keep the original narrative, prediction and audit history distinguishable from the current assignment.
- Use recorded metrics with source, unit and denominator where available. Preserve zero measurements and present unknown, unreachable or unavailable readings explicitly. Client-side simulations are illustrative and separate from measured operational data.

## Layout and interactions

Use the existing React, Tailwind and shared components. Follow the ink (#142B3A), teal (#0F766E), canvas (#F4F7F9), surface (#FFFFFF) and border (#DCE5EA) tokens. Use text with semantic colors and visible keyboard focus. Align forms and workbench controls on a common grid. Prefer readable body text, tabular figures and restrained surfaces.

Give case identity and status, the original complaint, the AI recommendation and uncertainty, and human review controls precedence over the audit trail and optional analysis. Name synthetic previews explicitly. Show loading, empty, failure and conflict states near the affected control. Include a recovery action when the operation can safely be retried.

Use native links for navigation and buttons for actions. Provide accessible labels and descriptions, a skip target, keyboard-operable dialogs with focus return, and a reduced-motion path. Keep navigation, forms, tables and actions usable at 375, 768 and 1440 pixels.

## Verification

Inspect the route implementation, service endpoint and relevant tests before changing copy or behavior. Run the frontend typecheck, Vitest suite and production build. Capture actual rendered routes with synthetic cases, check keyboard focus and overflow, and label any controlled error fixtures used for QA. Report limitations alongside the results.
