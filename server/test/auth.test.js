import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { reset, account } from './helpers.js';
const db = new PrismaClient();
const app = createApp({ db });
beforeEach(() => reset(db));
afterAll(() => db.$disconnect());
const register = (body) => request(app).post('/api/auth/register').set('Origin', 'http://localhost:5173').send(body);
describe('Authentication boundary', () => {
  it('rejects privileged registration fields and normalizes email', async () => {
    const data = { name: 'Haris', email: 'HARIS@example.com', password: 'StrongPassword123!' };
    expect((await register({ ...data, role: 'Admin' })).status).toBe(400);
    const res = await register(data);
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'haris@example.com', role: 'Customer' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect((await register(data)).status).toBe(409);
  });
  it('rejects incorrect passwords without leaking account existence', async () => {
    const a = await account(db, app);
    for (const email of [a.user.email, 'unknown@test.example']) {
      const res = await request(app).post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email, password: 'wrongPassword' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
  });
  it('revokes copied JWT on logout and denies expired JWT', async () => {
    const a = await account(db, app);
    expect((await a.send('get', '/api/auth/me')).body.data.role).toBe('Customer');
    expect((await a.send('post', '/api/auth/logout')).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', a.cookie)).status).toBe(401);
    const expired = jwt.sign({ sub: a.user.id, sid: crypto.randomUUID() }, process.env.JWT_SECRET, { expiresIn: -1 });
    expect((await request(app).get('/api/auth/me').set('Cookie', `supportdesk_session=${expired}`)).status).toBe(401);
  });
  it('requires trusted origin and a valid CSRF token for mutations', async () => {
    const a = await account(db, app);
    expect((await a.agent.post('/api/auth/logout').set('Origin', 'http://localhost:5173')).status).toBe(403);
    expect((await a.agent.post('/api/auth/logout').set('Origin', 'https://evil.example').set('X-CSRF-Token', a.csrf)).status).toBe(403);
    expect((await a.send('get', '/api/auth/me')).status).toBe(200);
  });
  it('reloads roles, bounds request bodies, and returns request IDs', async () => {
    const a = await account(db, app);
    await db.user.update({ where: { id: a.user.id }, data: { role: 'Agent' } });
    expect((await a.send('get', '/api/auth/me')).body.data.role).toBe('Agent');
    const big = await register({ name: 'a'.repeat(70000) });
    expect(big.status).toBe(413);
    expect(big.body.error.requestId).toBeTruthy();
    expect(big.headers['x-request-id']).toBe(big.body.error.requestId);
  });
  it('throttles failed logins without blocking repeated valid sign-ins', async () => {
    const a = await account(db, app);
    const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'development';
    const limited = createApp({ db }); process.env.NODE_ENV = previous;
    for (let i = 0; i < 32; i++) {
      const res = await request(limited).post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email: a.user.email, password: 'TestPassword123!' });
      expect(res.status).toBe(200);
    }
    let last;
    for (let i = 0; i < 31; i++) last = await request(limited).post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email: a.user.email, password: 'WrongPassword!' });
    expect(last.status).toBe(429);
  });
});
