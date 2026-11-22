# Sprint 2 visual QA

The images in this folder were captured with headless Chrome from the merged Sprint 1 frontend and the Sprint 2 branch on November 22, 2026. The browser used a disposable local PostgreSQL database, the existing Spring Boot backend, the saved NLP model and fictional complaint text. The receipt's one-time tracking secret was masked during capture.

| Route | Before | After |
| --- | --- | --- |
| Overview, 375 px | [Before](before-overview-375.jpg) | [After](after-overview-375.jpg) |
| Overview, 1440 px | [Before](before-overview-1440.jpg) | [After](after-overview-1440.jpg) |
| Submission, 375 px | [Before](before-submit-375.jpg) | [After](after-submit-375.jpg) |
| Tracking, 375 px | [Before](before-track-375.jpg) | [After](after-track-375.jpg) |
| Reviewer sign in, 375 px | [Before](before-login-375.jpg) | [After](after-login-375.jpg) |

The updated reviewer screenshots show the [queue](after-queue-375.jpg), [case review](after-case-375.jpg), [analytics](after-analytics-375.jpg) and [model audit](after-audit-375.jpg) at 375 px. The complete local QA set covers 11 route and workflow states at 375, 768 and 1440 px.

The final updated-route audit found one visible page heading and no horizontal overflow in all 33 captures. The eleven 375 px axe-core scans found zero WCAG 2 A/AA and 2.1 A/AA violations. Automated checks supplement manual review. The baseline reviewer pages were not captured in this isolated run because the archived frontend development server did not render those routes reliably. Public and sign-in baseline captures remain genuine.

At the time of this Sprint 2 capture, the synthetic demo seeding endpoint returned HTTP 500 in the isolated database. Hibernate rejected a manually assigned UUID with an uninitialized version in `DemoDataSeederService`. The reviewer queue, analytics and audit screenshots therefore used complaints submitted through the real intake API. This is historical capture context: [PR #4](https://github.com/Gaurav-Ojha65/CivicResolveAI/pull/4) subsequently fixed the seeder and added PostgreSQL regression tests. The merged release-acceptance run also seeded 32 synthetic records and verified an idempotent retry.
