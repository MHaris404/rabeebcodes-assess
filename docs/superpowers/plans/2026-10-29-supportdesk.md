# SupportDesk Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Steps use checkboxes for tracking. Implementation is a separate step after this plan is reviewed.

**Goal:** Deliver a responsive support platform with a working customer → ticket → Admin assignment → Agent reply → resolution workflow and all assessment submission evidence.

**Architecture:** Use a React single-page application and a modular Express monolith backed by PostgreSQL. Split authentication, tickets, users, and reporting into modules with explicit service interfaces; deploy the API as a horizontally replicable process with no authoritative local state. PostgreSQL owns consistency, session revocation, and mutation deduplication; each mutation enforces authorization and writes its activity in one transaction.

**Tech Stack:** Proposed choices: JavaScript, React with Vite, Tailwind CSS, React Router, Context API for authentication, TanStack Query for server state, Fetch, Recharts, Node.js, Express, PostgreSQL, Prisma, bcrypt, JWT, and structured JSON logging. Use Vitest/Supertest for targeted API tests and Playwright for the primary browser workflow. Resolve compatible stable versions during setup and commit the lockfile.

**Spec:** `SupportDesk_Full_Stack_Technical_Assessment.docx` in the workspace root. The assessment is the requirements source; its submission instructions do not authorize deployment, account creation, or submission during this planning task.

## Global Constraints

- Deadline: “48 hours from receipt”; the document clarifies this means elapsed hours, not working hours. Receipt time is blank and must be recorded before scheduling an actual deadline.
- Required frontend: “React.js”, “JavaScript ES6+”, “Tailwind CSS”, and “React Router”. TypeScript is optional; this plan chooses JavaScript.
- Required backend: “Node.js + Express.js”; database must be “MongoDB or PostgreSQL”; this plan chooses PostgreSQL.
- Authentication: “JWT and secure password hashing (bcrypt or equivalent)”.
- Categories: “Technical / Billing / General / Other”.
- Priorities: “Low / Medium / High / Urgent”.
- Statuses: “Open / In Progress / Resolved / Closed”.
- Public registration creates Customer accounts only. Backend checks every permission, including access to individual tickets and messages.
- Statistics must come from persisted records. Paginate at least one list endpoint; this plan paginates tickets and users.
- Required submission: deployed frontend and API, GitHub repository, README, environment template, database setup, API documentation, three demo roles, desktop/mobile screenshots, and implementation notes.
- “.env.example with variable names only”; no private credentials, production secrets, real customer information, or populated `.env` files in Git.
- Optional extras must not displace mandatory functionality. Disclose AI assistance and understand the submitted implementation.

## Proposed Decisions and Unresolved Details

These are implementation proposals, not additional requirements found in the assessment.

- **Database:** PostgreSQL suits explicit ownership, assignment, message relationships, and dashboard grouping. Prisma provides migrations and seed support.
- **Ticket ownership:** Every role can create tickets. Default `customerId` to the creator, including staff; only an Admin may explicitly choose another existing Customer as owner. The field represents the ticket owner even when that owner is staff. Ownership alone never grants an Agent access: the Agent must still be assigned, as the role matrix requires.
- **Agent-created tickets:** Self-assign tickets created by an Agent as a server-controlled creation rule, so their new tickets remain accessible. Agents cannot choose another assignee or later assign/reassign. Admin and Customer tickets start unassigned. Record the automatic assignment as activity. This resolves an ambiguity in the spec and should be reviewed before coding.
- **Edit/delete policy:** Admin may edit/delete any ticket. Customer may edit subject, description, category, and priority or delete their own ticket while Open. Agents may change status and reply on assigned tickets; general editing and deletion are denied. Restrict assignment, ownership, and status to their dedicated server rules; never mass-assign request fields.
- **Status transitions:** Admin and assigned Agent may select any of the four defined statuses; the assessment specifies no transition graph. Customers cannot change status. Replies remain available on accessible tickets, including Closed tickets, because no restriction is specified.
- **Dashboard visibility:** Admin sees global totals, active agents, workload, and team analytics. Customer sees only owned-ticket statistics and activity; Agent sees only assigned-ticket statistics and activity. Hide team widgets for these two roles. “Active agent” means an existing user whose current role is Agent; online presence is out of scope.
- **Role management:** Include Admin role editing because the capability matrix explicitly requires it, even though the minimum endpoint list omits a role endpoint. Reject demotion of the last Admin and role changes for Agents with assigned tickets until an Admin reassigns or unassigns those tickets.
- **JWT handling:** Use a 30-minute JWT in an HttpOnly cookie containing `sub` and a random session ID. Persist a matching Session record; authentication checks revocation/expiry and reloads the current user role. Logout revokes the Session and clears the cookie, so a copied JWT cannot remain usable after logout. A database failure fails authentication closed with 503, not a misleading 401. Use exact-origin credentialed CORS, Origin checks on mutations, and session-bound CSRF tokens. Prefer frontend/API subdomains under one site; if provider domains are cross-site, test `SameSite=None; Secure` and browser cookie restrictions early.
- **Scope:** No attachments, email notifications, live chat, password reset, dark mode, Docker, or advanced analytics until the required workflow and deployment pass.

## Review Focus

1. Guessed ticket IDs: an unrelated Customer or unassigned Agent gets no ticket details, messages, or activity. Test in Task 2.
2. Privileged request fields: registration and ticket patches cannot set role, owner, assignee, or status outside explicit rules. Test in Tasks 1–2.
3. Empty data and role scoping: dashboards return valid zero totals and do not reveal another user's activity or team counts. Test in Task 3.
4. Role changes and missing relationships: role updates cannot strand assigned tickets or remove the final Admin. Test in Task 3.
5. Production authentication: login, reload, mutation, logout, and expired sessions work on the actual deployed origins. Verify in Tasks 4–6.

## Senior Engineering Architecture and Evidence

The objective is a system whose correctness and failure behavior can be demonstrated. These are proposed engineering requirements added for this submission, rather than claims made by the assessment. Keep the core in one deployable API: independent services would add network failures, deployment coordination, and distributed consistency work without an established need here.

### Module boundaries and request flow

```text
React feature → API client → Express route/validation → application service
                                                       ↓
                                              authorization policy
                                                       ↓
                                      module repository + DB transaction
                                                       ↓
                              PostgreSQL: ticket + activity + deduplication
```

- Routes translate HTTP; services own workflows, authorization, and transaction boundaries; repositories own Prisma queries. Inject the database client and logger into service factories so tests exercise real workflows without starting an HTTP listener. Avoid generic base repositories or a framework built for this assessment.
- Other modules call a module's exported service/query functions rather than importing its repository. Dashboard may read domain tables through its dedicated read repository; it cannot change them.
- Share request/response validation schemas or document contracts in OpenAPI. Never share database entities directly with the browser; serialize explicit DTO fields. Keep role rules in one backend policy and test the matrix exhaustively.
- Maintain separate frontend server-data and session concerns. Use TanStack Query for request cancellation, deduplication, caching, and targeted invalidation; retain Context for session identity. Include user identity and all filters in query keys and clear cached data on logout/account change.

### Correctness during concurrency and retries

- Add `Ticket.version`, initially 1. Edit/assignment/status/delete requests supply `expectedVersion`; update using the authorized scope and version predicate, then increment the version atomically. A stale version returns 409 `STALE_TICKET`; the UI preserves input, refreshes current data, and asks the user to reconcile. A simultaneous stale delete must not remove a newer ticket revision.
- For ticket mutations and reply posting, acquire the ticket row lock before checking mutable assignment/status policy; assignment and reply races therefore resolve in database order. Lock relevant user rows first in stable ID order when validating staff role or changing roles, then ticket rows; use the same order across modules. Serialize role changes with one transaction-scoped PostgreSQL advisory lock and also acquire it while validating assignment targets, keeping role/assignment invariants consistent. Keep transactions short and make no external network calls inside them.
- Write each mutation and Activity row in the same transaction. A simulated activity failure must roll back the ticket/message change. A deleted ticket may lose its conversation/activity by the documented deletion policy; operational logs must still record the deletion ID without message content.
- Deduplicate `POST /tickets` and `POST /tickets/:id/messages` using `Idempotency-Key`. A unique `(userId, operation, key)` row stores a hash of the normalized request and the committed resource ID in the same transaction. Same key/body returns the same resource without another activity; changed body returns 409. Recheck current resource authorization before replaying a result. Retain keys for 24 hours; cleanup is a documented scheduled SQL/maintenance command, not an in-process authoritative timer.
- Retry the entire database transaction at most twice with jitter only for recognized serialization/deadlock aborts where rollback is confirmed. A connection loss at commit has an uncertain outcome: do not blindly rerun it. The client reuses its original idempotency key to recover creates/replies. Do not automatically replay other writes.

### Resource limits and failure recovery

- Set a 64 KiB JSON body limit, 100-item maximum page size, bounded database pool, finite pool acquisition timeout, and database statement timeout below the HTTP request deadline. Make limits configurable and document defaults. Apply the query deadline to nontransactional reads too; returning an HTTP timeout alone does not stop database work.
- Paginate conversation and activity history with opaque `(createdAt,id)` cursors, default 30/max 100. Load older entries explicitly, rendering the loaded entries chronologically. Ticket detail must not hydrate an unbounded conversation. Keep offset pagination for the assessment ticket/user lists; cap offset depth and use cursor pagination before supporting deep browsing at scale.
- Disable repeat submission while pending; preserve draft text when a request fails. Retry safe GET requests at most twice with jitter for transient network/502/503/504 failures; respect `Retry-After` on 429 and never retry auth/validation failures. Keep a create/reply key until that logical submission is resolved.
- Provide `GET /api/health/live` for process liveness and `GET /api/health/ready` for a bounded database probe and shutdown state. Keep `/api/health` as a readiness alias. Dependency loss yields 503 readiness while liveness stays healthy.
- On SIGTERM, mark unready, stop accepting requests, allow in-flight requests up to a 10-second drain period, then close the HTTP server and database pool. Log forced termination. Readiness/liveness failure must not expose configuration or connection strings.
- Bound login abuse at the hosting gateway using a shared rate limit across replicas. An in-memory development limiter is acceptable locally; if production hosting cannot supply a shared limiter, document the limitation or add a shared store before claiming replica-wide enforcement. Do not rely on sticky sessions for correctness.

### Observability and operational evidence

- Emit structured JSON logs with generated/validated request ID, route template, status, duration, actor ID when available, and safe error code. Return the request ID in a response header and error envelope. Redact cookies, authorization headers, passwords, secrets, ticket descriptions, and message bodies. Avoid user/ticket IDs as metric labels.
- Expose protected operational metrics or hosting telemetry for request rate, latency histogram, 5xx rate, database acquisition timeouts, and pool utilization where supported. Logs explain a particular failure; metrics reveal trends. Customer-facing ticket activity is a separate product feature.
- Document deploy-time migration, rollback to the prior API artifact, and database backup/restore procedures. Use additive migrations that keep the previous release usable; destructive schema changes require a later migration. Run migrations once as a release step rather than in every replica's startup.
- Add a deterministic synthetic load seed and a short load script covering scoped ticket reads and dashboard reads, with a smaller write stream. Proposed acceptance target: 50 concurrent authenticated users against 10,000 tickets and 50,000 messages, read p95 below 500 ms, write p95 below 800 ms, and unexpected 5xx below 1% during a five-minute warm run. These are test targets, not demonstrated capacity or availability promises. Report hardware, replica count, dataset, throughput, cold starts, percentiles, and actual outcomes; tune or explain misses.
- Inspect representative PostgreSQL query plans with `EXPLAIN (ANALYZE, BUFFERS)` on synthetic data. Choose composite indexes from owner/assignee + ordering predicates; avoid an index per field without evidence. Treat arbitrary substring subject search as a known scan until profiling justifies a trigram index.

### Scaling path and deliberate tradeoffs

| Observed constraint | Next change | Cost or consistency tradeoff |
| --- | --- | --- |
| API CPU saturation with database headroom | Add API replicas behind a load balancer | Total replica pools must remain within the database connection budget |
| Pool contention or slow list queries | Tune queries/indexes, cap concurrency, consider a connection pooler | More API replicas alone may worsen contention |
| Repeated expensive dashboard aggregation | Short-lived role-scoped cache or maintained summary | Define staleness; bypass/invalidate after mutations; prevent scope leakage |
| Deep ticket pagination becomes slow | Cursor API over stable compound indexes | No arbitrary page jump |
| Future email/webhook delivery slows requests | Transactional outbox plus worker and idempotent consumers | At-least-once delivery, retry/dead-letter operations; do not promise exactly-once effects |
| Reporting impacts transactional writes | Reporting replica or separate read model | Explicit replication lag and read-after-write routing needed |

Initial deployment remains one API service and PostgreSQL. Do not add Redis, a queue, a reporting replica, or Kubernetes solely for the architecture diagram. Database-backed sessions and idempotency support multiple API replicas; a second-replica smoke test is still required before claiming horizontal operation is verified.

Deliver `docs/architecture.md` with a deployment/request-flow diagram, trust boundaries, core invariants, failure modes, and scaling path; `docs/decisions.md` with concise decisions on modular monolith, PostgreSQL, JWT/session revocation, and consistency; `docs/operations.md` with recovery steps; and `docs/performance.md` with measured results and limits. Keep these short and grounded in implemented behavior.

## File Structure

The workspace currently contains documents only; there is no application to preserve.

```text
package.json                         npm workspaces and shared scripts
.gitignore                           secrets, dependencies, generated output
client/
  .env.example                       VITE_API_URL variable name only
  src/app/                           router, providers, role-aware shell
  src/lib/api.js                     Fetch, credentials, CSRF, error handling
  src/lib/query-client.js            bounded query retries and cache lifecycle
  src/features/auth/                 session context, login, registration
  src/features/tickets/              list, create/edit, detail, messages
  src/features/dashboard/            role-specific statistics and chart
  src/features/users/                Admin search, roles, assignment counts
  src/components/                    forms, badges, dialogs, feedback states
server/
  .env.example                       environment variable names only
  prisma/schema.prisma               User, Session, Ticket, Message, Activity, IdempotencyRecord
  prisma/migrations/                 versioned database setup
  prisma/seed.js                     demo roles and representative tickets
  src/app.js                         middleware and routes; export for tests
  src/index.js                       environment checks and HTTP listener
  src/lib/                           database, errors, configuration, logger, transaction retry
  src/modules/health/                readiness and liveness handlers
  src/middleware/                    auth, role checks, validation, CSRF
  src/modules/auth/                  auth routes, validation, service
  src/modules/tickets/               ticket policy, routes, service, repository
  src/modules/dashboard/             scoped aggregates
  src/modules/users/                 Admin listing and role changes
  test/                              API integration and policy tests
scripts/load/                        synthetic seed and reproducible load scenario
e2e/support-workflow.spec.js          three-role browser workflow
docs/api.md                          endpoint/request/response documentation
docs/architecture.md                 boundaries, diagrams, invariants, failure modes
docs/decisions.md                     concise architecture decisions and tradeoffs
docs/operations.md                    deploy, drain, migration, backup/restore
docs/performance.md                   measured load results and environment
docs/screenshots/                    final desktop and mobile evidence
README.md                            setup, choices, URLs, demo access, notes
```

## Data and API Contracts

- `User`: UUID `id`, `name`, normalized unique `email`, `passwordHash`, `role` (`Admin|Agent|Customer`), `createdAt`.
- `Ticket`: UUID `id`, unique auto-generated human-readable `ticketNumber` from a database sequence (never `count + 1`), `subject`, `description`, category/priority/status enums, required `customerId`, nullable `assignedAgentId`, `version`, `createdAt`, `updatedAt`. Default status Open, priority Medium, version 1.
- `Session`: random `id`, `userId`, `expiresAt`, nullable `revokedAt`, session-bound CSRF secret/hash. Index expiry for cleanup; never return session secrets in user DTOs.
- `IdempotencyRecord`: `userId`, `operation`, `key`, `requestHash`, `resourceId`, `createdAt`, `expiresAt`; composite unique constraint on `(userId, operation, key)`. Store no raw ticket/message content. Concurrent identical keys must converge to one committed resource.
- `Message`: UUID `id`, `ticketId`, `authorId`, nonempty `body`, `createdAt`.
- `Activity`: UUID `id`, `ticketId`, `actorId`, `action`, JSON `metadata`, `createdAt`. Record creation, assignment/reassignment, status changes, edits, and replies. Delete child messages/activity with a deleted ticket; permanent deletion auditing is outside this assessment.
- Index owner/date, assignee/date, status, priority, and ticket-number queries; add subject search indexing if query measurements justify it. Order messages/activity by `createdAt`, then `id` for deterministic ties.
- JSON enums use the exact display values above. Limits proposed: subject 1–200 characters, description 1–10,000, reply 1–5,000, trimmed before validation. Enforce valid UUIDs and enum values server-side.
- Responses: single resources `{ data }`; ticket/user lists `{ data, pagination: { page, pageSize, total, totalPages } }`; message/activity lists `{ data, pagination: { nextCursor, hasMore } }`; errors `{ error: { code, message, fieldErrors?, requestId } }`.
- List inputs: `page` (default 1), `pageSize` (default 20, maximum 100), `search`, `status`, `priority`, `assigneeId`. Apply access scope before filters, counts, and pagination. Use stable newest-first ordering.
- Use 201 for creation, 200 for reads/updates, 204 for deletion/logout, 400 for invalid input, 401 for unauthenticated, 403 for prohibited role actions, 404 for absent or inaccessible ticket resources, and 409 for conflicts.
- Implement all minimum endpoints from section 5, plus `POST /api/auth/logout`, `GET /api/auth/csrf`, `PATCH /api/users/:id/role`, `GET /api/tickets/:id/activity`, `/api/health/live`, `/api/health/ready`, and the `/api/health` readiness alias.
- Dashboard response: `{ counts: { total, open, inProgress, resolved, closed }, byStatus, recentActivity, highPriorityTickets, activeAgents?, agentWorkload? }`. Last two properties are Admin-only. Count Closed separately while including it in total.

## Implementation Tasks

Each task follows a focused failing-test → implementation → passing-test cycle where business behavior needs verification. Commit coherent changes after verification once Git is initialized; do not push until repository/destination details are available.

### Task 1: Database and secure authentication

**Files:** Root workspace/configuration; `server/prisma/*`; `server/src/{app.js,index.js,lib/*,middleware/*,modules/auth/*}`; `server/test/auth.test.js`.

**Interfaces:** `authenticate(req,res,next)` provides `req.user = { id, name, email, role }`; `requireRole(...roles)` gates role routes. Auth endpoints return safe user fields; cookie carries JWT. `GET /api/auth/csrf` supplies the token used by the API client.

- [ ] Initialize Git, npm workspaces, `.gitignore`, environment templates, and an isolated test database configuration. Record compatible dependency versions and lockfile.
- [ ] Define schema/migration and seed idempotent Admin, Agent, Customer accounts plus representative tickets/statuses. Supply demo passwords through seed environment configuration; document mock-only access later without storing operational secrets.
- [ ] Add tests named `registration_forces_customer_role`, `duplicate_email_returns_409`, `login_rejects_invalid_password`, `expired_jwt_returns_401`, and `responses_never_include_password_hash`. Assert mixed-case email normalization and authenticated mutation rejection without valid CSRF/origin.
- [ ] Implement register/login/me/logout/CSRF, bcrypt hashing, cookie configuration, login rate limiting, input validation, safe serializers, and centralized errors. Require production secrets at startup.
- [ ] Implement persisted sessions and test `logout_revokes_copied_jwt`, `role_change_applies_to_existing_session`, and `database_unavailable_returns_503_without_auth_bypass`. Add bounded request bodies, validated configuration, structured redacted logs, request IDs, and pool/query deadlines. Verify oversized input returns 413 and logs contain no submitted secret or message body.
- [ ] Run `npm run test -w server -- auth.test.js` against the test database. Expected: all auth cases pass; migration and seed succeed from a clean database.
- [ ] Commit the verified authentication/database foundation.

### Task 2: Tickets, authorization, conversations, and activity

**Files:** `server/src/modules/tickets/{routes.js,validation.js,policy.js,service.js,repository.js}`; `server/src/lib/transaction.js`; `server/test/{tickets,concurrency}.test.js`.

**Interfaces:** `ticketScope(user)` returns the database predicate for Admin/all, Agent/assigned, Customer/owned. `getAccessibleTicket(user,id)` returns a ticket or throws 404. All ticket/message/activity queries use this policy. Assignment accepts `{ assignedAgentId: string|null, expectedVersion: number }`; status accepts `{ status, expectedVersion: number }`. Edits carry `expectedVersion` in JSON; DELETE carries it in a validated `If-Match` header. Creates/replies carry `Idempotency-Key`. `withTransaction(work)` executes `work(tx)` with the bounded confirmed-abort retry policy.

- [ ] Add tests asserting the complete role matrix, including unrelated ticket GET/PATCH/DELETE and message GET/POST denial, Customer status/assignment denial, Agent reassignment denial, and privileged field rejection.
- [ ] Add tests for auto-generated unique ticket numbers, all category/priority/status values, allowed edits/deletes, staff creation/ownership rules, Agent self-assignment, valid Agent-only assignment, pagination bounds, and scoped search/filter combinations.
- [ ] Implement ticket CRUD, assignment/status routes, and message GET/POST. Use transactions to write mutations and corresponding activities together. Resolve ticket authorization inside the mutation transaction where relevant to avoid acting on stale assignment state.
- [ ] Test chronological replies, whitespace-only rejection, transaction rollback on failed activity insertion, deleted-ticket child cleanup, and stable ordering. Ensure ticket detail includes accessible conversation/activity data.
- [ ] Replace unbounded history hydration with cursor-paginated message/activity endpoints. Test equal timestamps across page boundaries, invalid cursors, maximum page size, and inaccessible-ticket cursors.
- [ ] Add integration tests using separate database connections: two updates with the same version produce one success/one 409; stale delete preserves the ticket; concurrent same-key creates/replies create one resource and one corresponding activity per event; key/body mismatch returns 409; replay after access loss returns 404. Verify reassignment racing a reply obeys the chosen lock order and no unauthorized write occurs after reassignment commits.
- [ ] Implement conditional version updates, consistent row/advisory locks, and transactional idempotency records. Test recognized deadlock/serialization abort retries are bounded, other errors are not retried, and a response lost after commit can recover through the same key without duplicating data.
- [ ] Run `npm run test -w server -- tickets.test.js concurrency.test.js`. Expected: every policy, concurrency, and retry assertion passes on PostgreSQL; do not substitute mocked transactions for race tests.
- [ ] Commit verified ticket workflows.

### Task 3: Admin users and role-aware reporting

**Files:** `server/src/modules/{users,dashboard}/*`; `server/test/{users,dashboard}.test.js`.

**Interfaces:** `GET /api/users` accepts user search/pagination and an optional role filter; returns safe users with assigned-ticket counts. `PATCH /api/users/:id/role` accepts `{ role }`. `GET /api/dashboard/stats` returns the contract above.

- [ ] Add tests for Admin-only user listing/role editing, search/count correctness, invalid role rejection, last-Admin protection, and assignment-dependent demotion rejection.
- [ ] Add dashboard fixtures with owned, assigned, unrelated, unassigned, Urgent, High, Closed, and resolved tickets. Assert exact scoped counts; empty database yields zeros/empty arrays; non-Admin responses omit team data.
- [ ] Implement user queries and transactional role safeguards. Serialize competing role changes so concurrent requests cannot remove all Admins.
- [ ] Test assignment racing Agent demotion and simultaneous Admin demotions with independent transactions; assert final database state satisfies both invariants. Follow the shared advisory/row lock order from the architecture section.
- [ ] Implement persisted aggregates, five most recent activities, five most recent High/Urgent unresolved tickets, and Admin workload per Agent. Use Open/In Progress as unresolved; include zero-workload Agents.
- [ ] Run `npm run test -w server -- users.test.js dashboard.test.js`. Expected: role and aggregate tests pass, including concurrent last-Admin protection.
- [ ] Commit user management and reporting.

### Task 4: Responsive shell and working ticket screens

**Files:** `client/src/{app/*,lib/api.js,features/auth/*,features/tickets/*,components/*}`; client entry/style/config files; focused client tests.

**Interfaces:** `api(path,{method,body,signal,idempotencyKey,expectedVersion})` handles JSON, cookies, CSRF, write headers, and errors with request IDs; `useAuth()` exposes `{ user, loading, login, register, logout }`. TanStack Query keys start with the user ID and resource, followed by filters/IDs. Protected routes `/dashboard`, `/tickets`, `/tickets/new`, `/tickets/:id`, `/users`.

- [ ] Build login/registration and session restoration with `/auth/me`; handle 401 by clearing session and redirecting to login. Keep JWT out of localStorage and JavaScript state.
- [ ] Build responsive navigation, profile dropdown/logout, reusable field/badge/dialog/feedback components, and keyboard/focus behavior.
- [ ] Build ticket search, filters, pagination, create/edit forms, detail metadata, chronological conversation, status controls, Admin assignment, and confirmed deletion. Show actions according to the role/policy proposals.
- [ ] Handle Agent creation returning an accessible self-assigned ticket. After create/edit/status/assign/reply/delete, refresh the affected detail, list, and dashboard on their next display without page reloads.
- [ ] Add bounded GET retries/cancellation, user-scoped query invalidation, draft-preserving 409 handling, paginated conversation loading, and stable idempotency keys across explicit create/reply retries. Verify logout clears cached private records and a stale search response cannot overwrite newer results. Keep write results server-confirmed to avoid optimistic rollback complexity.
- [ ] Add focused tests for validation feedback, session expiry, filtered-page reset, destructive confirmation cancellation, and server errors preserving form text. Run `npm run test -w client` and `npm run build -w client`; expected: tests and production build pass.
- [ ] Commit the usable customer/staff ticket interface.

### Task 5: Dashboards and Admin user management

**Files:** `client/src/features/{dashboard,users}/*`; `e2e/support-workflow.spec.js`; Playwright configuration.

**Interfaces:** Consume Task 3's user/statistics responses; share role and API interfaces from Task 4. Clicking a status chart segment opens the ticket list with its status filter.

- [ ] Build total/Open/In Progress/Resolved cards, interactive status chart including Closed, recent activity, high-priority tickets, and Admin active-agent/workload widgets. Provide loading, retryable error, and empty states.
- [ ] Build Admin user search, role display/editing, assigned-ticket counts, and assignment links. Explain role-change conflicts returned by the API. Document the seed script as the safe demo-Agent creation mechanism.
- [ ] Create a browser test using separate role sessions: Customer creates ticket → Admin assigns Agent → Agent replies/sets In Progress → Customer reads/replies → Agent resolves → scoped dashboards update. Assert another Customer cannot open that ticket and an unrelated Agent cannot reply.
- [ ] Run `npm run test:e2e` and a manual keyboard/mobile pass at 390px, tablet at 768px, and desktop at 1440px. Expected: primary workflow passes, dialogs manage focus, controls are usable, and pages have no horizontal overflow.
- [ ] Commit complete role-specific screens and workflow verification.

### Task 6: Deployment and assessment handoff

**Files:** Deployment configuration; `server/src/modules/health/*`; `server/test/resilience.test.js`; `scripts/load/*`; `README.md`; `docs/{api,architecture,decisions,operations,performance}.md`; `docs/screenshots/*`; environment templates as needed.

**Interfaces:** Hosted SPA routes resolve to the client; `/api/*` reaches the API; the API reaches migrated PostgreSQL. Health endpoint reports availability without exposing configuration.

- [ ] Once implementation is requested, choose available hosting/accounts and confirm the final deployment destination. Suggested topology: Vercel frontend, Render API, and managed PostgreSQL. Run an early hosted auth smoke test during Tasks 1/4 so cross-origin cookie problems are found before final delivery.
- [ ] Provision runtime variables, run production migrations and mock-data seed, configure SPA fallback, HTTPS, allowed origins, and correct cookie settings. Check persistence across API restart and never expose database credentials in the frontend.
- [ ] Implement readiness/liveness and SIGTERM drain. Test database loss/recovery, pool/query timeout responses, readiness during drain, completion of an in-flight request within the drain period, and forced closure after the deadline. Run failure injection against local/staging infrastructure only. Expected: bounded errors, no partial mutation, process stays live through a recoverable database outage, readiness recovers when the database returns.
- [ ] Verify logs/request IDs and protected telemetry, hosting-wide login limits, connection budget, a release migration, and rollback to the previous compatible API artifact. Perform a backup/restore rehearsal on synthetic data if supported; otherwise document the unverified procedure and provider limitations.
- [ ] Run the reproducible five-minute load scenario on synthetic data and inspect representative query plans. Record actual results in `docs/performance.md` even if targets are missed. If a second API instance is available, prove login on one/revocation on another, cross-instance idempotency, and consistent role enforcement; otherwise explicitly mark horizontal operation as designed but unverified.
- [ ] Run all server/client tests, `npm run build -w client`, and the browser workflow against deployed URLs. Verify direct ticket-route reload, expired session, logout, empty states, and all three demo accounts. Record actual results and any known limitations.
- [ ] Write README covering overview, setup commands, environment variable explanations, database rationale, relationships, permission assumptions, architecture, JWT tradeoffs, live/API/repository links, demo login details, testing, challenges, unfinished features, and AI assistance. Include the startup/migration/seed path from a fresh clone.
- [ ] Document each API method/path, auth/CSRF behavior, request/response examples, filters, pagination, validation, and error codes in `docs/api.md`.
- [ ] Write the four short engineering evidence documents named above. Explain each implemented guarantee, one measured bottleneck, known limits, and the next scaling trigger. Separate verified behavior from proposed future infrastructure.
- [ ] Capture at least one deployed desktop and one mobile screenshot. Fill the candidate submission fields with verified values, including receipt/deadline/submission times with timezone. Review tracked files for secrets and verify `.env.example` contains variable names only.
- [ ] Prepare a 20–30 minute demonstration: primary workflow, backend access-denial examples, architecture explanation, one actual bug fixed, and readiness for a small live change. Push meaningful commits and provide the verified submission package when authorized; do not send it to the company as part of implementation unless explicitly asked.

## Time Budget and Priority

The assessment suggests Planning 3h, Backend 12h, Frontend 14h, Integration 7h, QA 6h, Delivery 6h: these consume all 48 elapsed hours and leave no rest or contingency. Treat them as suggested proportions, not a sustainable work schedule.

Proposed budget: 36 focused hours plus 12 hours for rest/contingency within the elapsed window. If the receipt time shows less time remaining, cut extras and visual polish first; do not cut backend permissions or required submission evidence.

The senior-engineering additions increase delivery risk within this estimate. Time-box bespoke visual polish and documentation length, build concurrency/session primitives alongside their owning workflows, and run a short baseline load test rather than an optimization campaign. Do not silently drop resilience checks to meet a decorative UI target. Re-estimate after the first working vertical slice; multi-replica and backup rehearsal evidence depends on available infrastructure and must be labeled honestly if unavailable.

| Work | Focused hours | Completion evidence |
| --- | ---: | --- |
| Requirements, setup, schema, early hosting check | 2 | Runnable foundation and deployment feasibility |
| Authentication and ticket/message APIs | 9 | Role-policy API tests pass |
| Reporting and Admin users | 3 | Scoped dashboard and role tests pass |
| Auth/shell/ticket frontend | 9 | Primary UI connected to API |
| Dashboard/Admin frontend and integration | 5 | Three-role workflow passes |
| Security, responsive, and deployment QA | 4 | Hosted workflow and browser checks pass |
| Documentation, screenshots, final delivery | 4 | Submission checklist complete |
| **Focused work** | **36** | Required scope delivered |
| **Rest and contingency** | **12** | Reserved inside 48 elapsed hours |

Build the complete vertical workflow first. Broaden search, filters, reporting, and Admin role editing next. Finish required polish and evidence before considering optional extras.

## Senior Engineering Review Checklist

- [ ] Explain why a modular monolith fits the present scope and name the measured condition that would justify extracting a service.
- [ ] Demonstrate that concurrent writes cannot silently overwrite changes, failed activity writes roll back, and retrying an uncertain create cannot duplicate it.
- [ ] Demonstrate logout revocation, current-role enforcement, object-level access, and bounded resource consumption.
- [ ] Show graceful dependency failure, request correlation, and deployment/recovery procedures with actual test evidence.
- [ ] Present the measured performance envelope and distinguish tested scale from architectural potential.
- [ ] Explain one tradeoff accepted to fit 48 hours and one change justified by observed data.

## Coverage Review

- Authentication/security: Tasks 1–2 and deployed checks in Task 6.
- Dashboard: scoped backend in Task 3 and interactive frontend in Task 5.
- Ticket CRUD/search/filters/assignment/status: Tasks 2 and 4.
- Conversations/activity: transactional persistence in Task 2 and chronological UI in Task 4.
- Agent/user management: seed in Task 1, Admin API in Task 3, Admin UI in Task 5.
- Responsive/accessibility/feedback: Tasks 4–5.
- Minimum REST API, validation, errors, pagination, relationships/indexes: Tasks 1–3.
- Live frontend/API, GitHub, README, environment templates, database instructions, API docs, demo access, screenshots, implementation notes, interview readiness: Task 6.

**Planning status:** Complete against the supplied assessment. No application code, dependency installation, account provisioning, deployment, or submission has been performed.
