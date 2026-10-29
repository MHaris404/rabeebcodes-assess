import { PrismaClient } from '@prisma/client';
import { setTimeout as delay } from 'node:timers/promises';
export const db = new PrismaClient();
export async function transaction(database, work) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await database.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3000ms'");
        return work(tx);
      }, { maxWait: 3000, timeout: 7000 });
    } catch (error) {
      const confirmedAbort = error.code === 'P2034' || (error.code === 'P2010' && ['40P01', '40001'].includes(error.meta?.code));
      if (!confirmedAbort || attempt >= 2) throw error;
      await delay(20 * (attempt + 1) + Math.random() * 30);
    }
  }
}
export const roleLock = tx => tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(8172401)::text');
export async function lockUsers(tx, ids) {
  for (const id of [...new Set(ids.filter(Boolean))].sort()) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
}
