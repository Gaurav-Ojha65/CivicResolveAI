# Free-tier deployment preparation

This guide prepares **Vercel Hobby + Render Free + Neon Free** for a fictional-data demonstration. Nothing in this branch deploys a service. **Do not put real financial complaints into this prototype.** The complete four-service cloud journey is currently **blocked**: the required Python NLP process exceeded Render Free's 512 MiB memory limit, and a Render Free web service would expose its unauthenticated inference endpoints. The safe working demonstration is the local stack shared through one email-gated Cloudflare Quick Tunnel; the NLP port stays on loopback.

The repository has a Render API Blueprint, a Java 25 Dockerfile, a Vercel single-page-app rewrite, and a repeatable Python 3.12 memory probe. The Render Blueprint is **API-only** and requires a private, authenticated `NLP_SERVICE_URL` before anyone applies it. Do not point it at a public Quick Tunnel or an unauthenticated Render NLP URL.

## 1. Free-tier limits checked on 24 November 2026

| Provider | Relevant published limit | Meaning here |
| --- | --- | --- |
| [Render Free](https://render.com/docs/free) | 512 MiB RAM per free web service; 750 running instance hours per workspace per month; idle services spin down after 15 minutes | The full NLP workflow must fit **one** 512 MiB instance. Cold starts and monthly suspension are normal. Free private services are unavailable. |
| [Neon Free](https://neon.com/pricing) | No credit card required; 1 GB storage and 100 CU-hours per project per month | Use one disposable database and fictional records. |
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Free personal-project tier with usage limits | Host the static React build; do not put secrets in `VITE_*` variables. |
| [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) | Temporary hostname, no account or domain, no uptime guarantee | Use only for an attended local demo; gate access by email. |

Render's [free deployment instructions](https://render.com/docs/your-first-deploy) say no payment is required. If an account-specific verification screen nevertheless demands a card, stop: it does not satisfy this guide's no-card condition. Do not choose paid plans or attach a payment method to bypass a free-tier limit.

### Measured NLP memory

On Windows with the existing Python 3.14 virtual environment, one Uvicorn worker, the saved model artifacts, and one compute thread, the **actual port-owning Python process** used 650.3 MiB resident memory at startup, 650.6 MiB after baseline classification, and 1,027.8 MiB after reviewer BiLSTM comparison (peak 1,027.8 MiB). The baseline returned `Mortgage` for a fictional narrative and the comparison returned successfully. These are Windows measurements, not a Render or Python 3.12 deployment. The [deployment memory workflow](../.github/workflows/deployment-memory.yml) repeats the same paths on Linux/Python 3.12 and prints the process RSS and peak RSS. The BiLSTM checkpoint and baseline artifact are preserved; neither is retrained or removed.

## 2. Prepare a Neon database without deploying

1. Create a **Free** Neon project and select a region close to the intended Render API region. The default database name may be `neondb`; use the name shown in your Neon **Connect** dialog throughout this guide. Do not import genuine complaint data.
2. Open Neon SQL Editor connected as the project's initial owner role. **Create the two restricted roles with SQL**, not the Console's *Add role* button: Neon [documents](https://neon.com/docs/manage/roles) that Console-created roles inherit `neon_superuser`, whereas SQL-created roles start without it.
3. Generate two different strong passwords in a password manager. Substitute them locally in the following SQL and run it once. Do not commit the filled-in SQL or share a screenshot of it. Replace `neondb` if your database has another name.

```sql
CREATE ROLE civicresolve_migrator LOGIN PASSWORD '<unique-migrator-password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE civicresolve_app LOGIN PASSWORD '<different-unique-app-password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE neondb TO civicresolve_migrator, civicresolve_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO civicresolve_migrator;
GRANT USAGE ON SCHEMA public TO civicresolve_app;
```

4. In **Connect**, select `civicresolve_app` and copy the **pooled** host for the runtime datasource. Select `civicresolve_migrator` and copy the **direct** host for Flyway. [Neon recommends direct connections for schema migrations](https://neon.com/docs/connect/connection-pooling). The two JDBC URLs have the same database but different hosts and users:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://<pooled-host>/<database>?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory
SPRING_DATASOURCE_USERNAME=civicresolve_app
SPRING_DATASOURCE_PASSWORD=<app-role-password>
SPRING_FLYWAY_URL=jdbc:postgresql://<direct-host>/<database>?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory
SPRING_FLYWAY_USER=civicresolve_migrator
SPRING_FLYWAY_PASSWORD=<migrator-role-password>
```

The JDBC options request hostname and certificate verification using the Java trust store, as described by [pgJDBC](https://jdbc.postgresql.org/documentation/ssl/). Confirm them against your actual Neon hosts before using the service; do not weaken them to `sslmode=require` to hide a certificate error. The passwords belong in **Render environment settings only**, never Vercel, Git, screenshots, or URL query parameters. `V1`–`V6` Flyway migrations run as `civicresolve_migrator`; `V3` grants the application role only the table and sequence privileges it needs. After a first migration, connect separately as each role and verify `SELECT current_user`, `SELECT count(*) FROM product_categories`, and the expected permissions using `has_schema_privilege('civicresolve_app', 'public', 'CREATE')` (false). This Neon-specific role setup has **not** yet been executed against a live Neon project.

## 3. Prepare the Spring Boot API on Render Free

The [Blueprint](../render.yaml) defines only `civicresolve-api`, `plan: free`, Java 25 via [backend/Dockerfile](../backend/Dockerfile), a `/api/health` health check, and `autoDeployTrigger: off`. [Render documents](https://render.com/docs/blueprint-spec) those Blueprint fields and [requires](https://render.com/docs/web-services) the app to listen on `0.0.0.0` and its `PORT`; Spring's embedded server binds all interfaces by default and now reads `PORT`. No credentials are in the file.

**Do not apply the Blueprint yet.** The API needs a private, authenticated NLP endpoint for complaint submission and reviewer model comparison. Render Free supports public web services but not free private services, and the current NLP API has no service-to-service authentication. A public NLP URL would violate the application's security boundary. The API alone can pass `/api/health` while the primary submission journey still fails.

When an appropriately isolated NLP service is available in a later deployment design:

1. In Render, connect the GitHub repository and select the reviewed deployment branch or its merged successor. Create a **Free** web service from the Blueprint; check that the plan still says **Free** and automatic deploys are off before applying it. Render may deploy once when you explicitly create the service.
2. Fill the Blueprint's `sync: false` prompts with the Neon URLs and corresponding role passwords above, a unique `REVIEWER_PASSWORD`, the private authenticated `NLP_SERVICE_URL`, and the **exact** Vercel production origin for `CORS_ALLOWED_ORIGINS` (for example `https://<your-project>.vercel.app`, without a path or trailing slash). Never enter a wildcard origin.
3. Keep `DB_POOL_MAX_SIZE=4` and `DB_POOL_MIN_IDLE=1` for the small demo. Leave demo seeding disabled; `CIVICRESOLVE_DEMO_SEEDING_ENABLED` defaults to false.
4. After the manual deploy, check `/api/health`, Flyway startup, role access, submission, reviewer login, tracking, and analytics with **fictional** data. A health response alone is insufficient. The Java container and live Neon connection have **not** been tested on Render.

The runtime application role must not receive schema ownership or Flyway credentials. The existing reviewer password is held only in the backend environment; the frontend uses HTTP Basic credentials in memory for its current prototype session.

## 4. Prepare React on Vercel Hobby

The [Vercel configuration](../frontend/vercel.json) rewrites deep React Router paths to `index.html`; it does not proxy `/api`. When the backend is actually usable:

1. Import `Gaurav-Ojha65/CivicResolveAI` in Vercel on the **Hobby** plan. Choose the reviewed deployment branch or its merged successor. Set **Root Directory** to `frontend` and Framework Preset to **Vite**.
2. Use install command `npm ci`, build command `npm run build`, and output directory `dist`. The existing CI uses Node.js 22.
3. Set only `VITE_API_BASE_URL=https://<your-render-api>.onrender.com` for the appropriate Vercel environment. This is a **public origin**, not a secret. Never set database passwords, reviewer passwords, or tracking secrets in a `VITE_*` value; Vite embeds it in browser JavaScript.
4. Deploy manually after the API is functional. Confirm that refreshing `/reviewer/login` and `/track` works, that browser requests use the Render API origin, and that the API's exact `CORS_ALLOWED_ORIGINS` includes the Vercel origin. Every distinct preview hostname needs an explicit CORS entry or should not be used for reviewer testing.

The frontend can build and display without the API, but submission, tracking, and reviewer screens require the complete backend and NLP path. No Vercel project was created by this branch.

## 5. Working no-card alternative: one local Quick Tunnel

This path preserves **all** classifier and BiLSTM features while keeping FastAPI and PostgreSQL on the local machine. It is an attended, temporary demonstration. The tunnel exposes only the Vite preview server; Vite forwards `/api` to local Spring Boot, which calls local FastAPI. Require Cloudflare email authentication because the public intake and prototype reviewer login are otherwise reachable by anyone with the URL. Cloudflare's [Quick Tunnel guide](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) documents `--allowed-mail` and the changing hostname.

1. Follow the existing [local quick start](../README.md#quick-start) to create a disposable local PostgreSQL database with the two roles. Use fictional complaints. Start FastAPI on `127.0.0.1:8000` and Spring Boot on port 8080 with `NLP_SERVICE_URL=http://127.0.0.1:8000` and a strong local reviewer password. Confirm `http://127.0.0.1:8000/health` and `http://127.0.0.1:8080/api/health` locally. Do **not** bind FastAPI or PostgreSQL to a public interface.
2. Install `cloudflared` from [Cloudflare's official installation instructions](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) if it is not already present. No account or domain is needed for a Quick Tunnel. In a frontend PowerShell terminal, run:

```powershell
cd frontend
npm ci
$env:VITE_API_BASE_URL = ''
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8080'
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

3. In another terminal, start the **email-gated** tunnel, replacing the placeholder with the single intended viewer's email address:

```powershell
cloudflared tunnel --url http://127.0.0.1:4173 --allowed-mail '<viewer-email>'
```

4. Note the generated `https://<random>.trycloudflare.com` hostname. Keep `cloudflared` running. Stop and restart the Vite preview after setting the **exact hostname** (without `https://`) as an allowed host. Vite [supports this environment variable](https://vite.dev/config/server-options); do not set `allowedHosts: true`.

```powershell
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = '<random>.trycloudflare.com'
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

5. In the Spring Boot terminal, set `CORS_ALLOWED_ORIGINS` to the **exact tunnel origin** and restart Spring Boot. Include any local origin you still use, separated by commas. This allows proxied browser `Origin` headers without opening CORS to all websites.

```powershell
$env:CORS_ALLOWED_ORIGINS = 'https://<random>.trycloudflare.com,http://localhost:4173'
.\backend\mvnw.cmd spring-boot:run
```

If that backend terminal is inside `backend`, run `.\mvnw.cmd spring-boot:run` instead. Open the temporary HTTPS URL, complete the viewer's email challenge, then test a fictional submission, receipt, tracking, reviewer decision, analytics, and model audit. Stop `cloudflared` when the demonstration ends; its URL then stops working. No Quick Tunnel was created during this preparation.

## 6. What to verify before claiming a cloud deployment

- Linux/Python 3.12 memory probe reports startup, baseline, and BiLSTM peak RSS below 512 MiB **with headroom**. If it exceeds 512 MiB, leave NLP off Render Free; never disable BiLSTM silently.
- The API can reach NLP over a **private authenticated** channel. CORS alone is not NLP authentication.
- Java 25 API starts on a 512 MiB Render instance, connects to Neon with the two distinct roles, and passes a fictional end-to-end journey after a cold start. This is not yet measured or deployed.
- Vercel deep links, exact CORS origin, in-memory reviewer login, and tracking secret flow work in the hosted environment.
- No provider demanded a card or selected a paid tier. Monitor the published free allowances and stop if a limit or verification step conflicts with no-card operation.

Until these checks pass, the correct status is **prepared configuration, local demo available, full cloud deployment blocked**.
