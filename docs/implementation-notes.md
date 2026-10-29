# Implementation Notes

## Decisions made while implementing

- Work remains in the supplied workspace on `feat/supportdesk`; there was no existing application to isolate or preserve.
- Database-dependent tests use real PostgreSQL, including concurrent requests, deduplication, and rollback when an Activity trigger rejects insertion.
- The version/access checks are inside the transaction; simply checking authorization in an Express route before a later write would leave a reassignment race.
- Prisma cannot deserialize PostgreSQL's `void` return from an advisory-lock SELECT. A reproduced integration failure led to casting the result to text while retaining transaction lock behavior.
- Browser tests exposed an anonymous-session reset loop, followed by an observer-lifecycle issue caused by clearing the entire query cache. Anonymous auth checks now settle without a session-expired event; identity transitions cancel requests and remove private queries while preserving the session query observer.
- Helper text inside a label changed the accessible field name. Subject/description now have explicit names and associated descriptions, verified by browser label queries.
- Reply feedback could arrive after a later status update because it waited for invalidation; feedback is now emitted before the refresh so an older completion cannot replace the newer action's notification.
- Independent review found that a background refresh could move a form's version ahead of its original draft. Edits now capture the base version, submit only dirty fields, and require an explicit comparison/rebase after a conflict. Delete confirmation captures its original revision rather than adopting a refreshed version.
- Create/reply attempts now retain an immutable payload/key until an uncertain result is resolved. Fields are disabled during submission and uncertainty; retry recovers that original attempt. Browser tests drop a committed reply response and prove recovery creates exactly one message.
- Registration has a separate five-attempt/15-minute process limiter that counts successful account creation. Login throttles failed attempts while allowing successful sign-ins. Both require shared infrastructure for fleet-wide enforcement.
- Matching Prisma CLI/Client are pinned at 6.12.0 after newer CLI tooling introduced dependency advisories. The unused prior copy was removed, dependencies pruned, and the final audit reports zero vulnerabilities. A separate temporary checkout passed `npm ci` and the production build without the workspace's existing dependencies or secrets.

## Evidence and remaining delivery work

Local development, test, and benchmark databases are separate. Final verification passes 20 backend tests, 4 client tests, and 10 desktop/mobile Playwright tests. The production build succeeds. The five-minute benchmark was repeated on pinned Prisma 6.12.0: 50 concurrent sessions, read p95 38 ms, write p95 44 ms, zero unexpected errors. The execution ledger records evidence rather than implying every proposed plan edge-case test was implemented.

The load report contains measured data and environment limitations. Architecture diagrams describe current boundaries and a future scaling path separately. Backup restore, a second API replica, cross-provider production cookies, and graceful shutdown under a controlled long-running request require additional evidence before being claimed as verified.

Hosted frontend/API URLs remain pending an Express-compatible deployment destination. Render/Vercel configuration is supplied, but no provider resources or paid plan were provisioned. GitHub publishing targets the connected user's private `MHaris404/rabeebcodes-assess` repository. The receipt time was not present in the source assessment; the final submission deadline must be set to exactly 48 elapsed hours after that actual receipt time.

Optional attachments, email, password recovery, real-time subscriptions, Docker, and queues remain outside scope. Login throttling is process-local until a shared gateway/store is configured. Metrics are process-local cumulative counters. These limitations are explicit so the reviewer can assess what is implemented and what still depends on infrastructure.

Two review minors are deferred: Agent selectors load the first 100 Agents rather than offering server-backed search; logout after a session already expired can show an error until another session/profile check clears local state. The backend still denies the expired session. These need follow-up before larger-team rollout or further session UX polish.
