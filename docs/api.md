# SupportDesk API

Base path `/api`. JSON requests/responses; cookie authentication. Successful single results are `{ "data": ... }`. Tickets/users return `{ "data": [], "pagination": { "page", "pageSize", "total", "totalPages" } }`. Histories return `{ "data": [], "pagination": { "nextCursor", "hasMore" } }`.

## Authentication and request headers

All mutations require `Origin` matching `CLIENT_ORIGIN`. After login/registration, send the returned HttpOnly cookie and `X-CSRF-Token` for authenticated writes. `/auth/csrf` restores the CSRF token after browser reload. Clients must enable cookie credentials. Never store the JWT in localStorage.

`POST /tickets` and `POST /tickets/:id/messages` require a stable `Idempotency-Key` of 8–128 letters/digits/underscore/hyphen. Reuse it only when retrying the identical logical submission; changed input with the same key returns 409.

PATCH ticket operations require the integer `expectedVersion` from the last ticket read. DELETE uses `If-Match: <version>`. Conflicts return `STALE_TICKET`. Request IDs are returned in `X-Request-ID` and error envelopes.

| Method | Path | Access and request |
| --- | --- | --- |
| POST | `/auth/register` | Public; `{name,email,password}`; Customer only; 201 |
| POST | `/auth/login` | Public; `{email,password}`; 200 |
| GET | `/auth/me` | Session; safe current user |
| GET | `/auth/csrf` | Session; `{csrfToken}` |
| POST | `/auth/logout` | Session + CSRF; revoke session; 204 |
| GET | `/tickets` | Session; scoped list and filters |
| POST | `/tickets` | Session + CSRF + retry key; ticket fields; 201 |
| GET | `/tickets/:id` | Accessible ticket with safe customer/assignee |
| PATCH | `/tickets/:id` | Admin or own Open ticket Customer; allowed fields + version |
| DELETE | `/tickets/:id` | Same edit policy; If-Match; 204 |
| PATCH | `/tickets/:id/assign` | Admin; `{assignedAgentId: UUID or null,expectedVersion}` |
| PATCH | `/tickets/:id/status` | Admin/assigned Agent; `{status,expectedVersion}` |
| GET | `/tickets/:id/messages` | Accessible ticket; paginated conversation |
| POST | `/tickets/:id/messages` | Accessible ticket; `{body}` + retry key; 201 |
| GET | `/tickets/:id/activity` | Accessible ticket; paginated activity |
| GET | `/users` | Admin; safe users with assignedTicketCount |
| PATCH | `/users/:id/role` | Admin; `{role}`; invariant conflicts return 409 |
| GET | `/dashboard/stats` | Session; role-scoped totals/activity/priority; Admin adds team data |
| GET | `/health/live` | Public; process alive |
| GET | `/health/ready` | Public; database ready and not draining; otherwise 503 |
| GET | `/health` | Readiness alias |
| GET | `/operations/metrics` | Admin; process request/status/latency counters |

## Ticket input

```json
{
  "subject": "Unexpected invoice charge",
  "description": "The invoice includes one extra seat.",
  "category": "Billing",
  "priority": "High"
}
```

Subject 1–200 characters; description 1–10,000; message body 1–5,000, all trimmed. Priority defaults to Medium; status starts Open. Categories: Technical/Billing/General/Other. Priorities: Low/Medium/High/Urgent. Statuses: Open/In Progress/Resolved/Closed. Registration name 2–100, password 12–72 characters, email normalized lowercase and unique. Unknown mutation fields are rejected. Admin may optionally supply `customerId` for a current Customer; others default to their own identity.

Tickets expose UUID `id`, display `ticketNumber` such as `SD-00001`, `version`, fields, ownership/assignment IDs, safe user DTOs, and ISO timestamps. Details do not include unbounded messages or activities.

## Query parameters

- Tickets: `page=1`, `pageSize=20` (maximum 100), `search` (subject substring or display ticket number), `status`, `priority`, `assigneeId` (UUID or `unassigned`). Page maximum 500. Authorization scope always precedes filters/counts.
- Users: same paging bounds; `search` matches name/email; `role` accepts Admin/Agent/Customer.
- Message/activity history: `pageSize=30` (maximum 100), opaque `cursor`. Initial page contains newest entries ordered chronologically; `nextCursor` requests an older page. Prepend older pages when rendering.

Dashboard `data` contains `counts: {total,open,inProgress,resolved,closed}`, `byStatus`, five `recentActivity`, five `highPriorityTickets`; Admin adds `activeAgents` and `agentWorkload`. Closed remains part of total. High-priority means High/Urgent in Open/In Progress.

## Errors

```json
{"error":{"code":"STALE_TICKET","message":"This ticket changed while you were working. Refresh it and review your changes.","requestId":"uuid"}}
```

400 invalid input (optional `fieldErrors`); 401 invalid/expired/revoked session; 403 denied role/CSRF/origin; 404 absent or inaccessible resource; 409 stale version/duplicate email/idempotency mismatch/role invariant; 413 oversized body; 429 login throttle; 503 dependency failure with `Retry-After`. Unexpected errors return 500 without internals. Never retry an arbitrary write automatically. GET retry policy is finite; use the original key when recovering uncertain create/reply outcomes.
