# CivicResolve AI — Security Architecture & Data Protection

CivicResolve AI processes consumer financial grievances and regulatory adjudication records. The system enforces strict defense-in-depth principles across authentication, credential storage, database permissions, rate limiting, and concurrency control.

---

## 1. Authentication & Session Management

### A. Reviewer Portal Authentication
- **Protocol**: HTTP Basic Authentication over TLS/HTTPS.
- **Credential Storage**: Passwords are protected using BCrypt key derivation with an enforced work factor of 12 (`BCryptPasswordEncoder(12)`).
- **In-Memory Credential Security**:
  - The React SPA client manages reviewer credentials strictly in memory (`AuthClient` class).
  - Credentials and authorization headers are **never** persisted to `localStorage`, `sessionStorage`, cookies, or browser caches.
  - Refreshing or closing the browser window completely wipes in-memory credentials, requiring re-authentication.
- **Identity Verification Endpoint**:
  - `GET /api/auth/me` validates the supplied credentials and returns the reviewer's username and granted roles (`ROLE_REVIEWER`).

### B. Endpoint Access Control Matrix
| Endpoint Pattern | Method | Permitted Roles | Authentication Mechanism |
| :--- | :--- | :--- | :--- |
| `/api/grievances` | `POST` | Anonymous | Open Public Intake |
| `/api/grievances/track` | `POST` | Anonymous | Token-Bucket IP Rate Limited |
| `/api/product-categories`| `GET` | Anonymous | Public Reference Data |
| `/api/health` | `GET` | Anonymous | Public Health Monitor |
| `/api/auth/me` | `GET` | `ROLE_REVIEWER` | HTTP Basic Auth |
| `/api/grievances/**` | `GET`, `PATCH`, `POST` | `ROLE_REVIEWER` | HTTP Basic Auth + Method Security |

---

## 2. One-Time Tracking Credentials & Cryptography

Consumers submitting complaints do not create traditional user accounts with passwords. Instead, CivicResolve AI provides a secure zero-knowledge tracking model:

1. **High-Entropy Secret Generation**:
   - On submission, the backend generates a 32-byte cryptographically secure random token using `java.security.SecureRandom`.
   - The token is formatted as a URL-safe Base64 string prefixed with `trk_` (e.g., `trk_w8f2...`).
2. **One-Way Salted SHA-256 Storage**:
   - The plaintext secret is returned to the user **once** in the HTTP 201 response payload.
   - The backend immediately hashes the secret using salted SHA-256 (`MessageDigest.getInstance("SHA-256")`).
   - Only the hex-encoded digest is persisted in `grievance_tracking_credentials.secret_hash`.
   - The plaintext secret is never written to application logs, audit trails, or database tables.
3. **Constant-Time Verification**:
   - During tracking lookup (`POST /api/grievances/track`), the incoming secret is hashed and compared against the stored hash using `MessageDigest.isEqual()` to prevent timing side-channel attacks.

---

## 3. Database Principle of Least Privilege

CivicResolve AI enforces strict privilege separation between schema administration (DDL) and operational data processing (DML). Two distinct database users are configured:

```
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│        civicresolve_migrator         │     │           civicresolve_app           │
│         (Schema Management)          │     │        (Application Runtime)         │
├──────────────────────────────────────┤     ├──────────────────────────────────────┤
│ • Owns schema "public"               │     │ • Granted USAGE on schema public     │
│ • Runs Flyway migrations at startup  │     │ • SELECT, INSERT, UPDATE on tables   │
│ • CREATE, ALTER, DROP tables/indexes │     │ • USAGE, SELECT on sequences         │
│ • CANNOT be used by application pool │     │ • CANNOT create/alter/drop tables    │
│                                      │     │ • CANNOT execute TRUNCATE            │
└──────────────────────────────────────┘     └──────────────────────────────────────┘
```

### Automated Privilege Enforcement (`DatabaseIsolationGuard.java`)
On backend startup, before Spring context initialization completes, `DatabaseIsolationGuard` executes a mandatory pre-flight check:
1. Verifies that the primary application DataSource connects using `civicresolve_app`.
2. Verifies that the Flyway DataSource connects using `civicresolve_migrator`.
3. Asserts that `civicresolve_app` does not possess superuser privileges or `CREATEROLE` capabilities.
4. If a misconfiguration is detected (e.g., running the application under `postgres` or `civicresolve_migrator`), startup immediately terminates with an `IllegalStateException`.

---

## 4. Fail-Closed Rate Limiting (`TrackingRateLimiter.java`)

To protect public tracking endpoints from credential brute-force attacks and enumeration scans, CivicResolve AI deploys an in-memory token-bucket rate limiter:

- **Per-IP Rate Limit**: Configured for 5 attempts per rolling 60-second window.
- **Per-Reference Lockout**: Bounded failure counter locks any grievance reference after 5 consecutive failed credential attempts for 15 minutes.
- **Fail-Closed Capacity Design**:
  - The limiter enforces an absolute capacity limit on active tracking buckets.
  - If memory capacity is saturated, the limiter defaults to **failing closed** (rejecting untracked requests with `429 Too Many Requests`) rather than failing open.
- **Thread Safety**: Uses concurrent data structures (`ConcurrentHashMap`, atomic reference reservations) ensuring atomic state transitions without global locks across database or cryptographic calls.

---

## 5. Concurrency Control & State Integrity

### Optimistic Locking via JPA `@Version`
- The `Grievance` entity includes an integer `@Version` column.
- Whenever a compliance reviewer submits an adjudication decision (`APPROVE`, `OVERRIDE`, `REJECT`), the request must provide the `expectedVersion` read during initial page load.
- If another reviewer updated the grievance in the interim, Hibernate detects the version mismatch and aborts the transaction with an `OptimisticLockException`.
- The exception is mapped by `GlobalExceptionHandler` to a standardized **RFC 9457 `409 Conflict`** response.
- The React client catches the 409 conflict, notifies the reviewer, and automatically refreshes the case record to prevent stale data overwrites.

---

## 6. PII Sanitization & Scrubbed Public Timeline

### A. Public Tracking Scrubbing
- Responses from `POST /api/grievances/track` return a strictly sanitized `GrievanceTrackingResponse`.
- The following internal attributes are **never** exposed to the citizen:
  - Internal reviewer notes and audit reasons.
  - Reviewer identities and usernames.
  - Raw ML confidence scores, probability distributions, or feature attribution weights.
  - Target internal priority levels.

### B. Precedent Masking
- The semantic precedent retrieval endpoint (`GET /api/grievances/{id}/precedents`) retrieves historical cases for reviewer consistency benchmarking.
- Before returning historical snippets, regular expression sanitization masks sensitive identifiers:
  - Social Security Numbers (`\d{3}-\d{2}-\d{4}` -> `XXX-XX-XXXX`)
  - 16-digit credit card numbers (`\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b` -> `XXXX-XXXX-XXXX-XXXX`)
  - Phone numbers and email addresses -> `[REDACTED]`

---

## 7. RFC 9457 Problem Details Standard

All error responses across both public and reviewer APIs follow the **IETF RFC 9457** Problem Details standard with Content-Type `application/problem+json`:

```json
{
  "type": "https://civicresolve.ai/errors/optimistic-lock-conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "Grievance has been modified by another reviewer. Please refresh and review latest updates.",
  "instance": "/api/grievances/e5f80f1a-e269-4f4b-851d-66da2d88e5ec/review",
  "code": "CONCURRENT_MODIFICATION",
  "timestamp": "2026-11-10T16:00:22.348Z"
}
```
No internal stack traces, database schema details, or server IP paths are ever leaked in client responses.
