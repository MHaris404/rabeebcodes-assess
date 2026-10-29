import { Router } from 'express';
import { transaction } from '../../lib/database.js';
import { ticketScope } from '../tickets/policy.js';
import { ticketDTO, ticketInclude, userSelect } from '../../lib/serializers.js';
export function dashboardRouter(db) {
  const router = Router();
  router.get('/stats', async (req, res) => {
    const data = await transaction(db, async tx => {
      const where = ticketScope(req.user);
      const groups = await tx.ticket.groupBy({ by: ['status'], where, _count: true });
      const grouped = Object.fromEntries(groups.map(g => [g.status, g._count]));
      const counts = { total: groups.reduce((a, g) => a + g._count, 0), open: grouped.Open || 0, inProgress: grouped.InProgress || 0, resolved: grouped.Resolved || 0, closed: grouped.Closed || 0 };
      const recentActivity = await tx.activity.findMany({ where: { ticket: where }, include: { actor: { select: userSelect }, ticket: { select: { id: true, subject: true, ticketNumber: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5 });
      const highPriorityTickets = await tx.ticket.findMany({ where: { ...where, priority: { in: ['High', 'Urgent'] }, status: { in: ['Open', 'InProgress'] } }, include: ticketInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5 });
      const result = { counts, byStatus: [{ status: 'Open', count: counts.open }, { status: 'In Progress', count: counts.inProgress }, { status: 'Resolved', count: counts.resolved }, { status: 'Closed', count: counts.closed }], recentActivity, highPriorityTickets: highPriorityTickets.map(ticketDTO) };
      if (req.user.role === 'Admin') {
        const agents = await tx.user.findMany({ where: { role: 'Agent' }, select: { ...userSelect, _count: { select: { assignedTickets: true } } }, orderBy: { name: 'asc' } });
        result.activeAgents = agents.length; result.agentWorkload = agents.map(({ _count, ...a }) => ({ ...a, ticketCount: _count.assignedTickets }));
      } return result;
    }); res.json({ data });
  }); return router;
}
