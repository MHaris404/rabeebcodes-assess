import { createHash } from 'node:crypto';
import { fail } from '../../lib/errors.js';
import { parse } from '../../lib/errors.js';
import { z } from 'zod';
export const activity = (tx, ticketId, actorId, action, metadata = {}) => tx.activity.create({ data: { ticketId, actorId, action, metadata } });
export async function lockTicket(tx, id) { await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id}::uuid FOR UPDATE`; }
export function checkVersion(ticket, version) { if (ticket.version !== version) fail(409, 'STALE_TICKET', 'This ticket changed while you were working. Refresh it and review your changes.'); }
export async function idempotent(tx, user, operation, key, input, create, replay) {
  parse(z.string().min(8).max(128).regex(/^[\w-]+$/), key);
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  // A transaction-scoped lock serializes retries across all API instances.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${user.id}:${operation}:${key}`}, 0))::text`;
  const where = { userId_operation_key: { userId: user.id, operation, key } };
  let record = await tx.idempotencyRecord.findUnique({ where });
  if (record?.expiresAt <= new Date()) { await tx.idempotencyRecord.delete({ where }); record = null; }
  if (record) {
    if (record.requestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'This retry key was already used for a different request.');
    return replay(record.resourceId);
  }
  const result = await create();
  await tx.idempotencyRecord.create({ data: { userId: user.id, operation, key, requestHash, resourceId: result.id, expiresAt: new Date(Date.now() + 86400000) } });
  return result;
}
export function decodeCursor(cursor) {
  if (!cursor) return undefined;
  try {
    const data = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return parse(z.object({ id: z.uuid(), createdAt: z.iso.datetime() }).strict(), data);
  } catch { fail(400, 'INVALID_CURSOR', 'The conversation cursor is invalid.'); }
}
export const encodeCursor = row => Buffer.from(JSON.stringify({ id: row.id, createdAt: row.createdAt.toISOString() })).toString('base64url');
