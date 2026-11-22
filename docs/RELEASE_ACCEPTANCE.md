# Release acceptance evidence

On November 22, 2026 (IST), the merged `main` application was exercised in a local disposable PostgreSQL 18 database using fictional complaints. Spring Boot, FastAPI with the saved model, and the React development server ran together. The one-time tracking secret was stored only in an ignored local test receipt; it is absent from this document and all curated screenshots.

| Journey | Observed evidence |
| --- | --- |
| Citizen intake | Submission returned a reference and one-time secret; the [redacted receipt](assets/screenshots/receipt-redacted-1440.jpg) shows the user-facing result. |
| NLP and persistence | The saved baseline classified the fictional duplicate-charge complaint as Credit card with confidence 0.8914 and an explanation. A direct PostgreSQL read found the case and one prediction. |
| Tracking | Secret-gated lookup returned the initial `AUTO_ROUTED` status. After review it returned `APPROVED` without the private reviewer note. [Approved public timeline](assets/screenshots/tracking-approved-1440.jpg). |
| Reviewer workflow | Reviewer sign-in succeeded; searching the [queue](assets/screenshots/reviewer-queue-1440.jpg) by reference prefix found the case. The [case view](assets/screenshots/reviewer-case-approved-1440.jpg) recorded approval; the [expanded explanation](assets/screenshots/reviewer-explanation-1440.jpg) displayed feature contributions. PostgreSQL then showed version 1 and two audit rows. |
| Operational screens | [Analytics](assets/screenshots/analytics-1440.jpg) and [model audit](assets/screenshots/model-audit-1440.jpg) loaded from the isolated test dataset. Their counts are snapshots of that dataset, not usage claims. |
| Synthetic seeding | With seeding explicitly enabled in the disposable environment, the first call created 32 records and the second created zero. Seeding is disabled by default. |
| Browser and layout | The successful journey had zero browser console errors or HTTP 5xx responses. Ten desktop/mobile checks found one visible page heading and no horizontal overflow. |

The [merged-main GitHub Actions run](https://github.com/Gaurav-Ojha65/CivicResolveAI/actions/runs/44950364531) at commit [`caa549b8`](https://github.com/Gaurav-Ojha65/CivicResolveAI/commit/caa549b8a8c981cfe79014fa161c79181ae1c466) passed React typecheck/build and 256 tests, 301 backend unit/web tests, 30 PostgreSQL integration tests, and 136 NLP tests. Nine additional NLP tests were skipped because the processed dataset or `val.csv` was unavailable; those skips are not passes.

This establishes a functional demonstration baseline, not production readiness. No public deployment or regulatory certification was verified.
