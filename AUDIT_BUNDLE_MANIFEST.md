# CivicResolve AI — Phase 7B Audit Bundle Manifest

**Generated at:** 2026-10-23T14:58:00+05:30  
**Audit Purpose:** Independent Review by Argon and ChatGPT  
**Bundle Archive:** `CivicResolveAI_Phase7B_AuditBundle.zip`  
**Verified Project Root:** `C:\Users\gaura\OneDrive\Desktop\GrievanceGPT\CivicResolveAI`  
**Output Location:** `C:\Users\gaura\OneDrive\Desktop\GrievanceGPT\CivicResolveAI_Phase7B_AuditBundle.zip`

---

## 1. Executive Summary & Verification Scope

This audit bundle contains the complete, sanitized, read-only evidence base for **CivicResolve AI — Phase 7 (Spring Boot REST API + PostgreSQL)** and its integration with the authoritative **FastAPI NLP Service**.

### Core Findings & Audit Evidence
1. **Compilation & Build:** The Java backend builds on **Java 25.0.2** using the official **Apache Maven Wrapper 3.3.2** pinned to **Apache Maven 3.10.0** (`release 25`).
2. **Unit & Slice Tests (37/37 Passed):** All 37 automated unit and controller slice tests passed with 0 failures and 0 errors:
   - `GrievanceControllerTest`: 11 tests passed (public submission, public health check, RFC 9457 validation errors, HTTP Basic 401 unauthenticated vs authenticated access, review workflow).
   - `GrievanceServiceTest`: 10 tests passed (atomic submission, NLP-outside-transaction pattern, review state machine transitions, append-only audit logging, NLP failure isolation).
   - `NlpClientServiceValidationTest`: 16 tests passed (FastAPI response schema validation, triage safety contract enforcement, HTTP status code mapping: 400, 502, 503, 504, 500).
3. **Integration Tests (9 Tests, 9 Skipped):** `PostgresIntegrationIT.java` defines 9 database integration tests covering Flyway migrations, category seeding, JSONB persistence, constraint enforcement, and immutable prediction/audit logs.
   - **Skip Condition:** All 9 tests were skipped due to JUnit Jupiter's `@EnabledIfEnvironmentVariable(named = "SPRING_DATASOURCE_PASSWORD", matches = ".+")`.
   - **Failsafe Behavior:** `maven-failsafe-plugin` is bound to the `verify` lifecycle phase. Because the test methods are marked as *skipped* (rather than failed), Failsafe reports `0 failures, 0 errors, 9 skipped`, allowing `backend\mvnw.cmd clean verify` to produce a `BUILD SUCCESS` exit code (0) without executing assertions against a live PostgreSQL 18.6 instance.
   - **Audit Implication:** Successful completion of `mvnw.cmd verify` under default local settings does NOT constitute verification of live PostgreSQL schema creation, table grants, or transaction persistence. Live database tests require explicit export of database credentials in the environment.
4. **FastAPI Contract Parity:**
   - Java record `NlpPrediction.java` mirrors `nlp-service/app/schemas.py` (`ClassifyResponse`).
   - The Spring Boot backend respects the FastAPI service as the single source of truth for predictions, confidence, sentiment, and triage priority.
   - The dual-trigger safety rule (`HIGH`/`CRITICAL` priority requiring `flag_for_review=true`) is enforced by `NlpClientService.java` as an explicit safety barrier (rejecting violations with HTTP 502).

---

## 2. Environment Verification Commands & Outputs

All commands were executed in read-only mode from `C:\Users\gaura\OneDrive\Desktop\GrievanceGPT\CivicResolveAI`. Unedited raw stdout, stderr, and exit codes are preserved in `environment_evidence/`.

| Command | Exit Code | Verified Version / Summary |
|---|---|---|
| `java -version` | 0 | Oracle JDK 25.0.2 (`build 25.0.2+10-LTS-69`) |
| `backend\mvnw.cmd -version` | 0 | Apache Maven 3.10.0, Java 25.0.2, Windows 11 |
| `.venv\Scripts\python.exe --version` | 0 | Python 3.14.7 |
| Python ML & Web stack check | 0 | `fastapi: 0.156.1`, `pydantic: 2.14.1`, `scikit-learn: 1.9.1`, `pandas: 3.0.6`, `numpy: 2.5.4`, `torch: 2.14.1+cu126` |
| `pip show` target packages | 0 | Full package metadata captured in `pip_list_target_packages.stdout.txt` |
| `git status --short` | 128 | `fatal: not a git repository (or any of the parent directories): .git` |
| `git diff --stat` | 129 | `fatal: not a git repository (or any of the parent directories): .git` |

---

## 3. Test Evidence Summary

Existing test reports captured from `backend/target/` generated during `backend\mvnw.cmd clean verify`:

### Maven Surefire Reports (`test_reports/surefire-reports/`)
- `TEST-ai.civicresolve.backend.controller.GrievanceControllerTest.xml`: 11 tests run, 0 failures, 0 errors, 0 skipped, time 2.985s.
- `TEST-ai.civicresolve.backend.service.GrievanceServiceTest.xml`: 10 tests run, 0 failures, 0 errors, 0 skipped, time 0.344s.
- `TEST-ai.civicresolve.backend.service.NlpClientServiceValidationTest.xml`: 16 tests run, 0 failures, 0 errors, 0 skipped, time 0.026s.
- **Total Surefire (Unit + Slice):** **37 tests run, 37 passed, 0 failures, 0 errors, 0 skipped**.

### Maven Failsafe Reports (`test_reports/failsafe-reports/`)
- `failsafe-summary.xml`: `<completed>9</completed> <errors>0</errors> <failures>0</failures> <skipped>9</skipped> <flakes>0</flakes>`.
- `TEST-ai.civicresolve.backend.integration.PostgresIntegrationIT.xml`: 9 tests run, 0 failures, 0 errors, 9 skipped, time 0.008s.
- `ai.civicresolve.backend.integration.PostgresIntegrationIT.txt`: `Tests run: 9, Failures: 0, Errors: 0, Skipped: 9`.

---

## 4. Sanitization & Security Protocol

1. **Original Files Unmodified:** No original project file in `CivicResolveAI` was modified during this collection task.
2. **Credential Sanitization:** Configuration files staged into the audit bundle were sanitized:
   - `backend/src/main/resources/application.properties`: Password variables replaced with `[REDACTED]`.
   - `backend/src/test/resources/application-it.properties`: Password variables and comment samples replaced with `[REDACTED]`.
   - `backend/README.md`: Example PowerShell password setup values replaced with `[REDACTED]`.
3. **Excluded Artifacts:**
   - Raw complaint datasets (`nlp-service/data/raw/*.zip`, `*.csv`) — EXCLUDED.
   - Supervised data splits (`nlp-service/data/processed/*.csv`) — EXCLUDED.
   - Serialized model weights (`*.joblib`, `*.pt`, `*.pkl`) — EXCLUDED.
   - Compiled classes and package binaries (`backend/target/*.jar`, `*.class`) — EXCLUDED.
   - Local virtual environment (`.venv/`) — EXCLUDED.
   - Secret files or environment files (`.env`, `application-secret*.properties`) — NONE FOUND / EXCLUDED.

---

## 5. Complete Bundle File Inventory

### A. Java Backend Build & Configuration
- `backend/pom.xml` (Unmodified) — Spring Boot 4.1.1, Java 25, Starter Web, Starter Data JPA, PostgreSQL JDBC, Flyway, Starter Security, Starter Validation, Starter WebMVC Test, Failsafe.
- `backend/.mvn/wrapper/maven-wrapper.properties` (Unmodified) — Pinned to Apache Maven 3.10.0, wrapperVersion 3.3.2.
- `backend/mvnw` (Unmodified) — Official Apache Maven Wrapper Unix script.
- `backend/mvnw.cmd` (Unmodified) — Official Apache Maven Wrapper Windows CMD batch script.
- `backend/README.md` (Sanitized) — Verified build, test, and run instructions with sanitized PowerShell credential template.
- `backend/src/main/resources/application.properties` (Sanitized) — HikariCP, Flyway, JPA, RestClient timeouts, pagination limits.
- `backend/src/test/resources/application.properties` (Sanitized) — In-memory H2 configuration for unit/slice test isolation.
- `backend/src/test/resources/application-it.properties` (Sanitized) — Real PostgreSQL integration test profile.

### B. Database Migrations
- `backend/src/main/resources/db/migration/V1__create_schema.sql` (Unmodified) — `product_categories`, `grievances`, `predictions`, `audit_log` tables with UUID PKs, FKs, JSONB columns, check constraints, composite queue indexes.
- `backend/src/main/resources/db/migration/V2__seed_categories.sql` (Unmodified) — Idempotent seed of 8 CFPB product labels with `ON CONFLICT DO NOTHING`.
- `backend/src/main/resources/db/migration/V3__grant_privileges.sql` (Unmodified) — Least-privilege grants for `civicresolve_app` (SELECT on categories; SELECT/INSERT/UPDATE on grievances; SELECT/INSERT on predictions & audit_log; USAGE on sequence).

### C. Java Production Application Sources
- `backend/src/main/java/ai/civicresolve/backend/CivicResolveApplication.java`
- `backend/src/main/java/ai/civicresolve/backend/config/RestClientConfig.java`
- `backend/src/main/java/ai/civicresolve/backend/config/SecurityConfig.java`
- `backend/src/main/java/ai/civicresolve/backend/controller/GrievanceController.java`
- `backend/src/main/java/ai/civicresolve/backend/controller/HealthController.java`
- `backend/src/main/java/ai/civicresolve/backend/controller/ProductCategoryController.java`
- `backend/src/main/java/ai/civicresolve/backend/dto/GrievanceDetailResponse.java`
- `backend/src/main/java/ai/civicresolve/backend/dto/GrievanceRequest.java`
- `backend/src/main/java/ai/civicresolve/backend/dto/GrievanceResponse.java`
- `backend/src/main/java/ai/civicresolve/backend/dto/GrievanceStatsResponse.java`
- `backend/src/main/java/ai/civicresolve/backend/dto/PageResponse.java`
- `backend/src/main/java/ai/civicresolve/backend/dto/ReviewRequest.java`
- `backend/src/main/java/ai/civicresolve/backend/entity/AuditLog.java`
- `backend/src/main/java/ai/civicresolve/backend/entity/Grievance.java`
- `backend/src/main/java/ai/civicresolve/backend/entity/GrievanceStatus.java`
- `backend/src/main/java/ai/civicresolve/backend/entity/Prediction.java`
- `backend/src/main/java/ai/civicresolve/backend/entity/ProductCategory.java`
- `backend/src/main/java/ai/civicresolve/backend/entity/TriagePriority.java`
- `backend/src/main/java/ai/civicresolve/backend/exception/GlobalExceptionHandler.java`
- `backend/src/main/java/ai/civicresolve/backend/exception/GrievanceNotFoundException.java`
- `backend/src/main/java/ai/civicresolve/backend/exception/InvalidReviewStateException.java`
- `backend/src/main/java/ai/civicresolve/backend/repository/AuditLogRepository.java`
- `backend/src/main/java/ai/civicresolve/backend/repository/GrievanceRepository.java`
- `backend/src/main/java/ai/civicresolve/backend/repository/PredictionRepository.java`
- `backend/src/main/java/ai/civicresolve/backend/repository/ProductCategoryRepository.java`
- `backend/src/main/java/ai/civicresolve/backend/service/GrievanceService.java`
- `backend/src/main/java/ai/civicresolve/backend/service/NlpClientService.java`
- `backend/src/main/java/ai/civicresolve/backend/service/NlpPrediction.java`

### D. Java Test Sources
- `backend/src/test/java/ai/civicresolve/backend/controller/GrievanceControllerTest.java` — 11 slice tests (@WebMvcTest, @MockitoBean, @WithMockUser).
- `backend/src/test/java/ai/civicresolve/backend/integration/PostgresIntegrationIT.java` — 9 integration tests (@SpringBootTest, @ActiveProfiles("it")).
- `backend/src/test/java/ai/civicresolve/backend/service/GrievanceServiceTest.java` — 10 unit tests (Mockito, business workflow, transaction boundaries).
- `backend/src/test/java/ai/civicresolve/backend/service/NlpClientServiceValidationTest.java` — 16 unit tests (contract validation, triage safety rule).

### E. Python NLP Service Sources & Tests
- `nlp-service/requirements.txt` (Unmodified) — Python dependency specifications.
- `nlp-service/README.md` (Unmodified) — Architecture and API documentation.
- `nlp-service/app/__init__.py`
- `nlp-service/app/config.py` — Settings, probability thresholds, text length bounds.
- `nlp-service/app/main.py` — FastAPI application, middleware, `/classify` and `/health` endpoints.
- `nlp-service/app/schemas.py` — Pydantic models: `ClassifyRequest`, `ClassifyResponse`, `TriagePriority`, `SentimentScore`.
- `nlp-service/app/preprocessing/__init__.py`
- `nlp-service/app/preprocessing/cleaner.py` — Text cleaning and normalization regexes.
- `nlp-service/app/services/__init__.py`
- `nlp-service/app/services/model_manager.py` — Lazy model loader for TF-IDF Logistic Regression and Bi-LSTM.
- `nlp-service/app/services/triage.py` — Rule-based triage priority engine, VADER sentiment, dual-trigger human review logic.
- `nlp-service/tests/test_api.py` — FastAPI test suite (27 tests).
- `nlp-service/tests/test_baseline.py` — Baseline TF-IDF evaluation tests.
- `nlp-service/tests/test_bilstm.py` — Bi-LSTM benchmark tests.
- `nlp-service/tests/test_data_pipeline.py` — Pre-split deduplication and leakage prevention tests.
- `nlp-service/tests/test_inspect.py` — Dataset inspection test suite.

### F. Repository Root Configuration & Documentation
- `.gitignore` (Unmodified)
- `MASTER_PLAN.md` (Unmodified) — Complete project roadmap with audited Phase 1–7 progress.
- `README.md` (Unmodified) — Project introduction.

### G. Test Reports (`test_reports/`)
- `test_reports/surefire-reports/TEST-ai.civicresolve.backend.controller.GrievanceControllerTest.xml`
- `test_reports/surefire-reports/TEST-ai.civicresolve.backend.service.GrievanceServiceTest.xml`
- `test_reports/surefire-reports/TEST-ai.civicresolve.backend.service.NlpClientServiceValidationTest.xml`
- `test_reports/surefire-reports/ai.civicresolve.backend.controller.GrievanceControllerTest.txt`
- `test_reports/surefire-reports/ai.civicresolve.backend.service.GrievanceServiceTest.txt`
- `test_reports/surefire-reports/ai.civicresolve.backend.service.NlpClientServiceValidationTest.txt`
- `test_reports/failsafe-reports/TEST-ai.civicresolve.backend.integration.PostgresIntegrationIT.xml`
- `test_reports/failsafe-reports/ai.civicresolve.backend.integration.PostgresIntegrationIT.txt`
- `test_reports/failsafe-reports/failsafe-summary.xml`

### H. Raw Environment Evidence (`environment_evidence/`)
- `environment_evidence/java_version.stdout.txt`
- `environment_evidence/java_version.stderr.txt`
- `environment_evidence/java_version.exitcode.txt`
- `environment_evidence/mvnw_version.stdout.txt`
- `environment_evidence/mvnw_version.stderr.txt`
- `environment_evidence/mvnw_version.exitcode.txt`
- `environment_evidence/python_version.stdout.txt`
- `environment_evidence/python_version.stderr.txt`
- `environment_evidence/python_version.exitcode.txt`
- `environment_evidence/python_packages_show.stdout.txt`
- `environment_evidence/python_packages_show.stderr.txt`
- `environment_evidence/python_packages_show.exitcode.txt`
- `environment_evidence/pip_list_target_packages.stdout.txt`
- `environment_evidence/pip_list_target_packages.stderr.txt`
- `environment_evidence/pip_list_target_packages.exitcode.txt`
- `environment_evidence/git_status.stdout.txt`
- `environment_evidence/git_status.stderr.txt`
- `environment_evidence/git_status.exitcode.txt`
- `environment_evidence/git_diff.stdout.txt`
- `environment_evidence/git_diff.stderr.txt`
- `environment_evidence/git_diff.exitcode.txt`

---

## 6. Audit Bundle Integrity & Checksum

- **Total Staged Files in Bundle:** 93 (including this manifest)
- **Archive File:** `CivicResolveAI_Phase7B_AuditBundle.zip`
- **Archive Checksum File:** `CivicResolveAI_Phase7B_AuditBundle.zip.sha256`
