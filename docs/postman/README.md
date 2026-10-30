# Postman

1. Import `SupportDesk.postman_collection.json` and `SupportDesk.local.postman_environment.json` into Postman.
2. Select **SupportDesk Local** and set its `password` to the local demo password: `SupportDesk2026!` (or your configured seed password).
3. Run the **Core workflow** folder with its default Admin email. Keep Postman's cookie jar enabled.

The workflow logs in, captures CSRF automatically, finds an Agent, creates a demo ticket, updates/assigns it, posts and retries a reply, checks conversation/activity/dashboard/metrics, then deletes that demo ticket and logs out. IDs, ticket versions, and idempotency keys are managed by request scripts. No signing secret or JWT must be copied manually.

Use **Registration reference (manual)** separately to create a new Customer. That request switches the current cookie session to the new Customer; run Login again to return to Admin. Registration is rate-limited.

To explore other roles, change the environment `email` to `agent@supportdesk.demo` or `customer@supportdesk.demo`, then send Login and individual requests. Admin-only requests in the complete core workflow will correctly fail for those roles. Customer access requires owned tickets; Agent access requires assignment.

`baseUrl` includes `/api`. `origin` must match the backend's `CLIENT_ORIGIN`, including the scheme and port. The environment leaves the password blank intentionally; do not commit exported real sessions or credentials.

After an uncertain create/reply response, retry the same request with its existing key and identical body. To begin a different logical submission, use a new key. For a stale-version response, read the ticket and review its current fields before editing again. History endpoints return `nextCursor` for older pages; append it as a `cursor` query parameter when needed.

CLI verification with Newman:

```bash
npx newman run docs/postman/SupportDesk.postman_collection.json \
  -e docs/postman/SupportDesk.local.postman_environment.json \
  --env-var 'password=SupportDesk2026!' --folder 'Core workflow'
```

Run this against local/mock data with the API running. The core workflow deletes only the demo ticket it creates.
