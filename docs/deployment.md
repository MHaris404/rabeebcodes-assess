# Vercel Deployment Evidence

Deployed on October 30, 2026 (Asia/Karachi).

- App: https://rabeebcodes-assess.vercel.app
- API base: https://rabeebcodes-assess.vercel.app/api
- Readiness: https://rabeebcodes-assess.vercel.app/api/health/ready
- Vercel project: `mharis404s-projects/rabeebcodes-assess`
- Initial verified production deployment: `dpl_488NouFVuooTcxPS9Rjq82d2mqaD`
- Database: Neon Free, `supportdesk-db`, region `iad1`.

The root Vercel configuration builds the React client and forwards `/api/*` to the existing Express API through `api/index.js`. Node.js is pinned to 24.x. The function reuses its warm-instance Prisma client; the standalone listener and its shutdown hooks are used only for persistent Node hosting. HTTPS, HttpOnly cookies, exact production Origin checks, and session-bound CSRF operate on the same domain.

Production uses its own managed database and a fresh signing secret. Migrations and mock demo seed were run before the deployment. Credentials and pulled environment files remain ignored; source documents/local artifacts are excluded from deployment uploads. The account owner completed provider terms acceptance before the free database was provisioned.

## Hosted verification

- `/login` and direct `/tickets` loads return the SPA successfully.
- `/api/health/live` and `/api/health/ready` return 200 JSON.
- Unauthenticated `/api/tickets` returns 401 JSON rather than exposing records.
- Newman against the public origin completed 23 requests and 37 assertions with zero failures, covering login, CSRF, user lookup, ticket CRUD, assignment/status, idempotent replies, activity, dashboard/metrics, cleanup, and logout revocation.
- Playwright ran the customer → ticket creation → Admin assignment → Agent reply → resolution workflow and loaded-layout checks on desktop and mobile against the public HTTPS origin. Production screenshots are in `docs/screenshots/`.

The hosted smoke run is separate from the local 50-user load benchmark. It does not establish a production capacity SLA, shared rate-limit enforcement, multi-instance pool budget, backup/restore guarantee, or controlled forced-shutdown behavior.

## Subsequent releases

Run migrations once for schema changes, verify the build and relevant tests, then deploy from the repository root with `vercel deploy --prod`. The first deployment used the authenticated CLI. Vercel's attempt to connect the private GitHub repository lacked GitHub-app access; automatic Git-triggered deployments require the account owner to grant that repository access in Vercel. Manual CLI releases are verified and functional.

Only production has database/authentication environment settings. Configure isolated preview settings before using preview deployments; do not copy operational secrets into client variables or Git. Demo accounts use the documented demo password and contain mock data only.
