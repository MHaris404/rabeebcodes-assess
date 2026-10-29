# Performance Evidence

The five-minute local benchmark completed on October 29, 2026. Raw measurements and an execution plan are in [benchmark evidence](evidence/benchmark.json). These results describe this synthetic workload on one local machine; they do not establish internet latency, hosted capacity, availability, or multi-replica performance.

| Condition | Observed value |
| --- | --- |
| Machine | Apple M5, 10 logical CPUs, 16 GiB RAM |
| Runtime/database | Node.js 24.13.0, PostgreSQL 15 on loopback |
| API instances / connection pool | 1 / 10 connections |
| Initial synthetic records | 10,000 tickets, 50,000 messages, 10,000 activities, 50 Customers |
| Concurrent authenticated users | 50 |
| Warm measured duration | 300 seconds |
| Total requests | 386,228 |
| Throughput | 1,287 requests/second |
| Read latency p50 / p95 / p99 | 38 / 55 / 75 ms |
| Write latency p50 / p95 / p99 | 44 / 65 / 94 ms |
| Responses | 366,928 × 200; 19,300 × 201 |
| Unexpected 5xx/network errors | 0 |

Mix: 80% scoped ticket lists, 15% scoped dashboard reads, 5% reply writes after warm-up. Each Customer owns 200 initial tickets. Sessions are provisioned directly as valid database sessions; authentication/role/session checks are still executed on every measured request, but login/password-hashing throughput is excluded. Bodies are consumed before measuring completion. There is no think time or network hop beyond local loopback. The dataset grows by the committed replies and activities during the run.

Proposed plan targets (read p95 <500 ms; write p95 <800 ms; unexpected error rate <1%) were met for this workload. Do not extrapolate this into a production capacity promise. The benchmark used Prisma 6.19.3; subsequent dependency changes require a new run before attributing these exact values to a later build.

## Query evidence and limits

The sample owner-scoped descending ticket query used `Ticket_customerId_createdAt_id_idx` in a bitmap index/heap scan followed by top-N sort. It visited 200 owned rows and returned 20 in 0.130 ms execution time with warm shared-buffer hits. PostgreSQL estimated 14 rows before later auto-analysis, so keep table statistics current. The plan does not demonstrate that every production predicate avoids a scan.

Subject substring search remains a potential scan. Deep offset pagination is deliberately capped. Admin-wide activity/aggregate workloads and uneven customer sizes were not covered by this 50-Customer scenario. Next useful load cases: a large single Customer, all-Admin reporting traffic, large conversation pagination, and connection-limited managed PostgreSQL.

No second API replica, managed database failover, gateway rate limit, internet cold start, or provider backup/restore has been benchmarked. Adopt the scaling changes in the architecture plan only after measurements show which resource is limiting.
