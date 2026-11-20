# CivicResolve AI — Spring Boot Backend

Java 25 + Spring Boot 4.1.1 + PostgreSQL. CI validates against PostgreSQL 16.

## Prerequisites

| Requirement | Verified Version |
|---|---|
| JDK | 25.0.2 (`C:\Program Files\Java\jdk-25.0.2`) |
| PostgreSQL | 16+ |
| Maven Wrapper | Downloads Apache Maven 3.10.0 on first use |
| FastAPI NLP service | Running on `http://127.0.0.1:8000` |

## Environment Variables (Required)

Configure these in your PowerShell session **before** building or running the backend.
**Never commit real passwords to source control.**

```powershell
# Run from the project root (CivicResolveAI/)

# Application datasource (civicresolve_app — restricted role)
$env:SPRING_DATASOURCE_URL      = "jdbc:postgresql://127.0.0.1:5432/civicresolve"
$env:SPRING_DATASOURCE_USERNAME = "civicresolve_app"
$env:SPRING_DATASOURCE_PASSWORD = "<civicresolve_app password>"

# Flyway datasource (civicresolve_migrator — schema-change role)
$env:SPRING_FLYWAY_URL      = "jdbc:postgresql://127.0.0.1:5432/civicresolve"
$env:SPRING_FLYWAY_USER     = "civicresolve_migrator"
$env:SPRING_FLYWAY_PASSWORD = "<civicresolve_migrator password>"

# NLP service URL (defaults to http://127.0.0.1:8000)
$env:NLP_SERVICE_URL = "http://127.0.0.1:8000"

# Reviewer account password (BCrypt-12 hashed at startup)
$env:REVIEWER_PASSWORD = "<choose a strong password>"
```

> **IMPORTANT**: If `REVIEWER_PASSWORD` is not set, the reviewer account is locked with a random inaccessible password. Set this variable before starting the server to enable authentication.

## Build and Run

All commands run from the **project root** (`CivicResolveAI/`).

### First run — Maven wrapper downloads Maven 3.10.0

```powershell
# Verify wrapper and Maven version
backend\mvnw.cmd -version
```

Expected output (after download):
```
Apache Maven 3.10.0 (...)
Java version: 25.0.2, vendor: Oracle Corporation
```

### Compile

```powershell
backend\mvnw.cmd compile
```

### Run unit and controller tests

```powershell
backend\mvnw.cmd test
```

### Run full build (compile + test + package)

```powershell
backend\mvnw.cmd clean verify
```

### Run integration tests against PostgreSQL

Requires all DB environment variables to be set:

```powershell
backend\mvnw.cmd verify
```

### Start the application

```powershell
backend\mvnw.cmd spring-boot:run
```

## API Endpoints

Base URL: `http://localhost:8080/api`

### Public Endpoints (no authentication required)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/grievances` | Submit a new complaint narrative |
| `POST` | `/api/grievances/track` | Retrieve a scrubbed status using reference ID and tracking secret |
| `GET` | `/api/product-categories` | List the 8 supported categories |
| `GET` | `/api/health` | Liveness check |

### Authenticated Endpoints (HTTP Basic — REVIEWER role required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/grievances` | Paginated, filtered grievance queue |
| `GET` | `/api/grievances/stats` | Dashboard counts by status and priority |
| `GET` | `/api/grievances/{id}` | Detailed view including original prediction |
| `PATCH` | `/api/grievances/{id}/review` | APPROVE / OVERRIDE / REJECT |
| `GET` | `/api/grievances/analytics/overview` | Operational analytics, including counts of persisted sentiment labels |
| `GET` | `/api/grievances/analytics/active-learning-export` | Curated export in `jsonl`, `csv`, or `manifest` format |

The reviewer queue applies `status`, `priority`, `category`, and `search` before pagination. Search matches a case-insensitive category substring or grievance ID prefix. Results are ordered by submission time descending, then ID descending. Pages are zero-based and page size defaults to 20 with a cap of 100.

Sentiment counts cover prediction records labeled `NEGATIVE`, `NEUTRAL`, or `POSITIVE`. Unlabeled or unrecognized records are excluded from those counts. CSV exports quote text fields and prefix spreadsheet-sensitive values with an apostrophe. Use JSONL for machine processing when you need the original masked text.

### Example: Submit a complaint

```bash
curl -X POST http://localhost:8080/api/grievances \
  -H "Content-Type: application/json" \
  -d '{"description": "I noticed multiple unauthorized inquiries on my credit report from a collection agency I have never heard of. I submitted a formal dispute but received no response within 30 days."}'
```

Response (HTTP 201):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "trackingSecret": "trk_one_time_secret_returned_only_here",
  "category": "Credit reporting or other personal consumer reports",
  "priority": "LOW",
  "status": "AUTO_ROUTED",
  "reviewRequired": false,
  "submittedAt": "2026-10-23T08:30:00Z",
  "updatedAt": "2026-10-23T08:30:00Z",
  "version": 0
}
```

### Example: Review a complaint (authenticated)

```bash
curl -X PATCH http://localhost:8080/api/grievances/{id}/review \
  -u reviewer:<password> \
  -H "Content-Type: application/json" \
  -d '{"action": "APPROVE", "expectedVersion": 0}'
```

## Authentication

- **Method**: HTTP Basic Authentication
- **Endpoint protection**: All `GET /api/grievances*` and `PATCH /api/grievances*` require the `REVIEWER` role
- **Reviewer credentials**: username `reviewer`, password from `REVIEWER_PASSWORD` env var
- **Password hashing**: BCrypt cost factor 12
- **Public endpoints**: `POST /api/grievances`, `POST /api/grievances/track`, `GET /api/product-categories`, `GET /api/health`

## Database Configuration

### Roles

| Role | Purpose | Permissions |
|---|---|---|
| `civicresolve_migrator` | Flyway schema migrations | Full DDL permissions |
| `civicresolve_app` | Application runtime queries | SELECT/INSERT/UPDATE on grievances; SELECT/INSERT on predictions and audit_log; SELECT on product_categories |

### Migrations (Flyway)

Migrations run automatically at startup using `civicresolve_migrator`:

| Version | File | Description |
|---|---|---|
| V1 | `V1__create_schema.sql` | Creates the initial four tables with PK, FK, indexes, constraints, JSONB |
| V2 | `V2__seed_categories.sql` | Seeds 8 CFPB product categories (idempotent) |
| V3 | `V3__grant_privileges.sql` | Grants least-privilege to `civicresolve_app` |
| V4 | `V4__add_version_and_prediction_category_fk.sql` | Adds optimistic locking and prediction-category integrity |
| V5 | `V5__add_complaint_tracking.sql` | Adds hashed public tracking credentials and least-privilege grants |
| V6 | `V6__add_prediction_explanation.sql` | Adds immutable JSONB explanation snapshots |

### Schema Summary

- **`product_categories`** — 8 approved CFPB labels (read-only at runtime)
- **`grievances`** — Complaint UUID, narrative, category, priority, status, timestamps
- **`predictions`** — Immutable NLP output with JSONB probability distribution and reasons
- **`audit_log`** — Append-only event log (INSERT only, never UPDATE/DELETE)
- **`grievance_tracking_credentials`** — Salted tracking-secret hashes and bounded lookup metadata

## Error Responses (RFC 9457 Problem Details)

All errors return structured Problem Details:

```json
{
  "type": "https://civicresolve.ai/errors/validation",
  "title": "Validation Failed",
  "status": 400,
  "detail": "One or more fields failed validation.",
  "errors": ["description: Description must be between 20 and 5000 characters."]
}
```

| Condition | HTTP Status |
|---|---|
| Input validation failure | 400 |
| Invalid pagination or malformed query parameter | 400 |
| Grievance not found | 404 |
| Invalid review state transition | 409 |
| NLP service unavailable | 503 |
| NLP service timeout | 504 |
| NLP malformed response / safety contract violation | 502 |
| Internal server error | 500 |

## Submission Workflow

1. Validate the narrative (Bean Validation — 20–5000 chars, not blank)
2. Call FastAPI `/classify` **outside** the database transaction
3. Validate the NLP prediction (approved category, valid priority, triage safety contract)
4. If `flag_for_review=true` → status `PENDING_REVIEW`; otherwise → `AUTO_ROUTED`
5. **Atomically persist**: grievance + original prediction + tracking credential + initial audit event
6. If any step fails, no partial records are created

## Triage Safety Contract

The FastAPI service uses a **dual-trigger** architecture: human review fires when:
1. Classification uncertainty: top probability < 0.55 or margin < 0.15
2. Triage priority is HIGH or CRITICAL (regardless of confidence)

**The Spring backend enforces**: `HIGH` or `CRITICAL` priority with `flag_for_review=false` is rejected as a 502 Bad Gateway error. This cannot silently bypass the review queue.

## Test Commands

```powershell
# Unit tests only (no DB required)
backend\mvnw.cmd test

# Integration tests (requires DB env vars)
backend\mvnw.cmd verify

# Full build (clean + unit tests + package + integration tests)
backend\mvnw.cmd clean verify

```

## Known Limitations

1. **Authentication**: In-memory HTTP Basic authentication. Replace with LDAP/OIDC before production.
2. **CORS**: Allowed origins are configured with `CORS_ALLOWED_ORIGINS`; development defaults cover the documented Vite ports and must be overridden for deployment.
3. **Integration tests**: `mvn verify` requires a real isolated PostgreSQL database plus both application and Flyway credentials; no embedded H2 compatibility substitute is configured.
4. **NLP service**: Narrative validation uses 20–5000 char range (Spring), while FastAPI accepts up to 10,000. This is a conservative Spring-side constraint; adjust only with an API-contract review.
5. **Reviewer account**: Only one configured reviewer username `reviewer`. Multi-user support requires a separate identity-management phase.
