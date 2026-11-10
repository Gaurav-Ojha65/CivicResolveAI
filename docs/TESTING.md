# CivicResolve AI — Verification & Testing Guide

CivicResolve AI enforces rigorous automated verification across all application layers, including unit testing, API slice testing, PostgreSQL database integration testing, frontend component and accessibility testing, and machine learning pipeline validation.

---

## 1. Test Suite Architecture

```
CivicResolveAI Test Suite (633 Total Automated Tests)
├── Backend (Java 25 / Spring Boot 4.1.1)
│   ├── Unit & Web Slice Tests (Maven Surefire) -> 263 Tests (100% Pass)
│   └── PostgreSQL Live Integration Tests (Maven Failsafe) -> 23 Tests (100% Pass)
├── Frontend (React 18 / TypeScript / Vite)
│   └── Vitest & React Testing Library -> 202 Tests across 32 Files (100% Pass)
└── NLP Microservice (Python 3.11+ / FastAPI / Pytest)
    └── Pytest Pipeline & Concurrency Tests -> 145 Tests (100% Pass)
```

---

## 2. Backend Verification

The backend test suite is split into two distinct execution lifecycles:

### A. Unit & Web Layer Slice Tests (Maven Surefire)
Tests cover domain entities, DTO serialization, REST controllers (`@WebMvcTest`), `SecurityConfig`, `DatabaseIsolationGuard`, `TrackingRateLimiter`, and business services with mocked persistence.

```powershell
# Execute all backend unit tests
.\backend\mvnw.cmd test
```

**Verified Test Execution Results:**
```text
[INFO] Results:
[INFO] Tests run: 263, Failures: 0, Errors: 0, Skipped: 0
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
```

**Key Tests Included:**
- `GrievanceServiceTest.simulationAndReplayEndpointsEnforcePersistenceInvariance()`: Asserts 0 calls to database write methods (`save`, `saveAndFlush`, `delete`) during counterfactual simulations and dual-model replays.
- `TrackingRateLimiterTest`: Asserts per-IP rate limiting, per-reference attempt reservation, bounded capacity fail-closed behavior, and thread-safe concurrent bucket access.
- `DatabaseIsolationGuardTest`: Asserts immediate startup failure when application connects under superuser or DDL privileges.

---

### B. PostgreSQL Live Integration Tests (Maven Failsafe)
Integration tests run against a real, isolated PostgreSQL database instance (`civicresolve_test`), verifying transactional boundaries, Flyway migration execution, concurrent review state transitions, and database isolation guards.

```powershell
# Set credentials pointing to the dedicated isolated test database
$env:SPRING_DATASOURCE_URL      = "jdbc:postgresql://127.0.0.1:5432/civicresolve_test"
$env:SPRING_DATASOURCE_PASSWORD = "<TEST_DB_PASSWORD>"
$env:SPRING_FLYWAY_URL          = "jdbc:postgresql://127.0.0.1:5432/civicresolve_test"
$env:SPRING_FLYWAY_PASSWORD     = "<TEST_MIGRATOR_PASSWORD>"

# Execute Failsafe integration tests
.\backend\mvnw.cmd clean verify
```

**Verified Integration Results:**
```text
[INFO] Running ai.civicresolve.backend.PostgresIntegrationIT
[INFO] Tests run: 23, Failures: 0, Errors: 0, Skipped: 0 -- in ai.civicresolve.backend.PostgresIntegrationIT
[INFO] BUILD SUCCESS
```

---

## 3. Frontend Verification (Vitest + Testing Library)

The frontend test suite tests UI components, feature workflows, accessibility (WCAG), in-memory authentication, keyboard navigation, and the Decision Intelligence Lab.

```powershell
cd frontend

# Run complete Vitest suite sequentially
npm test -- --fileParallelism=false --run

# Run TypeScript compilation check
npm run typecheck

# Run production bundle build
npm run build
```

**Verified Test Execution Results:**
```text
Test Files  32 passed (32)
     Tests  202 passed (202)
  Duration  162.51s

✓ tests/api/api-client.test.ts (12 tests)
✓ tests/api/api-error.test.ts (6 tests)
✓ tests/auth/auth-client.test.ts (5 tests)
✓ tests/features/IntakeSafeguardInspector.test.tsx (3 tests)
✓ tests/features/InteractiveTriageHero.test.tsx (4 tests)
✓ tests/features/LandingPage.test.tsx (4 tests)
✓ tests/features/SubmissionReceipt.test.tsx (22 tests)
✓ tests/features/SubmitGrievancePage.a11y.test.tsx (7 tests)
✓ tests/features/SubmitGrievancePage.privacy.test.tsx (4 tests)
✓ tests/features/SubmitGrievancePage.test.tsx (21 tests)
✓ tests/features/TrackGrievancePage.test.tsx (14 tests)
✓ tests/features/categories.test.ts (6 tests)
✓ tests/features/reviewer/AuditTimeline.test.tsx (2 tests)
✓ tests/features/reviewer/DecisionIntelligenceLab.test.tsx (7 tests)
✓ tests/features/reviewer/DivergingFeatureBarChart.test.tsx (2 tests)
✓ tests/features/reviewer/DualModelArenaCard.test.tsx (2 tests)
✓ tests/features/reviewer/ExecutiveAnalyticsPage.test.tsx (5 tests)
✓ tests/features/reviewer/ExplainableAiCard.test.tsx (5 tests)
✓ tests/features/reviewer/LinearAttributionHighlighter.test.tsx (3 tests)
✓ tests/features/reviewer/LoginPage.test.tsx (6 tests)
✓ tests/features/reviewer/ModelAuditPage.test.tsx (6 tests)
✓ tests/features/reviewer/ProbabilityMarginMeter.test.tsx (4 tests)
✓ tests/features/reviewer/ProtectedRoute.test.tsx (2 tests)
✓ tests/features/reviewer/ReviewerDashboardPage.test.tsx (9 tests)
✓ tests/features/reviewer/ReviewerGrievanceDetailPage.test.tsx (6 tests)
✓ tests/features/reviewer/SemanticPrecedentCard.test.tsx (2 tests)
✓ tests/features/reviewer/WhatIfSandboxDrawer.test.tsx (5 tests)
✓ tests/features/reviewer/useTriageShortcuts.test.ts (7 tests)
✓ tests/ui/Alert.test.tsx (3 tests)
✓ tests/ui/Button.test.tsx (7 tests)
✓ tests/ui/Input.test.tsx (5 tests)
✓ tests/ui/StatusIndicator.test.tsx (7 tests)
```

**Key Scenarios Verified:**
- **Zero-Network Preset Loading**: Clicking any synthetic scenario preset in Zone B updates only the editor textarea and dispatches zero API calls.
- **Review Note Copy Safety**: Clicking "Copy Replay Summary to Review Note" appends markdown findings to the review note without auto-submitting the decision.
- **Priority-Only Overrides**: `HistoricalDecisionPatternCard` correctly accounts for cases where category is maintained while priority is overridden.
- **Amber Evidence Sufficiency Warning**: Triggers automatically when historical precedent sample count < 2 or max cosine similarity < 0.25.

---

## 4. NLP Microservice Verification (Pytest)

The NLP service suite tests text cleaning, model loading, rule-based triage, explainability calculations, and dataset isolation.

```powershell
cd nlp-service

# Execute all Pytest unit and concurrency tests
pytest tests/ -v
```

**Verified Test Execution Results:**
```text
======================= 145 passed in 180.13s (0:03:00) =======================

nlp-service/tests/test_api.py ......................... [ 28%]
nlp-service/tests/test_baseline.py ........            [ 34%]
nlp-service/tests/test_bilstm.py ....................  [ 48%]
nlp-service/tests/test_data_pipeline.py ...............[ 59%]
nlp-service/tests/test_explainer.py ...................[ 72%]
nlp-service/tests/test_inspect.py .....                [ 76%]
nlp-service/tests/test_phase9_extensions.py ...........[ 84%]
nlp-service/tests/test_ranking_and_concurrency.py .....[100%]
```

**Key Assertions Verified:**
- `test_no_test_csv_access_in_app`: Asserts that production and serving code paths never access, read, or import `nlp-service/data/processed/test.csv`.
- `test_classify_explanation_mathematical_identities`: Asserts that token feature attribution weights $\mathbf{w}_c \cdot \mathbf{x}$ sum deterministically to the linear logit shifts.
- `test_concurrent_inference_and_reload_thread_coordination`: Asserts that in-flight inference requests complete safely during model snapshot publications without race conditions.
