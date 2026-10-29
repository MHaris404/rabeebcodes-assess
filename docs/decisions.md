# Architecture Decisions

## Modular monolith

One Express service contains distinct auth, ticket, user, reporting, and health modules. This keeps transactions local and permits one deployment in a 48-hour assessment. Independent services would require distributed consistency and operational ownership without evidence of that need. Extract a service only when independent scaling/release requirements and measured coupling justify it.

## PostgreSQL and Prisma

Ownership/assignment and conversations have explicit foreign keys. PostgreSQL supplies unique constraints, atomic activity, row locks, sequences, and aggregate queries. Prisma supplies reproducible migrations and safe parameterized access; narrow raw SQL handles locking and timeouts. ORM error codes require explicit mapping rather than exposing database diagnostics.

## JWT with revocable sessions

The assessment requires JWT; a database Session gives immediate logout/revocation and session-bound CSRF. This adds a database lookup to each authenticated request and makes database availability part of authentication availability. Accept that cost for correct revocation and current roles. Fail closed on dependency failure. Refresh tokens are deliberately omitted; sessions expire after 30 minutes.

## Explicit conflicts and idempotency

Version checks protect staff from overwriting each other's work. Row locks protect mutable access checks. Creates/replies use unique idempotency records in the same transaction as their effects. This adds a table and maintenance work, but makes network retry behavior explainable. Do not call it exactly-once HTTP delivery: deduplication holds for the retention period and logical key, not for a client that invents a new key.

## Frontend consistency

Context holds session identity; TanStack Query holds server state. User-scoped keys avoid cache leakage, and mutations invalidate related queries. Writes wait for server confirmation rather than optimistic updates with complex rollback. Error feedback preserves drafts and request IDs. Initial anonymous session checks do not trigger destructive cache resets; session observers remain mounted when private data is cleared.

## Bounded resource usage

64 KiB JSON bodies, field limits, bounded pages/history, a capped connection pool, transaction/query/lock deadlines, and finite retries limit load amplification. No unlimited conversation hydration. Offset ticket/user pages are capped at page 500; this is an assessment-friendly browsing limit, with cursors as the next change for deep datasets.
