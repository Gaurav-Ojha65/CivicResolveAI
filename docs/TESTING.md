# CivicResolve AI — Verification and Testing Guide

The repository has separate verification tracks for the React frontend, Spring Boot backend, live PostgreSQL integration tests, and FastAPI NLP service. Do not copy historical pass counts into documentation; use the output from the current local or CI run.

## Continuous Integration

`.github/workflows/ci.yml` runs three independent jobs on pushes and pull requests:

- Frontend: Node 22, `npm ci`, TypeScript validation, Vitest, and the production build.
- Backend: Java 25 and `mvn verify` against a PostgreSQL 16 service with separate `civicresolve_migrator` and `civicresolve_app` roles.
- NLP service: Python 3.12, dependency installation from `requirements.txt`, and the full Pytest suite.

The jobs do not deploy or merge changes.

## Frontend

Run from `frontend/`:

```powershell
npm ci
npm run typecheck
npm test -- --fileParallelism=false
npm run build
```

The sequential file setting reduces resource contention in constrained runners. Tests cover API error normalization, in-memory authentication, citizen workflows, reviewer filtering and pagination, keyboard behavior, accessibility, and decision-support components.

## Backend Unit and Web Tests

Run from the repository root:

```powershell
.\backend\mvnw.cmd test
```

Surefire tests cover DTO validation, controllers, security, rate limiting, service behavior, optimistic locking, structured API errors, and privacy invariants. Unit and web-slice tests do not substitute an embedded database for PostgreSQL.

## PostgreSQL Integration Tests

Use an isolated test database, never a development or production database. Configure both runtime and Flyway credentials:

```powershell
$env:SPRING_DATASOURCE_URL      = "jdbc:postgresql://127.0.0.1:5432/civicresolve_test"
$env:SPRING_DATASOURCE_USERNAME = "civicresolve_app"
$env:SPRING_DATASOURCE_PASSWORD = "<TEST_APP_PASSWORD>"
$env:SPRING_FLYWAY_URL          = "jdbc:postgresql://127.0.0.1:5432/civicresolve_test"
$env:SPRING_FLYWAY_USER         = "civicresolve_migrator"
$env:SPRING_FLYWAY_PASSWORD     = "<TEST_MIGRATOR_PASSWORD>"

.\backend\mvnw.cmd verify
```

The integration suite exercises Flyway V1–V6, constraints, role isolation, transactional persistence, and concurrent review behavior. If PostgreSQL or either role is unavailable, report the integration track as not run; do not describe it as passed or silently replaced by H2.

## NLP Service

Run with the supported Python 3.12 environment from `nlp-service/`:

```powershell
python -m pip install -r requirements.txt
python -m pytest tests -v
```

The suite covers model-artifact loading, schema validation, classification and triage rules, explanation identities, dual-model behavior, precedent ranking, and concurrent model snapshots. The committed artifacts are test inputs and must not be retrained or overwritten by verification.

## Dependency and Security Checks

Practical baseline checks are:

```powershell
# Frontend dependency inventory
cd frontend
npm audit --omit=dev

# Python environment consistency
cd ..\nlp-service
python -m pip check

# Maven dependency metadata (requires network access)
cd ..\backend
.\mvnw.cmd dependency:tree
```

Dependency scanners can require registry or advisory-network access. Record network-unavailable checks explicitly rather than treating them as successful.

## Reporting Results

For each command, record the exact command, pass/fail/skip counts, and the reason for anything not run. A build or typecheck with no test cases is a separate verification result and must not be included in a test pass count.
