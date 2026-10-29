import { transaction, roleLock, lockUsers } from '../../lib/database.js';
import { fail } from '../../lib/errors.js';
import { ticketInclude, ticketDTO, userSelect } from '../../lib/serializers.js';
import { ticketScope, getAccessibleTicket, requireAdmin, allowEdit } from './policy.js';
import { activity, lockTicket, checkVersion, idempotent, decodeCursor, encodeCursor } from './repository.js';
import { statusDB } from './validation.js';
export function ticketService(db) {
  async function write(user, id, work, { lockRoles = false, userIds = [] } = {}) {
    return transaction(db, async tx => {
      if (lockRoles) await roleLock(tx);
      await lockUsers(tx, [user.id, ...userIds]);
      const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect });
      if (id) await lockTicket(tx, id);
      const ticket = id ? await getAccessibleTicket(tx, actor, id) : null;
      return work(tx, actor, ticket);
    });
  }
  return {
    list(user, q) {
      return transaction(db, async tx => {
        const and = [ticketScope(user)];
        if (q.status) and.push({ status: statusDB(q.status) });
        if (q.priority) and.push({ priority: q.priority });
        if (q.assigneeId) and.push({ assignedAgentId: q.assigneeId === 'unassigned' ? null : q.assigneeId });
        if (q.search) {
          const number = Number(q.search.replace(/^SD-/i, ''));
          and.push({ OR: [{ subject: { contains: q.search, mode: 'insensitive' } }, ...(Number.isSafeInteger(number) && number > 0 ? [{ ticketNumber: number }] : [])] });
        }
        const where = { AND: and };
        const [total, data] = await Promise.all([tx.ticket.count({ where }), tx.ticket.findMany({ where, include: ticketInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize })]);
        return { data: data.map(ticketDTO), pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) } };
      });
    },
    detail: (user, id) => transaction(db, async tx => ticketDTO(await getAccessibleTicket(tx, user, id, ticketInclude))),
    create(user, input, key) {
      return write(user, null, async (tx, actor) => idempotent(tx, actor, 'ticket.create', key, input, async () => {
        if (input.customerId && actor.role !== 'Admin') fail(403, 'FORBIDDEN', 'Only an Admin can choose a ticket owner.');
        if (input.customerId) {
          const owner = await tx.user.findUnique({ where: { id: input.customerId } });
          if (!owner || owner.role !== 'Customer') fail(400, 'INVALID_OWNER', 'Select an existing Customer.');
        }
        const ticket = await tx.ticket.create({ data: { ...input, customerId: input.customerId || actor.id, assignedAgentId: actor.role === 'Agent' ? actor.id : null }, include: ticketInclude });
        await activity(tx, ticket.id, actor.id, 'ticket.created');
        if (ticket.assignedAgentId) await activity(tx, ticket.id, actor.id, 'ticket.assigned', { assignedAgentId: actor.id });
        return ticketDTO(ticket);
      }, async id => ticketDTO(await getAccessibleTicket(tx, actor, id, ticketInclude))), { lockRoles: true, userIds: [input.customerId] });
    },
    mutate(user, id, kind, input) {
      return write(user, id, async (tx, actor, ticket) => {
        if (kind === 'assign') requireAdmin(actor);
        else if (kind === 'status') { if (actor.role === 'Customer') fail(403, 'FORBIDDEN', 'Customers cannot change ticket status.'); }
        else allowEdit(actor, ticket);
        checkVersion(ticket, input.expectedVersion);
        let data, action, metadata;
        if (kind === 'assign') {
          if (input.assignedAgentId) {
            const target = await tx.user.findUnique({ where: { id: input.assignedAgentId } });
            if (!target || target.role !== 'Agent') fail(400, 'INVALID_AGENT', 'Select an existing Agent.');
          }
          data = { assignedAgentId: input.assignedAgentId }; action = 'ticket.assigned'; metadata = { previousAgentId: ticket.assignedAgentId, assignedAgentId: input.assignedAgentId };
        } else if (kind === 'status') { data = { status: statusDB(input.status) }; action = 'ticket.status_changed'; metadata = { from: ticket.status, to: data.status }; }
        else if (kind === 'delete') { await tx.ticket.delete({ where: { id } }); return null; }
        else { const { expectedVersion, ...fields } = input; data = fields; action = 'ticket.updated'; metadata = { fields: Object.keys(fields) }; }
        const updated = await tx.ticket.updateMany({ where: { id, version: input.expectedVersion, ...ticketScope(actor) }, data: { ...data, version: { increment: 1 } } });
        if (!updated.count) fail(409, 'STALE_TICKET', 'This ticket changed. Refresh and try again.');
        await activity(tx, id, actor.id, action, metadata);
        return ticketDTO(await tx.ticket.findUniqueOrThrow({ where: { id }, include: ticketInclude }));
      }, { lockRoles: kind === 'assign', userIds: kind === 'assign' ? [input.assignedAgentId] : [] });
    },
    reply(user, id, input, key) {
      return write(user, id, (tx, actor) => idempotent(tx, actor, `message.create:${id}`, key, input, async () => {
        const message = await tx.message.create({ data: { ticketId: id, authorId: actor.id, body: input.body }, include: { author: { select: userSelect } } });
        await activity(tx, id, actor.id, 'message.created');
        return message;
      }, resourceId => tx.message.findUniqueOrThrow({ where: { id: resourceId }, include: { author: { select: userSelect } } })));
    },
    history(user, id, type, q) {
      return transaction(db, async tx => {
        await getAccessibleTicket(tx, user, id);
        const cursor = decodeCursor(q.cursor);
        const cursorRow = cursor ? await tx[type].findFirst({ where: { id: cursor.id, ticketId: id, createdAt: new Date(cursor.createdAt) } }) : null;
        if (cursor && !cursorRow) fail(400, 'INVALID_CURSOR', 'The conversation cursor does not belong to this ticket.');
        const rows = await tx[type].findMany({ where: { ticketId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}), take: q.pageSize + 1, include: type === 'message' ? { author: { select: userSelect } } : { actor: { select: userSelect } } });
        const hasMore = rows.length > q.pageSize; const page = rows.slice(0, q.pageSize);
        return { data: page.toReversed(), pagination: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)) : null } };
      });
    },
  };
}
