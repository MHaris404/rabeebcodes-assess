import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/index.js';
import { transaction, roleLock, lockUsers } from '../../lib/database.js';
import { fail, parse } from '../../lib/errors.js';
import { userSelect } from '../../lib/serializers.js';
import { requireAdmin } from '../tickets/policy.js';
export function userRouter(db) {
  const router = Router(); router.use(requireRole('Admin'));
  router.get('/', async (req, res) => {
    const q = parse(z.object({ page: z.coerce.number().int().min(1).max(500).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().max(200).optional(), role: z.enum(['Admin', 'Agent', 'Customer']).optional() }), req.query);
    const result = await transaction(db, async tx => {
      const where = { ...(q.role ? { role: q.role } : {}), ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}) };
      const total = await tx.user.count({ where });
      const users = await tx.user.findMany({ where, select: { ...userSelect, _count: { select: { assignedTickets: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize });
      return { data: users.map(({ _count, ...u }) => ({ ...u, assignedTicketCount: _count.assignedTickets })), pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) } };
    }); res.json(result);
  });
  router.patch('/:id/role', async (req, res) => {
    const id = parse(z.uuid(), req.params.id), { role } = parse(z.object({ role: z.enum(['Admin', 'Agent', 'Customer']) }).strict(), req.body);
    const data = await transaction(db, async tx => {
      await roleLock(tx); await lockUsers(tx, [req.user.id, id]);
      requireAdmin(await tx.user.findUniqueOrThrow({ where: { id: req.user.id } }));
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) fail(404, 'NOT_FOUND', 'User not found.');
      if (user.role === 'Admin' && role !== 'Admin' && await tx.user.count({ where: { role: 'Admin' } }) <= 1) fail(409, 'LAST_ADMIN', 'Keep at least one Admin account.');
      if (user.role === 'Agent' && role !== 'Agent' && await tx.ticket.count({ where: { assignedAgentId: id } })) fail(409, 'AGENT_HAS_TICKETS', 'Reassign or unassign this Agent’s tickets first.');
      return tx.user.update({ where: { id }, data: { role }, select: userSelect });
    }); res.json({ data });
  }); return router;
}
