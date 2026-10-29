import { afterAll, beforeEach, it, expect } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { reset, account } from './helpers.js';
const db = new PrismaClient();
beforeEach(() => reset(db)); afterAll(() => db.$disconnect());
it('keeps liveness healthy while readiness follows database and draining state', async () => {
  const lifecycle = { draining: false }; const app = createApp({ db, lifecycle });
  expect((await request(app).get('/api/health/live')).status).toBe(200);
  expect((await request(app).get('/api/health/ready')).status).toBe(200);
  lifecycle.draining = true;
  expect((await request(app).get('/api/health/ready')).status).toBe(503);
  expect((await request(app).get('/api/health/live')).status).toBe(200);
  const unreachable = new PrismaClient({ datasourceUrl: 'postgresql://unavailable@127.0.0.1:1/no_database?connect_timeout=1' });
  try {
    const unavailable = createApp({ db: unreachable });
    expect((await request(unavailable).get('/api/health/ready')).status).toBe(503);
    expect((await request(unavailable).get('/api/health/live')).status).toBe(200);
  } finally { await unreachable.$disconnect(); }
});
it('rolls back a ticket mutation when its activity write fails', async () => {
  const app = createApp({ db }); const a = await account(db, app);
  const made = await a.send('post', '/api/tickets', { subject: 'Original', description: 'Description', category: 'General' }, { 'Idempotency-Key': crypto.randomUUID() });
  expect(made.status).toBe(201);
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION test_reject_activity() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated activity failure'; END; $$ LANGUAGE plpgsql`);
  await db.$executeRawUnsafe('CREATE TRIGGER test_activity_failure BEFORE INSERT ON "Activity" FOR EACH ROW EXECUTE FUNCTION test_reject_activity()');
  try {
    const result = await a.send('patch', `/api/tickets/${made.body.data.id}`, { subject: 'Changed', expectedVersion: 1 });
    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(await db.ticket.findUnique({ where: { id: made.body.data.id } })).toMatchObject({ subject: 'Original', version: 1 });
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER test_activity_failure ON "Activity"');
    await db.$executeRawUnsafe('DROP FUNCTION test_reject_activity()');
  }
});
it('fails authenticated reads closed with 503 when the database disappears', async () => {
  const a = await account(db, createApp({ db }));
  const unreachable = new PrismaClient({ datasourceUrl: 'postgresql://unavailable@127.0.0.1:1/no_database?connect_timeout=1' });
  try {
    const response = await request(createApp({ db: unreachable })).get('/api/auth/me').set('Cookie', a.cookie);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('postgresql');
  } finally { await unreachable.$disconnect(); }
});
it('limits operational metrics to Admin and records status/latency counters', async () => {
  const app = createApp({ db }); const admin = await account(db, app, 'Admin'), customer = await account(db, app);
  expect((await customer.send('get', '/api/operations/metrics')).status).toBe(403);
  await request(app).get('/api/health/live');
  const result = await admin.send('get', '/api/operations/metrics');
  expect(result.status).toBe(200);
  expect(result.body.data.requests).toBeGreaterThanOrEqual(4);
  expect(result.body.data.latencyBucketsMs['10000']).toBeGreaterThanOrEqual(4);
  expect(result.body.data.responses['2xx']).toBeGreaterThanOrEqual(3);
});
