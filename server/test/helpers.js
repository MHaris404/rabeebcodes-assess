import request from 'supertest';
import bcrypt from 'bcryptjs';
export async function reset(db) {
  await db.$executeRawUnsafe('TRUNCATE "User", "Session", "Ticket", "Message", "Activity", "IdempotencyRecord" RESTART IDENTITY CASCADE');
}
export async function account(db, app, role = 'Customer', suffix = '') {
  const email = `${role.toLowerCase()}${suffix}@test.example`;
  const user = await db.user.create({ data: { name: `${role} ${suffix}`.trim(), email, role, passwordHash: await bcrypt.hash('TestPassword123!', 4) } });
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email, password: 'TestPassword123!' });
  if (login.status !== 200) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);
  const csrf = login.body.data.csrfToken;
  const send = (method, path, body, headers = {}) => {
    const call = agent[method](path).set('Origin', 'http://localhost:5173').set('X-CSRF-Token', csrf).set(headers);
    return body === undefined ? call : call.send(body);
  };
  return { user, agent, csrf, send, cookie: login.headers['set-cookie'] };
}
