export const userSelect = { id: true, name: true, email: true, role: true, createdAt: true };
export const ticketInclude = { customer: { select: userSelect }, assignedAgent: { select: userSelect } };
export function ticketDTO(ticket) {
  return { ...ticket, ticketNumber: `SD-${String(ticket.ticketNumber).padStart(5, '0')}`, status: ticket.status === 'InProgress' ? 'In Progress' : ticket.status };
}
