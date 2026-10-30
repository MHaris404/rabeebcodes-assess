# Operations

## Vercel deployment

Deploy from the repository root using `vercel.json`. It builds `client/dist`, serves SPA routes, and forwards `/api/*` to the shared Express application exported by `api/index.js`. Local development still uses the standalone Node listener. Vercel owns the function process lifecycle, so standalone SIGTERM/drain behavior is not claimed for that deployment mode.

Use a managed PostgreSQL database (the selected marketplace option is Neon Free) with a bounded connection pool. Provisioning may require the account owner to accept the provider's terms. Set production `DATABASE_URL`, a fresh `JWT_SECRET`, exact `CLIENT_ORIGIN` for the production alias, `NODE_ENV=production`, and `COOKIE_SAME_SITE=lax`. The frontend uses same-origin `/api`, keeping cookies first-party. Keep preview deployments restricted until their own allowed origin/database environment is configured.

After provisioning, run production migrations once, seed mock reviewer accounts with a demo-only password, deploy, and verify readiness, SPA reloads, login/logout, authorization, and the three-role workflow against the actual HTTPS origin. `.vercelignore` excludes local secrets, documents, screenshots, and execution artifacts from the upload.

## Hosting topology

Deploy the Vite static output to a CDN/static host and Express to a persistent Node.js service with managed PostgreSQL. `client/vercel.json` supplies SPA fallback if Vercel is selected. `render.yaml` is a provisioning template for a Render API/database; review provider costs and plan availability before applying. No paid resources have been provisioned by this implementation.

Prefer `app.example.com` and `api.example.com` under the same site, or proxy `/api` through the frontend domain. With unrelated provider domains, `COOKIE_SAME_SITE=none` requires HTTPS and third-party-cookie support; test login/reload/logout in the target browsers before delivery. A same-site proxy avoids that dependency.

API build: `npm ci` from root (postinstall generates Prisma Client). Release migration: `npm run db:migrate`. Start: `npm run start -w server`. Static build: `npm run build`; publish `client/dist`. Configure `VITE_API_URL` at frontend build time and exact `CLIENT_ORIGIN` at API runtime. Production requires a random `JWT_SECRET` of at least 32 characters, HTTPS, and `NODE_ENV=production`. Never put database URLs or signing secrets into frontend variables.

## Database and release safety

Set a bounded pool in `DATABASE_URL`: `connection_limit=10&pool_timeout=3`. Budget all replicas and maintenance connections against the database's connection limit. The application sets a 5-second statement timeout and 3-second lock timeout inside transactions, with a 3-second acquisition deadline and 7-second transaction deadline. HTTP incoming-request/header deadlines are 15/10 seconds; they are not a general response-execution timeout. Database work is bounded by its own deadlines.

Run migrations once per release, not per replica startup. Use additive schema changes and preserve compatibility with the previous artifact. Roll back the API to that artifact if application health regresses; avoid blindly rolling back a destructive schema change. Rehearse restore rather than treating backups as proof of recovery.

## Readiness and shutdown

Probe `/api/health/ready` for routing and `/api/health/live` for process health. The ready check includes a bounded database operation. A lost database returns 503 without taking down process liveness. SIGTERM/SIGINT marks draining, stops accepting connections, closes idle connections, and allows active requests up to ten seconds before forced closure; the database pool closes afterward. The host's termination grace must exceed ten seconds.

## Logs and metrics

Structured request logs include request ID, method, route template, status, duration, and actor ID. Raw URLs, bodies, cookies, authorization headers, passwords, and conversation content are not logged. Unexpected error logs contain only safe error type/code and request ID. Return the request ID to correlate failures.

Admin-only `/api/operations/metrics` exposes instance counters: requests, response classes, cumulative latency buckets, and database-failure count. These reset when the process restarts. Aggregate/retain them in the selected hosting monitoring system; do not interpret one instance's counters as fleet-wide metrics. Database pool utilization is not currently exported; inspect managed PostgreSQL metrics when selecting a host.

The local Express login limiter is per-process. Configure a gateway/shared rate limiter across replicas and explicit trusted-proxy handling before claiming production-wide abuse protection. Do not set blanket `trust proxy=true` without a known proxy boundary.

## Backup and restore

For synthetic staging data, with a supplied database connection string, use PostgreSQL `pg_dump --format=custom --file=backup.dump` and restore into a **new empty staging database** using `pg_restore --no-owner --dbname=<new-staging-url> backup.dump`. Pass operational credentials through the provider's secure environment/secret mechanism; do not commit backups or URLs.

After restore, validate migrations, ticket/message/activity counts, foreign keys, all demo roles, and the end-to-end workflow. Never restore over a live database without a separate recovery plan. Provider automated backup retention and recovery objectives must be selected and verified at deployment; neither is promised by the local app.

## Maintenance

Run a scheduled database maintenance job, not an authoritative in-process timer:

```sql
DELETE FROM "IdempotencyRecord" WHERE "expiresAt" < now();
DELETE FROM "Session" WHERE "expiresAt" < now();
```

Expired sessions are rejected even before cleanup. Expired idempotency keys can be reused after the documented retention window. For high volume, delete in batches to bound maintenance locks and vacuum pressure.
