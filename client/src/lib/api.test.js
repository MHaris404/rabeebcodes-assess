import { afterEach, it, expect, vi } from 'vitest';
import { api, setCsrf } from './api.js';
afterEach(() => { vi.unstubAllGlobals(); setCsrf(null); });
it('sends cookie credentials, CSRF, version and a stable retry key', async () => {
  let observed;
  vi.stubGlobal('fetch', async (url, options) => { observed = options; return new Response(JSON.stringify({ data: { id: 'ticket-id' } }), { status: 201 }); });
  setCsrf('token');
  const res = await api('/tickets', { method: 'POST', body: { subject: 'Help' }, idempotencyKey: 'same-key', expectedVersion: 2 });
  expect(observed.credentials).toBe('include');
  expect(observed.headers).toMatchObject({ 'X-CSRF-Token': 'token', 'Idempotency-Key': 'same-key', 'If-Match': '2' });
  expect(res.data.id).toBe('ticket-id');
});
it('preserves conflict codes and request IDs for recoverable UI feedback', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'STALE_TICKET', message: 'Refresh ticket', requestId: 'request-1' } }), { status: 409 }));
  await expect(api('/tickets/id')).rejects.toMatchObject({ status: 409, code: 'STALE_TICKET', requestId: 'request-1' });
});
it('handles empty delete responses without parsing JSON', async () => {
  vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
  expect(await api('/tickets/id', { method: 'DELETE' })).toBe(null);
});
it('does not expire a session during the initial anonymous profile check', async () => {
  const target = new EventTarget(); let expirations = 0;
  target.addEventListener('session-expired', () => expirations++);
  vi.stubGlobal('window', target);
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }), { status: 401 }));
  await expect(api('/auth/me')).rejects.toMatchObject({ status: 401 });
  expect(expirations).toBe(0);
  await expect(api('/tickets')).rejects.toMatchObject({ status: 401 });
  expect(expirations).toBe(1);
});
