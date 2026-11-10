# Phase 8.1 — Read-Only Frontend & Backend API Readiness Audit Report

> **Project:** CivicResolve AI — Intelligent Consumer-Finance Complaint Triage Platform  
> **Phase:** 8.1 — Frontend & Backend API Readiness Technical Audit  
> **Date:** October 30, 2026  
> **Mode:** 100% Read-Only Inspection  
> **Target Artifact:** `phase-8.1-frontend-api-readiness-report.md` (Project Root)  

---

## 1. Executive Summary

This audit assesses the technical readiness of the CivicResolve AI codebase for the implementation of **Phase 8 (React Frontend)**. The backend comprises a Spring Boot 4.1.1 REST API backed by PostgreSQL 18.6 and an integrated FastAPI NLP classification service serving a classical TF-IDF + Logistic Regression model.

### Key Audit Findings:
1. **Frontend Directory Status:** Currently **ABSENT**. There is no `frontend/` directory, `package.json`, or React build configuration anywhere in the repository. Node.js `v24.20.0` and npm `11.19.0` are available in the local execution environment.
2. **Backend API Endpoints:** Seven endpoints exist across three controllers (`GrievanceController`, `ProductCategoryController`, `HealthController`). Public complaint submission (`POST /api/grievances`), product category listing (`GET /api/product-categories`), and health check (`GET /api/health`) are active and unauthenticated.
3. **CORS & Authentication Blocker:** Spring Security (`SecurityConfig.java:86`) has CORS explicitly disabled (`cors.disable()`), and HTTP Basic authentication defaults to issuing `WWW-Authenticate: Basic` headers on 401 responses. This blocks cross-origin requests from a Vite dev server (`http://localhost:5173`) and causes native browser credential dialogs instead of custom in-app login forms.
4. **Missing Narrative in Detail View:** `GrievanceDetailResponse.java` deliberately omits the raw consumer narrative. While this protects citizen privacy in logs, it prevents review staff from reading the actual complaint text when inspecting a case in the UI.
5. **Optimistic Locking Gap:** Database migration V4 introduced `@Version` on `Grievance`, but `version` is neither emitted in `GrievanceResponse`/`GrievanceDetailResponse` nor accepted in `ReviewRequest`. Optimistic locking currently protects only against in-memory overlapping server transactions, not stale client review submissions.
6. **Audit Timeline Gap:** While `audit_log` records are written on submission and reviews, no backend endpoint exposes them to the client.
7. **Public Case Tracking Gap:** `GET /api/grievances/{id}` requires `ROLE_REVIEWER`. Citizens have no endpoint to check the status of their complaint by ID after submission.

### Recommendation:
**CONDITIONAL GO.** Frontend scaffolding and public submission form implementation can proceed immediately. However, targeted backend micro-adjustments (CORS enablement, auth entry point, and DTO additions for narrative, version, and audit log) are required before staff review workflows and public tracking can be fully functional.

---

## 2. Repository Structure Findings

A top-level directory listing confirms the following repository layout:

```
CivicResolveAI/
├── .gitignore
├── .pytest_cache/
├── .venv/                              (Python 3.14 virtual environment)
├── .vscode/
├── AUDIT_BUNDLE_MANIFEST.md
├── CivicResolveAI_Audit_Bundle.zip
├── EVIDENCE_INDEX.md
├── FILE_INVENTORY.md
├── MASTER_PLAN.md
├── README.md
├── audit/                              (Historical phase audit logs)
├── backend/                            (Spring Boot 4.1.1 Java 25 service)
│   ├── mvnw
│   ├── mvnw.cmd
│   ├── pom.xml
│   └── src/
│       ├── main/
│       │   ├── java/ai/civicresolve/backend/
│       │   │   ├── CivicResolveApplication.java
│       │   │   ├── config/             (Security, RestClient, Isolation Guard)
│       │   │   ├── controller/         (Grievance, ProductCategory, Health)
│       │   │   ├── dto/                (Requests, Responses, Stats)
│       │   │   ├── entity/             (Grievance, Prediction, AuditLog, ProductCategory)
│       │   │   ├── exception/          (GlobalExceptionHandler, Custom Exceptions)
│       │   │   ├── repository/         (Spring Data JPA Repositories)
│       │   │   └── service/            (GrievanceService, PersistenceService, NlpClientService)
│       │   └── resources/
│       │       ├── application.properties
│       │       └── db/migration/       (Flyway V1, V2, V3, V4 SQL scripts)
│       └── test/
└── nlp-service/                        (FastAPI NLP Inference & Heuristic Triage Service)
    ├── README.md
    ├── requirements.txt
    ├── app/                            (main.py, schemas.py, config.py, services)
    ├── data/                           (raw CFPB archive, processed splits)
    ├── models_saved/                   (TF-IDF baseline, Bi-LSTM benchmark artifacts)
    ├── tests/                          (87 passing pytest suites)
    └── training/                       (preprocessing, baseline, and neural trainers)
```

---

## 3. Existing Frontend Assessment

1. **Existence:** `frontend/` directory is **CURRENTLY ABSENT**.
2. **File Check:** Searching the repository recursively for `package.json`, `vite.config.ts`, `tsconfig.json`, or `.jsx`/`.tsx` files returned zero results.
3. **Tooling Environment:**
   - Node.js runtime: `v24.20.0` (confirmed via `node -v`)
   - npm package manager: `11.19.0` (confirmed via `npm -v`)
   - Both tools are natively available in PATH without requiring installation.

---

## 4. Complete Backend API Inventory

Source evidence: `backend/src/main/java/ai/civicresolve/backend/controller/` and `SecurityConfig.java`.

| HTTP Method | URI Path | Controller Class & Method | Security / Authorization | Query / Path Parameters | Request Body DTO | Response Body DTO / Entity |
|---|---|---|---|---|---|---|
| `POST` | `/api/grievances` | `GrievanceController.submit` (`:54-63`) | `permitAll()` (`SecurityConfig:90`) | None | `GrievanceRequest` | `GrievanceResponse` (Status: 201 Created + `Location` header) |
| `GET` | `/api/grievances` | `GrievanceController.list` (`:69-78`) | `hasRole('REVIEWER')` (`:70`, `SecurityConfig:94`) | `status` (GrievanceStatus, optional)<br>`priority` (TriagePriority, optional)<br>`category` (String, optional)<br>`page` (int, default: 0)<br>`size` (int, default: 20, max: 100) | None | `Page<GrievanceResponse>` (Spring Data Page JSON) |
| `GET` | `/api/grievances/stats` | `GrievanceController.stats` (`:84-88`) | `hasRole('REVIEWER')` (`:85`, `SecurityConfig:94`) | None | None | `GrievanceStatsResponse` |
| `GET` | `/api/grievances/{id}` | `GrievanceController.getById` (`:94-99`) | `hasRole('REVIEWER')` (`:95`, `SecurityConfig:94`) | `id` (UUID, required path variable) | None | `GrievanceDetailResponse` |
| `PATCH` | `/api/grievances/{id}/review` | `GrievanceController.review` (`:106-112`) | `hasRole('REVIEWER')` (`:107`, `SecurityConfig:94`) | `id` (UUID, required path variable) | `ReviewRequest` | `GrievanceResponse` |
| `GET` | `/api/product-categories` | `ProductCategoryController.list` (`:26-29`) | `permitAll()` (`SecurityConfig:91`) | None | None | `Map<String, List<String>>` (`{"categories": [...]}`) |
| `GET` | `/api/health` | `HealthController.health` (`:19-26`) | `permitAll()` (`SecurityConfig:92`) | None | None | `Map<String, Object>` (`{"status": "ok", ...}`) |

---

## 5. Exact DTO & Error Response (`ProblemDetail`) Contract Summary

Source evidence: `backend/src/main/java/ai/civicresolve/backend/dto/` and `GlobalExceptionHandler.java`.

### 5.1 Request DTOs

#### `GrievanceRequest` (`GrievanceRequest.java:12-19`)
```java
public record GrievanceRequest(
    @NotBlank(message = "Description is required and must not be blank.")
    @Size(min = 20, max = 5000, message = "Description must be between 20 and 5000 characters.")
    String description
) {}
```

#### `ReviewRequest` (`ReviewRequest.java:20-39`)
```java
public record ReviewRequest(
    @NotNull(message = "Action is required.")
    @Pattern(regexp = "APPROVE|OVERRIDE|REJECT", message = "Action must be one of: APPROVE, OVERRIDE, REJECT.")
    String action,

    String newCategory, // Optional; validated against product_categories when action is OVERRIDE

    @Pattern(regexp = "LOW|MEDIUM|HIGH|CRITICAL|", message = "newPriority must be one of: LOW, MEDIUM, HIGH, CRITICAL.")
    String newPriority, // Optional; used when action is OVERRIDE

    @Size(max = 2000, message = "Review note must not exceed 2000 characters.")
    String reviewNote   // Mandatory when action is OVERRIDE or REJECT
) {}
```

### 5.2 Response DTOs

#### `GrievanceResponse` (`GrievanceResponse.java:14-22`)
```java
public record GrievanceResponse(
    UUID id,
    String assignedCategory,
    TriagePriority priority,      // LOW | MEDIUM | HIGH | CRITICAL
    GrievanceStatus status,       // PENDING_REVIEW | AUTO_ROUTED | APPROVED | OVERRIDDEN | REJECTED
    boolean reviewRequired,
    Instant submittedAt,
    Instant updatedAt
) {}
```

#### `GrievanceDetailResponse` (`GrievanceDetailResponse.java:17-60`)
```java
public record GrievanceDetailResponse(
    UUID id,
    String assignedCategory,
    TriagePriority priority,
    GrievanceStatus status,
    boolean reviewRequired,
    Instant submittedAt,
    Instant updatedAt,
    PredictionSummary originalPrediction
) {
    public record PredictionSummary(
        String predictedCategory,
        String modelUsed,
        String modelVersion,
        double confidence,
        double margin,
        Map<String, Double> probabilities, // 8 CFPB product category keys -> double estimates
        boolean flagForReview,
        List<String> reviewReasons,
        String triagePriority,
        List<String> priorityReasons,
        Double sentimentScore,             // -1.0 to +1.0 VADER score
        String sentimentLabel,             // NEGATIVE | NEUTRAL | POSITIVE
        Instant predictedAt
    ) {}
}
```

#### `GrievanceStatsResponse` (`GrievanceStatsResponse.java:8-13`)
```java
public record GrievanceStatsResponse(
    long total,
    Map<String, Long> byStatus,       // Counts for all 5 GrievanceStatus keys
    Map<String, Long> byPriority,     // Counts for all 4 TriagePriority keys
    long pendingReview
) {}
```

#### `ProductCategoryResponse` (`ProductCategoryController.java:27-29`)
```json
{
  "categories": [
    "Checking or savings account",
    "Credit card",
    "Credit reporting or other personal consumer reports",
    "Debt collection",
    "Money transfer, virtual currency, or money service",
    "Mortgage",
    "Student loan",
    "Vehicle loan or lease"
  ]
}
```

#### `HealthResponse` (`HealthController.java:20-25`)
```json
{
  "status": "ok",
  "service": "civicresolve-backend",
  "timestamp_utc": "2026-10-30T14:24:43Z"
}
```

### 5.3 Error Response Contract (RFC 9457 `ProblemDetail`)
Source evidence: `GlobalExceptionHandler.java:24-107`.

All errors return JSON with content type `application/problem+json`:

| Scenario | HTTP Status | Type URI (`type`) | Title (`title`) | Detail (`detail`) | Custom Properties |
|---|---|---|---|---|---|
| Validation Failure | `400 Bad Request` | `https://civicresolve.ai/errors/validation` | `Validation Failed` | `"One or more fields failed validation."` | `errors`: List of `"field: message"` strings |
| Case Not Found | `404 Not Found` | `https://civicresolve.ai/errors/not-found` | `Grievance Not Found` | `"Grievance not found: <UUID>"` | None |
| Invalid Review State | `409 Conflict` | `https://civicresolve.ai/errors/invalid-review-state` | `Invalid Review State` | Specific state violation message (e.g. `"Grievance <id> is in a terminal state: APPROVED and cannot be reviewed again."`) | None |
| Optimistic Lock Conflict | `409 Conflict` | `https://civicresolve.ai/errors/conflict` | `Concurrent Modification Conflict` | `"The grievance was updated by another transaction. Please refresh and try again."` | None |
| NLP Upstream Error | `400 / 502 / 503 / 504` | `https://civicresolve.ai/errors/nlp-service` | `NLP Service Error` | Safe sanitized upstream message | None |
| Unexpected Internal Error | `500 Internal Error` | `https://civicresolve.ai/errors/internal` | `Internal Server Error` | `"An unexpected error occurred. Please try again later."` | None |

---

## 6. Authentication, Authorization, CORS & CSRF Assessment

Source evidence: `SecurityConfig.java:1-100`.

### 6.1 Authentication Mechanism
- **Type:** HTTP Basic (`httpBasic(basic -> {})`, `SecurityConfig.java:87`).
- **Session Policy:** Spring Security default session management (stateless REST usage intended, but session creation not explicitly disabled with `SessionCreationPolicy.STATELESS`).
- **User Provisioning:** Single in-memory account configured in `userDetailsService` (`SecurityConfig.java:58-74`):
  - Username: `reviewer`
  - Password: Read from `REVIEWER_PASSWORD` environment variable at startup. If empty, a random inaccessible 64-character UUID secret is generated.
  - Role: `ROLE_REVIEWER`
  - Password Encoder: `BCryptPasswordEncoder(12)` (`SecurityConfig.java:45-47`).
- **User Registration / Management:** **NOT IMPLEMENTED**. There are no endpoints for registration, password reset, or multiple reviewer accounts.

### 6.2 Browser Native Popup Vulnerability
- `SecurityConfig.java` defines standard HTTP Basic without a custom `AuthenticationEntryPoint`.
- Default behavior: on receiving an unauthenticated request to a protected endpoint, Spring Security returns `HTTP 401 Unauthorized` with the header:
  ```http
  WWW-Authenticate: Basic realm="Realm"
  ```
- **UI Impact:** When an AJAX/fetch call receives this header, Chromium, Firefox, and Safari pop up the browser's native modal login prompt rather than allowing a React form to capture credentials gracefully.

### 6.3 CORS & CSRF
- **CSRF:** Explicitly disabled via `csrf -> csrf.disable()` (`SecurityConfig.java:85`).
- **CORS:** Explicitly disabled via `cors -> cors.disable()` (`SecurityConfig.java:86`).
- **UI Impact (BLOCKER):** When a browser makes a cross-origin request from `http://localhost:5173` to `http://localhost:8080`, Spring Boot will NOT send `Access-Control-Allow-Origin` or `Access-Control-Allow-Credentials` headers. The browser's CORS policy will reject the response, blocking all API communication from the frontend dev server.

---

## 7. NLP Integration & AI Assessment Data Availability

Source evidence: `NlpClientService.java`, `NlpPrediction.java`, `Prediction.java`, and `nlp-service/app/schemas.py`.

### 7.1 Upstream Data Received from FastAPI
When Spring Boot calls `POST http://127.0.0.1:8000/classify`, FastAPI returns 13 fields:
1. `product_category` (String)
2. `confidence` (Double) — uncalibrated top-class probability estimate
3. `margin` (Double) — difference between top and second class estimates
4. `probabilities` (Map<String, Double>) — all 8 CFPB product category estimates
5. `model_used` (String) — `"baseline_tfidf_logreg"`
6. `model_version` (String) — artifact SHA-256 (`"7a9964e0ef15514d"`)
7. `flag_for_review` (Boolean) — dual-trigger indicator
8. `review_reasons` (List<String>) — diagnostic explanation strings
9. `triage_priority` (String) — `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
10. `priority_reasons` (List<String>) — heuristic keyword match explanations
11. `sentiment_score` (Double) — VADER compound score (-1.0 to +1.0)
12. `sentiment_label` (String) — `NEGATIVE`, `NEUTRAL`, `POSITIVE`
13. `disclaimer` (String) — statutory calibration disclosure

### 7.2 Persistence & Frontend Availability
- **Persisted to Database (`predictions` table):** 12 fields are persisted (`Prediction.java:39-100`). The `disclaimer` string is verified by Java validation (`NlpClientService.java:301`) but **NOT** stored in the database.
- **Available to Citizen on Submission (`POST /api/grievances`):**
  The citizen receives `GrievanceResponse`:
  - `assignedCategory`
  - `priority`
  - `status`
  - `reviewRequired`
  - **NOT available to citizen:** Confidence score, probability distribution, review reasons, sentiment scores, and disclaimer are withheld from the public submission receipt.
- **Available to Staff on Detail View (`GET /api/grievances/{id}`):**
  Staff receives all 12 persisted prediction attributes inside `GrievanceDetailResponse.PredictionSummary` (`GrievanceDetailResponse.java:28-60`).

---

## 8. Grievance Lifecycle, Reviewer State Machine & Optimistic Locking Assessment

Source evidence: `Grievance.java`, `GrievanceService.java`, and `V4__add_version_and_prediction_category_fk.sql`.

### 8.1 State Machine
```
      [ Citizen Submission ]
                │
         Dual-Trigger NLP
         ┌──────┴──────┐
         ▼             ▼
[ PENDING_REVIEW ]   [ AUTO_ROUTED ]
         │                 │
         └────────┬────────┘
                  │ Reviewer Action (PATCH /api/grievances/{id}/review)
         ┌────────┼────────┐
         ▼        ▼        ▼
    [APPROVED] [OVERRIDDEN] [REJECTED]
         │        │        │
         └────────┴────────┘
           TERMINAL STATES (No further reviews allowed)
```

1. **Initial States:**
   - `PENDING_REVIEW`: Set if `flag_for_review == true` (uncertainty breached OR `priority` is `HIGH`/`CRITICAL`).
   - `AUTO_ROUTED`: Set if `flag_for_review == false` (`priority` is `LOW`/`MEDIUM` and confidence is high).
2. **Review Actions:**
   - `APPROVE`: Transitions status to `APPROVED`, sets `review_required = false`. `reviewNote` is optional.
   - `OVERRIDE`: Transitions status to `OVERRIDDEN`, sets `review_required = false`. Requires `reviewNote` non-blank and at least one of `newCategory` or `newPriority`.
   - `REJECT`: Transitions status to `REJECTED`, sets `review_required = false`. Requires `reviewNote` non-blank.
3. **Terminal Enforcement:** `APPROVED`, `OVERRIDDEN`, and `REJECTED` are terminal (`GrievanceService.java:52-56`). Attempting review on a terminal case throws `InvalidReviewStateException` (HTTP 409).

### 8.2 Optimistic Locking (`@Version`) Assessment
- **Entity Annotation:** `Grievance.java:75-77` declares `@Version @Column(name = "version", nullable = false) private Long version;`.
- **Response DTOs:** Neither `GrievanceResponse` nor `GrievanceDetailResponse` includes the `version` field.
- **Request DTO:** `ReviewRequest` does not accept a `version` field.
- **HTTP Headers:** No `If-Match` or ETag header is checked in `GrievanceController.review`.
- **Finding:** Optimistic locking is **SERVER-INTERNAL ONLY**. It detects collisions only when two backend worker threads execute concurrent reviews against the same in-memory entity during overlapping transactions. A browser cannot submit the version it read, meaning the API cannot detect when a reviewer takes 10 minutes to review a grievance that another reviewer modified in the database 5 minutes earlier (unless the first update moved it to a terminal state).

### 8.3 Audit Log Exposure
- `AuditLog.java` records: `actor`, `action`, `previousStatus`, `newStatus`, `previousCategory`, `newCategory`, `previousPriority`, `newPriority`, `reviewNote`, and `createdAt`.
- `AuditLogRepository.java:18` provides `findByGrievanceIdOrderByCreatedAtAsc(UUID grievanceId)`.
- **Finding:** **NOT EXPOSED**. No controller endpoint queries or returns audit logs. Neither the public nor staff can view case history timelines through the API.

---

## 9. Frontend Readiness Matrix

| Feature / Capability | Backend Status | Evidence | Frontend Impact / Workaround |
|---|---|---|---|
| **Public Landing Page** | **Supported** | `GET /api/health`<br>`GET /api/product-categories` | Landing page can display service status, operational metrics, and the 8 supported categories. |
| **Citizen Complaint Submission** | **Supported** | `POST /api/grievances` | Anonymous citizen can submit complaints (20–5000 chars); receives triage receipt with UUID, assigned category, and priority. |
| **Public AI Triage Receipt** | **Partial** | `GrievanceResponse.java` | Receives category, priority, and review status, but lacks confidence score, margin, and explanation reasons. |
| **Public Case Status Tracking** | **Blocked** | `GET /api/grievances/{id}` requires `ROLE_REVIEWER` | Citizen cannot query complaint status by UUID after leaving the submission page. |
| **Staff Login & Session** | **Blocked** | `SecurityConfig.java:86-87` | Blocked by disabled CORS and browser-native Basic Auth prompt on 401. |
| **Reviewer Queue Table** | **Supported** | `GET /api/grievances` | Paginated queue with filters by `status`, `priority`, and `category` is fully functional. |
| **Queue Free-Text Search** | **Not Implemented** | `GrievanceRepository.java:25-36` | Searching by narrative text or UUID substring is not supported by the query. |
| **AI Telemetry in Detail View** | **Supported** | `GrievanceDetailResponse.java` | Full 8-class probabilities, confidence, margin, model version, and sentiment are available. |
| **Complaint Narrative in Detail View** | **Blocked** | `GrievanceDetailResponse.java` | Reviewer cannot read the citizen's original complaint text in the case detail view. |
| **Review Actions (Approve/Override/Reject)** | **Supported** | `PATCH /api/grievances/{id}/review` | Review workflow transitions cases and writes append-only audit records. |
| **Client Optimistic Locking (HTTP 409)** | **Partial** | `Grievance.java:75` vs `ReviewRequest.java` | Server-internal locking works; client-driven version conflict detection is absent. |
| **Dashboard Statistics** | **Supported** | `GET /api/grievances/stats` | Aggregated counts by status and priority are available for dashboard cards/charts. |
| **Case Audit Timeline** | **Blocked** | `AuditLogRepository.java` | Audit records are recorded in PostgreSQL but not exposed via any REST endpoint. |

---

## 10. Missing or Recommended Backend Micro-Adjustments

To enable an uncompromised, production-quality Phase 8 frontend, the following targeted backend adjustments are recommended:

1. **Enable CORS in Spring Security (MANDATORY BLOCKER):**
   - File: `backend/src/main/java/ai/civicresolve/backend/config/SecurityConfig.java`
   - Action: Replace `.cors(cors -> cors.disable())` with a `CorsConfigurationSource` bean allowing origin `http://localhost:5173` (Vite), methods `GET, POST, PATCH, OPTIONS`, headers `Authorization, Content-Type`, and credentials enabled.
2. **Suppress `WWW-Authenticate` Header on 401 (HIGH PRIORITY):**
   - File: `backend/src/main/java/ai/civicresolve/backend/config/SecurityConfig.java`
   - Action: Register a custom `AuthenticationEntryPoint` that returns `HTTP 401 Unauthorized` without the `WWW-Authenticate: Basic` header. This allows the React login modal to handle failed credentials cleanly without triggering browser popups.
3. **Include `narrative` in `GrievanceDetailResponse` (HIGH PRIORITY):**
   - File: `backend/src/main/java/ai/civicresolve/backend/dto/GrievanceDetailResponse.java`
   - Action: Add `String narrative` to `GrievanceDetailResponse` record. Staff reviewers require the complaint text to determine whether an override or rejection is justified.
4. **Expose `version` in DTOs for Client Optimistic Locking (MEDIUM PRIORITY):**
   - Files: `GrievanceDetailResponse.java`, `GrievanceResponse.java`, `ReviewRequest.java`, `GrievanceService.java`
   - Action: Expose `Long version` in detail responses and accept `Long version` in `ReviewRequest`. Verify `grievance.getVersion().equals(request.version())` before saving.
5. **Expose Audit History in Detail View (MEDIUM PRIORITY):**
   - Files: `GrievanceDetailResponse.java`, `GrievanceService.java`
   - Action: Query `auditLogRepository.findByGrievanceIdOrderByCreatedAtAsc(id)` and append an `auditTrail` list to `GrievanceDetailResponse`.
6. **Provide Public Status Lookup (OPTIONAL/RECOMMENDED):**
   - File: `GrievanceController.java`
   - Action: Add public `GET /api/grievances/{id}/status` returning a sanitized `GrievanceResponse` without requiring `ROLE_REVIEWER`.
7. **Provide Current User Identity Endpoint (OPTIONAL/RECOMMENDED):**
   - File: `backend/src/main/java/ai/civicresolve/backend/controller/AuthController.java` (or in `GrievanceController`)
   - Action: Add `GET /api/auth/me` returning username and roles for session persistence.

---

## 11. Security & Privacy Considerations for the Frontend

1. **Complaint Narrative Privacy:**
   - Complaint narratives contain sensitive financial disputes, account details, and potential PII.
   - The frontend must never store narratives in browser `localStorage`, `sessionStorage`, or analytics payloads.
   - Narratives must never be echoed in query parameters or URL paths.
2. **Reviewer Credential Storage:**
   - Basic Auth credentials (`btoa("reviewer:password")`) should be kept in memory (React state / React Context) during the session.
   - If persistence across page reloads is required in development, store only an obfuscated token in `sessionStorage` (cleared on tab close), never in persistent `localStorage`.
3. **XSS & Content Sanitization:**
   - React's JSX automatically escapes strings, preventing HTML injection from narratives or reviewer notes.
   - Never use `dangerouslySetInnerHTML` when rendering complaints or explanations.
4. **Input Size Validation:**
   - Client-side validation must mirror backend Bean Validation (`description`: 20 to 5,000 characters; `reviewNote`: max 2,000 characters).

---

## 12. Recommended Frontend Architecture

The recommended modern frontend architecture for Phase 8:

```
frontend/
├── index.html
├── package.json                        (React 19, TypeScript 5, Vite 6, Tailwind CSS 4)
├── tsconfig.json
├── vite.config.ts                      (Proxy configuration to http://localhost:8080)
├── tailwind.config.js
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── api/                            (Type-safe API client and endpoint definitions)
    │   ├── client.ts                   (Fetch wrapper with Basic Auth, error interceptor)
    │   ├── grievances.ts               (Submit, list, detail, review)
    │   └── categories.ts               (Category lookup)
    ├── types/                          (TypeScript interfaces mirroring Spring DTOs)
    │   ├── grievance.ts
    │   ├── prediction.ts
    │   ├── review.ts
    │   └── problemDetail.ts
    ├── context/
    │   └── AuthContext.tsx             (Staff authentication state & session management)
    ├── components/
    │   ├── common/                     (Button, Card, Badge, Modal, Alert, Navbar)
    │   ├── citizen/                    (ComplaintForm, SubmissionReceipt, StatusTracker)
    │   ├── reviewer/                   (QueueTable, QueueFilters, MetricCards)
    │   └── detail/                     (CaseHeader, NarrativeCard, AiTelemetryCard, ReviewActionModal)
    └── pages/
        ├── HomePage.tsx                (Public portal & landing page)
        ├── SubmitPage.tsx              (Public complaint intake)
        ├── TrackPage.tsx               (Public case status lookup)
        ├── ReviewerQueuePage.tsx       (Staff triage queue)
        ├── ReviewerDetailPage.tsx      (Staff case evaluation & actions)
        └── LoginPage.tsx               (Staff authentication modal/page)
```

### Technology Stack:
- **Build Tool:** Vite + React + TypeScript
- **Styling:** Tailwind CSS (utility-first, responsive, accessible color contrast)
- **Icons:** `lucide-react` (clean, accessible SVG icons)
- **HTTP Client:** Native `fetch` with typed wrapper handling RFC 9457 `ProblemDetail` errors.
- **Routing:** `react-router-dom` v6 with protected routes for `/reviewer/*`.
- **State Management:** React Context for Auth; standard React state / hooks for UI workflows.

---

## 13. Implementation Risks

1. **CORS Rejection in Local Development (High):** Without Spring Security CORS configuration, local browser requests will fail immediately. *Mitigation:* Configure Vite development proxy (`/api` -> `http://localhost:8080`) in `vite.config.ts` as an immediate local workaround, while scheduling backend CORS configuration.
2. **Browser Native Auth Popup (High):** 401 responses with `WWW-Authenticate: Basic` will cause annoying browser popups. *Mitigation:* Ensure pre-flight checks or update Spring Security entry point.
3. **Reviewer Blindness (High):** If `narrative` remains omitted from `GrievanceDetailResponse`, staff cannot see what they are reviewing. *Mitigation:* Include narrative in detail DTO.
4. **Lost Updates in Concurrency (Medium):** Absence of client `version` checking allows silent overwrites if a reviewer acts on stale queue data. *Mitigation:* Implement client-side `version` verification or refresh on collision.

---

## 14. Proposed Phase 8.2 Plan

### Step 1: Backend Pre-Flight Micro-Adjustments (Optional/Recommended)
- Configure CORS in `SecurityConfig.java` for `http://localhost:5173`.
- Add custom `AuthenticationEntryPoint` in `SecurityConfig.java` to suppress `WWW-Authenticate` on 401.
- Add `narrative` to `GrievanceDetailResponse.java`.

### Step 2: Initialize Frontend Application
- Initialize Vite React + TypeScript project in `frontend/`.
- Configure Tailwind CSS, Lucide icons, and React Router.
- Set up Vite proxy in `vite.config.ts` to forward `/api` requests to backend on port 8080.

### Step 3: Implement Core Type Definitions & API Client
- Create TypeScript types matching `GrievanceRequest`, `GrievanceResponse`, `GrievanceDetailResponse`, `PredictionSummary`, and `ProblemDetail`.
- Build typed HTTP client with error parsing and Basic Auth header injection.

### Step 4: Build Public Citizen Experience
- Responsive landing page with system status and category listings.
- Public intake form with live character counting (20–5,000) and form validation.
- Submission receipt displaying case UUID, assigned category, and priority badge.

### Step 5: Build Staff Authentication & Reviewer Queue
- Staff login form with in-memory credential storage in `AuthContext`.
- Paginated triage queue table with priority badges, status filters, and category dropdowns.
- Summary metric cards derived from `GET /api/grievances/stats`.

### Step 6: Build Case Detail & Review Actions
- Detailed grievance inspection view.
- AI Telemetry panel: probability distribution bar chart, margin, sentiment badge, and model metadata.
- Review modal: `APPROVE`, `OVERRIDE` (with category/priority selection), and `REJECT` with mandatory review note validation.
- Safe handling of HTTP 409 conflict responses with user-friendly retry prompts.

---

## 15. Explicit Recommendation: CONDITIONAL GO

### Verdict: **CONDITIONAL GO**

1. **What Can Start Immediately:**
   - Vite + React + TypeScript + Tailwind CSS scaffolding in `frontend/`.
   - Public landing page, product category navigation, and complaint submission UI.
   - All client-side mock/proxy wiring using Vite's built-in dev server proxy (`server.proxy`).
2. **Condition Precedent for Full End-to-End Staff Review Wiring:**
   - Spring Security must be updated to enable CORS for `http://localhost:5173` and suppress the browser `WWW-Authenticate` popup.
   - `GrievanceDetailResponse` should be augmented with the complaint `narrative` so staff can perform informed reviews.

---

## 16. Audit Verification & Modification Log

- **Files Created:** Exactly 1 (`phase-8.1-frontend-api-readiness-report.md`).
- **Files Modified:** Exactly 0.
- **Dependencies Installed:** None.
- **Database Operations Executed:** None.
- **Audit Status:** Complete, verified read-only, awaiting user review.

