# CivicResolve AI — Frontend Foundation & Design System

A modern, high-trust consumer finance grievance triage and human-in-the-loop decision support frontend built with React, TypeScript, Tailwind CSS, and Vite.

---

## 1. Environment & Prerequisites

- **Node.js**: `v24.20.0` (LTS/Current, minimum `v20+` required)
- **npm**: `11.19.0` (or compatible)
- **Spring Boot Backend**: Running on `http://localhost:8080` (default dev proxy target)

---

## 2. Actual Installed Dependency Footprint

All versions verified from `package.json` and production build:

### Runtime Dependencies
- `react`: `^18.3.1` (18.3.1)
- `react-dom`: `^18.3.1` (18.3.1)
- `react-router-dom`: `^6.28.0` (6.28.0)
- `lucide-react`: `^0.460.0` (0.460.0)

### Development & Tooling Dependencies
- `vite`: `^6.0.1` (6.4.5)
- `typescript`: `~5.6.2` (5.6.3)
- `tailwindcss`: `^3.4.15` (3.4.17)
- `postcss`: `^8.4.49` (8.4.49)
- `autoprefixer`: `^10.4.20` (10.4.20)
- `vitest`: `^2.1.8` (2.1.9)
- `@testing-library/react`: `^16.0.1` (16.0.1)
- `@testing-library/jest-dom`: `^6.6.3` (6.6.3)
- `@testing-library/user-event`: `^14.5.2` (14.5.2)
- `jsdom`: `^25.0.1` (25.0.1)

---

## 3. Development Commands

Execute from inside the `frontend/` directory:

| Task | Command | Description |
|---|---|---|
| **Install** | `npm install` | Installs project dependencies |
| **Dev Server** | `npm run dev` | Starts Vite dev server on `http://localhost:3000` |
| **Typecheck** | `npm run typecheck` | Executes strict TypeScript check (`tsc --noEmit`) |
| **Test** | `npm test` | Runs Vitest automated test suite (`vitest run`) |
| **Test Watch** | `npm run test:watch` | Runs Vitest in interactive watch mode |
| **Build** | `npm run build` | Compiles strict bundle for production (`tsc -b && vite build`) |
| **Preview** | `npm run preview` | Serves production build preview locally |

---

## 4. Configuration & Development Proxy

### Environment Variables (`.env.example` / `.env.local`)
- `VITE_API_BASE_URL`: Base URL for API requests. In local development, leave empty `""` so requests route to `/api` and are handled by the Vite dev proxy.
- `VITE_API_PROXY_TARGET`: Target host for the Vite dev proxy. Defaults to `http://localhost:8080` (Spring Boot REST API).

### Vite Development Proxy
In `vite.config.ts`, requests starting with `/api` are automatically proxied to `http://localhost:8080`:
```ts
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
      changeOrigin: true,
      secure: false,
    },
  },
}
```

> [!NOTE]
> **Zero Direct FastAPI Calls**: The frontend communicates exclusively with the Spring Boot backend (`http://localhost:8080/api`). It never connects directly to the FastAPI NLP microservice (`http://localhost:8000`).

---

## 5. API Client & Error Handling Architecture

The API client layer lives in `src/lib/api/` and `src/lib/errors/`:

- **Centralized Wrapper (`api-client.ts`)**:
  - Handles JSON serialization and parsing.
  - Automatically injects in-memory Basic Auth headers for protected endpoints.
  - Injects `X-Requested-With: XMLHttpRequest` to suppress native browser basic auth popup dialogs.
  - Supports `AbortSignal` for request cancellation.
- **RFC 9457 ProblemDetail Support (`api-error.ts`)**:
  - Normalizes HTTP errors into an `ApiError` class.
  - Parses Spring Boot `ProblemDetail` responses (`type`, `title`, `status`, `detail`, `instance`, and `errors` array).
  - Flags specific states: `isValidationError` (400), `isUnauthorized` (401), `isForbidden` (403), `isConflict` (409), `isUpstreamNlpError` (502, 503, 504).
  - **Leakage Prevention**: Strips internal SQL, PostgreSQL, Hibernate, and Java exception keywords from user-facing error messages.
- **Typed Endpoint Contracts (`endpoints.ts`)**:
  - `getHealth()`: `GET /api/health`
  - `getProductCategories()`: `GET /api/product-categories`
  - `submitGrievance(data)`: `POST /api/grievances`
  - `listGrievances(params)`: `GET /api/grievances` (requires reviewer auth)
  - `getGrievanceById(id)`: `GET /api/grievances/{id}` (requires reviewer auth)
  - `reviewGrievance(id, review)`: `PATCH /api/grievances/{id}/review` (requires reviewer auth)
  - `getGrievanceStats()`: `GET /api/grievances/stats` (requires reviewer auth)

---

## 6. Authentication Handling

- **Mechanism**: In-memory HTTP Basic Authentication (`auth-client.ts`).
- **Storage**: Module-scoped closure in memory only.
- **Security Guardrails**:
  - `localStorage` and `sessionStorage` are **never** used for credentials or tokens.
  - Credentials and `Authorization` headers are never logged to console.
  - In-memory credentials reset immediately on browser refresh or explicit `logout()`.

---

## 7. Design System & Tokens

### Core Color Palette
- **Deep Ink** (`#142B3A`): Navigation, headings, primary containers.
- **Trust Teal** (`#0F766E`): Primary interactive actions, buttons, links.
- **Trust Teal Hover** (`#0B5F59`): Interactive hover state.
- **Canvas** (`#F4F7F9`): Application background.
- **Surface** (`#FFFFFF`): Cards, panels, modal surfaces.
- **Border** (`#DCE5EA`): Subtle element borders and dividers.
- **Muted Text** (`#496171`): Secondary labels and metadata.
- **Primary Text** (`#172B3A`): Body copy.
- **Focus** (`#2563EB`): Accessible high-contrast keyboard focus outline.

### Semantic Tokens
- **Success**: `#166534` on `#F0FDF4`
- **Warning**: `#92400E` on `#FFFBEB`
- **Danger**: `#B42318` on `#FEF2F2`
- **Information**: `#1D4ED8` on `#EFF6FF`

### Accessibility (WCAG 2.2 AA)
- Focus indicators (`:focus-visible`) use 2px solid `#2563EB` with 2px offset.
- Colors are never used alone for status; every `StatusIndicator` pairs an icon with explicit text.
- Reduced motion preferences are respected via CSS media query `@media (prefers-reduced-motion: reduce)`.
- Skip-to-content keyboard link provided in `AppLayout`.

---

## 8. Reusable UI Components

Implemented in `src/components/ui/`:
1. `Button`: Primary, secondary, outline, destructive, ghost, with loading spinner and disabled states.
2. `Input`: Accessible input with helper text, error messages (`aria-invalid`, `aria-describedby`), left/right icons.
3. `Label`: Semantic label with required indicator asterisk (`*`).
4. `Card`: Card container with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
5. `Badge`: High-contrast pill badges in default, success, warning, danger, info, and outline variants.
6. `StatusIndicator`: Maps workflow statuses (`PENDING_REVIEW`, `APPROVED`, etc.) and priorities (`CRITICAL`, `HIGH`, etc.) with icon + text.
7. `Alert`: Semantic alert banners (`role="alert"`) with optional dismiss action.
8. `Divider`: Horizontal or vertical divider with optional text label.
9. `LoadingIndicator`: Accessible spinner with screen-reader text (`role="status"`).
10. `EmptyState`: Empty state display with icon, title, description, and optional action.
11. `ErrorState`: Error banner with alert icon, user message, and retry button.

---

## 9. Current Phase Scope Boundaries & Limitations

In accordance with Phase 8.2 constraints:
- **No Marketing Landing Page**: The root page is a Foundation & Design System Console.
- **No Complaint Submission Form**: Endpoints and DTOs are wired, but full citizen form is scheduled for Phase 8.3.
- **No Reviewer Queue Dashboard**: Table and filters are scheduled for Phase 8.4.
- **No Grievance Detail Workspace**: Detailed triage screen is scheduled for Phase 8.4.
- **No Backend Modifications**: Spring Boot and FastAPI codebases were not altered.

