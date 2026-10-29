# SupportDesk

A customer support workspace built for the Rabeeb Codes full-stack assessment. Customers open conversations, Admins assign work, and Agents reply and resolve tickets. Access is enforced by the API on every ticket and message operation.

## Run locally

Requires Node.js 24+, npm, and PostgreSQL 15+.

```bash
npm ci
cp server/.env.example server/.env
```

Set these values in `server/.env` (the example file deliberately contains variable names only):

```dotenv
DATABASE_URL=postgresql://supportdesk@127.0.0.1:55432/supportdesk?schema=public&connection_limit=10&pool_timeout=3
TEST_DATABASE_URL=postgresql://supportdesk@127.0.0.1:55432/supportdesk_test?schema=public&connection_limit=10&pool_timeout=3
JWT_SECRET=replace-with-at-least-32-random-characters
CLIENT_ORIGIN=http://localhost:5173
PORT=4000
NODE_ENV=development
COOKIE_SAME_SITE=lax
SEED_PASSWORD=SupportDesk2026!
LOG_LEVEL=info
```

Generate a real signing secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. The password above is for disposable demo data only. Never reuse it for an operational account.

On macOS with Homebrew PostgreSQL 15 installed, `npm run db:local` initializes and starts a loopback-only database under ignored `.local/postgres`. Set `PG_BIN` to the PostgreSQL binary directory on other installations, or use your own PostgreSQL server and adjust the URLs. The local helper creates separate development, test, and benchmark databases with local trust authentication; do not expose that server to a network.

```bash
npm run db:local
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:5173**. The Vite proxy forwards `/api` to port 4000. Use the `localhost` origin consistently because mutations check `CLIENT_ORIGIN`. An isolated build of the frontend can set `VITE_API_URL` to the backend URL including `/api`; the default is same-origin `/api`.

## Demo access

All accounts use the configured `SEED_PASSWORD`; the local sample value is `SupportDesk2026!`.

| Role | Email | Name |
| --- | --- | --- |
| Admin | admin@supportdesk.demo | Alex Morgan |
| Agent | agent@supportdesk.demo | Jordan Lee |
| Customer | customer@supportdesk.demo | Taylor Brooks |

Additional mock Agents and Customers are seeded for workload and ownership examples. The seed is repeatable, updates passwords for existing demo users, and creates example tickets only when the ticket table is empty. It does not erase existing data. Public registration always creates a Customer. There is no public staff-provisioning endpoint.

## Implemented workflows

- Login, customer registration, session restoration, and logout with immediate server-side session revocation.
- Customer-owned and Agent-assigned ticket isolation; Admin-wide access.
- Ticket create, permitted edit/delete, searchable ticket IDs/subjects, priority/status/assignee filters, and pagination.
- Admin assignment/reassignment; Admin/assigned-Agent status updates.
- Chronological conversations and activity with bounded cursor pagination.
- Persisted role-scoped dashboard counts, interactive status chart, recent/high-priority tickets, and Admin workload.
- Admin user search, role changes, assignment counts, last-Admin protection, and Agent demotion safeguards.
- Responsive navigation, accessible labels, keyboard-operable dialogs, confirmations, feedback, error/empty/loading states.

## Architecture and reliability

The API is a modular monolith: HTTP validation → application services/policies → Prisma repositories → PostgreSQL. React uses Context for identity and TanStack Query for server data. A lazy-loaded dashboard keeps Recharts out of the initial sign-in bundle.

PostgreSQL was selected for explicit ownership relationships, database constraints, transactional activity, and concurrency control. Ticket versions reject stale edits. Idempotency keys prevent duplicate creates/replies after retry. Row/advisory locks protect assignment/role invariants across processes. Session state and deduplication live in PostgreSQL, allowing correctness without sticky sessions. Read the exact guarantees and tradeoffs in [architecture](docs/architecture.md) and [decisions](docs/decisions.md).

## Verification

Create/migrate the separate test database before running the suite:

```bash
cd server
DATABASE_URL=postgresql://supportdesk@127.0.0.1:55432/supportdesk_test npx prisma migrate deploy
cd ..
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

API tests refuse a test connection string without the `supportdesk_test` database name. They truncate only the isolated test tables. Browser tests use local mock demo accounts and create additional tickets in the development database. Start the app first. `DEMO_PASSWORD` overrides the default browser-test password.

The load benchmark uses a dedicated loopback-only `supportdesk_bench` database, replaces **only that benchmark database's contents**, seeds 10,000 tickets/50,000 messages, and runs 50 concurrent sessions for five minutes:

```bash
node scripts/load/benchmark.js
```

`BENCH_SECONDS=10` provides a short smoke run. Actual benchmark results and query plans are recorded under `docs/evidence/`; [performance notes](docs/performance.md) distinguish measured behavior from future scaling proposals.

## Permission assumptions

The assessment leaves general edit/delete rights and staff-created ticket ownership underspecified. This implementation adopts the plan's explicit proposals:

- Admin edits/deletes all tickets; a Customer edits/deletes their own ticket while Open. Agents reply and change status on assigned tickets, but cannot edit/delete general ticket details.
- Staff-created tickets belong to their creator unless an Admin chooses an existing Customer through the API. Agent-created tickets are automatically self-assigned so the Agent can access them; Agents cannot select or change assignments.
- Authorized staff may choose any defined status. Replies remain possible on Closed tickets. “Active agent” means a current Agent account, not online presence.
- An Agent with any assigned tickets cannot be demoted until those tickets are unassigned/reassigned. At least one Admin must remain.
- Deletion permanently removes messages and activity with the ticket. Operational logs contain the request and actor ID, without conversation content; permanent business audit retention is outside scope.

## Delivery and operations

- Repository destination: https://github.com/MHaris404/rabeebcodes-assess (private).
- Local web preview: http://localhost:5173
- Local API readiness: http://localhost:4000/api/health/ready
- Hosted URLs: pending selection/provisioning of Express-compatible hosting and PostgreSQL.
- API contract: [endpoint documentation](docs/api.md).
- Deployment, migrations, drain, recovery, and security limits: [operations](docs/operations.md).
- Desktop and mobile screenshots: [screenshots](docs/screenshots/).
- Implementation decisions, testing challenges, and remaining work: [implementation notes](docs/implementation-notes.md).

No attachment uploads, email delivery, online presence, password recovery, distributed cache, queue, or microservices are included. These are outside the required workflow; future infrastructure is described with explicit adoption triggers.

## AI assistance

This implementation was developed with OpenAI Codex assistance for planning, code, tests, and documentation. The submission owner should review and understand the code, run the demonstration, and be prepared to explain or modify it in the interview.
