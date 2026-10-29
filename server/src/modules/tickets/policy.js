import { fail } from '../../lib/errors.js';
export const ticketScope = user => user.role === 'Admin' ? {} : user.role === 'Agent' ? { assignedAgentId: user.id } : { customerId: user.id };
export async function getAccessibleTicket(tx, user, id, include) {
  const ticket = await tx.ticket.findFirst({ where: { id, ...ticketScope(user) }, ...(include ? { include } : {}) });
  if (!ticket) fail(404, 'NOT_FOUND', 'Ticket not found.');
  return ticket;
}
export const requireAdmin = user => { if (user.role !== 'Admin') fail(403, 'FORBIDDEN', 'Only an Admin can perform this action.'); };
export function allowEdit(user, ticket) {
  if (user.role !== 'Admin' && !(user.role === 'Customer' && ticket.customerId === user.id && ticket.status === 'Open')) fail(403, 'FORBIDDEN', 'Only an Admin or the owner of an open ticket may edit or delete it.');
}
