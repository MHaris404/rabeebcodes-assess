# Implementation Notes

## Decisions made while implementing

- Work remains in the supplied workspace on `feat/supportdesk`; there was no existing application to isolate or preserve.
- Database-dependent tests use real PostgreSQL, including concurrent requests, deduplication, and rollback when an Activity trigger rejects insertion.
- The version/access checks are inside the transaction; simply checking authorization in an Express route before a later write would leave a reassignment race.
- Prisma cannot deserialize PostgreSQL's `void` return from an advisory-lock SELECT. A reproduced integration failure led to casting the result to text while retaining transaction lock behavior.
- Browser tests exposed an anonymous-session reset loop, followed by an observer-lifecycle issue caused by clearing the entire query cache. Anonymous auth checks now settle without a session-expired event; identity transitions cancel requests and remove private queries while preserving the session query observer.
- Helper text inside a label changed the accessible field name. Subject/description now have explicit names and associated descriptions, verified by browser label queries.
- Reply feedback could arrive after a later status update because it waited for invalidation; feedback is now emitted before the refresh so an older completion cannot replace the newer action's notification.

## Evidence and remaining delivery work

Local development, test, and benchmark databases are separate. The full API regression suite and desktop/mobile browser workflow are run during verification; the execution ledger records final counts rather than implying every proposed plan test was implemented.

The load report contains measured data and environment limitations. Architecture diagrams describe current boundaries and a future scaling path separately. Backup restore, a second API replica, cross-provider production cookies, and graceful shutdown under a controlled long-running request require additional evidence before being claimed as verified.

Hosted frontend/API URLs remain pending an Express-compatible deployment destination. Render/Vercel configuration is supplied, but no provider resources or paid plan were provisioned. GitHub publishing targets the connected user's private `MHaris404/rabeebcodes-assess` repository. The receipt time was not present in the source assessment; the final submission deadline must be set to exactly 48 elapsed hours after that actual receipt time.

Optional attachments, email, password recovery, real-time subscriptions, Docker, and queues remain outside scope. Login throttling is process-local until a shared gateway/store is configured. Metrics are process-local cumulative counters. These limitations are explicit so the reviewer can assess what is implemented and what still depends on infrastructure.
