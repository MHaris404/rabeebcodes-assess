// Synthetic local-only benchmark. Never points at the development or production database.
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/src/app.js';
import pino from 'pino';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
try { process.loadEnvFile('server/.env'); } catch { /* environment can be supplied */ }
const connection = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(connection.hostname)) throw new Error('Benchmark only supports a local PostgreSQL instance.');
connection.pathname = '/supportdesk_bench';
process.env.DATABASE_URL = connection.toString();
const duration = Number(process.env.BENCH_SECONDS || 300);
if (!Number.isFinite(duration) || duration < 1 || duration > 600) throw new Error('BENCH_SECONDS must be 1–600.');
const require = createRequire(new URL('../../server/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const prismaCLI = join(dirname(require.resolve('prisma/package.json')), 'build/index.js');
const migrate = spawnSync(process.execPath, [prismaCLI, 'migrate', 'deploy', '--schema', 'server/prisma/schema.prisma'], { env: process.env, encoding: 'utf8' });
if (migrate.status !== 0) throw new Error(migrate.stderr);
const db = new PrismaClient();
const durations = { read: [], write: [] }, statusCodes = {};
let server;
try {
  await db.$executeRawUnsafe('TRUNCATE "User", "Session", "Ticket", "Message", "Activity", "IdempotencyRecord" RESTART IDENTITY CASCADE');
  const actors = Array.from({ length: 50 }, (_, i) => ({ id: randomUUID(), name: `Load Customer ${i}`, email: `load${i}@bench.invalid`, passwordHash: 'not-a-login-password', role: 'Customer' }));
  await db.user.createMany({ data: actors });
  const tickets = Array.from({ length: 10000 }, (_, i) => ({ id: randomUUID(), subject: `Synthetic issue ${i}`, description: 'Synthetic benchmark data', category: ['Technical', 'Billing', 'General', 'Other'][i % 4], priority: ['Low', 'Medium', 'High', 'Urgent'][i % 4], status: ['Open', 'InProgress', 'Resolved', 'Closed'][i % 4], customerId: actors[i % 50].id }));
  for (let i = 0; i < tickets.length; i += 500) await db.ticket.createMany({ data: tickets.slice(i, i + 500) });
  for (let i = 0; i < tickets.length; i += 200) {
    const batch = tickets.slice(i, i + 200);
    await db.message.createMany({ data: batch.flatMap(t => Array.from({ length: 5 }, () => ({ ticketId: t.id, authorId: t.customerId, body: 'Synthetic conversation reply' }))) });
    await db.activity.createMany({ data: batch.map(t => ({ ticketId: t.id, actorId: t.customerId, action: 'ticket.created' })) });
  }
  const sessions = [];
  for (const actor of actors) {
    const csrfToken = randomBytes(32).toString('hex');
    const session = await db.session.create({ data: { userId: actor.id, csrfToken, expiresAt: new Date(Date.now() + 3600000) } });
    sessions.push({ cookie: `supportdesk_session=${jwt.sign({ sub: actor.id, sid: session.id }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'supportdesk', audience: 'supportdesk-web' })}`, csrfToken });
  }
  const queryPlan = await db.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, subject FROM "Ticket" WHERE "customerId" = ${actors[0].id}::uuid ORDER BY "createdAt" DESC, id DESC LIMIT 20`;
  server = createApp({ db, logger: pino({ level: 'silent' }) }).listen(4001, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  async function operation(i, sequence, record) {
    const write = sequence % 20 === 19;
    const path = write ? `/tickets/${tickets[i].id}/messages` : sequence % 5 === 4 ? '/dashboard/stats' : '/tickets?pageSize=20';
    const start = performance.now(); let status;
    try {
      const response = await fetch(`http://127.0.0.1:4001/api${path}`, { method: write ? 'POST' : 'GET', headers: { Cookie: sessions[i].cookie, Origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', 'X-CSRF-Token': sessions[i].csrfToken, ...(write ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {}) }, ...(write ? { body: JSON.stringify({ body: 'Synthetic load-test reply' }) } : {}), signal: AbortSignal.timeout(10000) });
      await response.arrayBuffer(); status = response.status;
    } catch { status = 0; }
    if (record) { durations[write ? 'write' : 'read'].push(performance.now() - start); statusCodes[status] = (statusCodes[status] || 0) + 1; }
  }
  console.log('Seeded 10,000 tickets and 50,000 messages. Warming 50 authenticated users.');
  await Promise.all(actors.map((_, i) => operation(i, 0, false)));
  const started = performance.now(), until = started + duration * 1000;
  await Promise.all(actors.map(async (_, i) => { let sequence = 0; while (performance.now() < until) await operation(i, sequence++, true); }));
  const elapsed = (performance.now() - started) / 1000;
  const summarize = values => { values.sort((a, b) => a - b); return { requests: values.length, p50Ms: Math.round(values[Math.floor(values.length * .5)] || 0), p95Ms: Math.round(values[Math.floor(values.length * .95)] || 0), p99Ms: Math.round(values[Math.floor(values.length * .99)] || 0) }; };
  const total = durations.read.length + durations.write.length;
  const errors = Object.entries(statusCodes).filter(([status]) => Number(status) >= 500 || Number(status) === 0).reduce((sum, [, count]) => sum + count, 0);
  const result = { measuredAt: new Date().toISOString(), environment: { node: process.version, prisma: require('@prisma/client/package.json').version, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30), database: 'PostgreSQL 15, local loopback', apiReplicas: 1, poolLimit: 10 }, initialDataset: { users: 50, tickets: 10000, messages: 50000, activity: 10000 }, sessions: 'Pre-provisioned valid database sessions; login throughput excluded', concurrentUsers: 50, durationSeconds: Math.round(elapsed), throughputPerSecond: Math.round(total / elapsed), reads: summarize(durations.read), writes: summarize(durations.write), statusCodes, unexpectedErrorRate: errors / total, queryPlan };
  await mkdir('docs/evidence', { recursive: true });
  await writeFile('docs/evidence/benchmark.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, queryPlan: '(see docs/evidence/benchmark.json)' }, null, 2));
} finally { if (server) await new Promise(resolve => server.close(resolve)); await db.$disconnect(); }
