import { beforeEach, afterAll, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { reset, account } from './helpers.js';
const db = new PrismaClient();
const app = createApp({ db });
beforeEach(() => reset(db));
afterAll(() => db.$disconnect());
it('scopes counts and team information and handles empty data', async () => {
  const customer = await account(db, app);
  const admin = await account(db, app, 'Admin');
  const agent = await account(db, app, 'Agent');
  expect((await customer.send('get', '/api/dashboard/stats')).body.data.counts.total).toBe(0);
  await db.ticket.createMany({ data: [
    { subject: 'Own open', description: 'Issue', category: 'General', customerId: customer.user.id, priority: 'Urgent' },
    { subject: 'Unrelated resolved', description: 'Issue', category: 'Billing', customerId: admin.user.id, assignedAgentId: agent.user.id, status: 'Resolved' },
    { subject: 'Own closed', description: 'Issue', category: 'Technical', customerId: customer.user.id, status: 'Closed' },
  ] });
  const own = (await customer.send('get', '/api/dashboard/stats')).body.data;
  expect(own.counts).toEqual({ total: 2, open: 1, inProgress: 0, resolved: 0, closed: 1 });
  expect(own.activeAgents).toBeUndefined();
  expect(own.agentWorkload).toBeUndefined();
  expect((await agent.send('get', '/api/dashboard/stats')).body.data.counts.total).toBe(1);
  const all = (await admin.send('get', '/api/dashboard/stats')).body.data;
  expect(all.counts.total).toBe(3);
  expect(all.activeAgents).toBe(1);
  expect(all.highPriorityTickets).toHaveLength(1);
  expect(all.agentWorkload[0].ticketCount).toBe(1);
});
it('restricts user listing, returns counts, and protects the last Admin', async () => {
  const admin = await account(db, app, 'Admin');
  const customer = await account(db, app);
  expect((await customer.send('get', '/api/users')).status).toBe(403);
  const users = await admin.send('get', '/api/users?search=Customer');
  expect(users.body.pagination.total).toBe(1);
  expect(users.body.data[0].assignedTicketCount).toBe(0);
  expect(JSON.stringify(users.body)).not.toContain('passwordHash');
  expect((await admin.send('patch', `/api/users/${admin.user.id}/role`, { role: 'Customer' })).status).toBe(409);
});
it('rejects Agent demotion with assignments and concurrent last-Admin demotions', async () => {
  const admin = await account(db, app, 'Admin', 'one');
  const second = await account(db, app, 'Admin', 'two');
  const agent = await account(db, app, 'Agent');
  await db.ticket.create({ data: { subject: 'Assigned', description: 'Issue', category: 'General', customerId: admin.user.id, assignedAgentId: agent.user.id } });
  expect((await admin.send('patch', `/api/users/${agent.user.id}/role`, { role: 'Customer' })).status).toBe(409);
  const res = await Promise.all([admin.send('patch', `/api/users/${admin.user.id}/role`, { role: 'Customer' }), second.send('patch', `/api/users/${second.user.id}/role`, { role: 'Customer' })]);
  expect(res.map(r => r.status).sort()).toEqual([200, 409]);
  expect(await db.user.count({ where: { role: 'Admin' } })).toBe(1);
});
