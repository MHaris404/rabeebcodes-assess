import { z } from 'zod';
export const uuid = z.uuid();
export const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
export const statusDB = s => s === 'In Progress' ? 'InProgress' : s;
export const priority = z.enum(['Low', 'Medium', 'High', 'Urgent']);
const fields = { subject: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(10000), category: z.enum(['Technical', 'Billing', 'General', 'Other']), priority };
export const createSchema = z.object({ ...fields, priority: priority.default('Medium'), customerId: uuid.optional() }).strict();
export const editSchema = z.object({ ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])), expectedVersion: z.number().int().positive() }).strict().refine(v => Object.keys(v).length > 1, { message: 'Provide a field to update.' });
export const statusSchema = z.object({ status: z.enum(statuses), expectedVersion: z.number().int().positive() }).strict();
export const assignmentSchema = z.object({ assignedAgentId: uuid.nullable(), expectedVersion: z.number().int().positive() }).strict();
export const replySchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(), status: z.enum(statuses).optional(), priority: priority.optional(), assigneeId: z.union([uuid, z.literal('unassigned')]).optional(),
});
export const historySchema = z.object({ pageSize: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().max(256).optional() });
