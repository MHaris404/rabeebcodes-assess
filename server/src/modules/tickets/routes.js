import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/errors.js';
import { requireRole } from '../auth/index.js';
import { ticketService } from './service.js';
import { uuid, listSchema, createSchema, editSchema, statusSchema, assignmentSchema, replySchema, historySchema } from './validation.js';
export function ticketRouter(db) {
  const router = Router(), service = ticketService(db);
  router.param('id', (req, res, next, id) => { parse(uuid, id); next(); });
  router.get('/', async (req, res) => res.json(await service.list(req.user, parse(listSchema, req.query))));
  router.post('/', async (req, res) => res.status(201).json({ data: await service.create(req.user, parse(createSchema, req.body), req.get('Idempotency-Key')) }));
  router.get('/:id', async (req, res) => res.json({ data: await service.detail(req.user, req.params.id) }));
  router.patch('/:id', async (req, res) => res.json({ data: await service.mutate(req.user, req.params.id, 'edit', parse(editSchema, req.body)) }));
  router.patch('/:id/assign', requireRole('Admin'), async (req, res) => res.json({ data: await service.mutate(req.user, req.params.id, 'assign', parse(assignmentSchema, req.body)) }));
  router.patch('/:id/status', requireRole('Admin', 'Agent'), async (req, res) => res.json({ data: await service.mutate(req.user, req.params.id, 'status', parse(statusSchema, req.body)) }));
  router.delete('/:id', async (req, res) => {
    const version = parse(z.coerce.number().int().positive(), req.get('If-Match')?.replaceAll('"', ''));
    await service.mutate(req.user, req.params.id, 'delete', { expectedVersion: version });
    res.status(204).end();
  });
  for (const [path, type] of [['messages', 'message'], ['activity', 'activity']]) router.get(`/:id/${path}`, async (req, res) => res.json(await service.history(req.user, req.params.id, type, parse(historySchema, req.query))));
  router.post('/:id/messages', async (req, res) => res.status(201).json({ data: await service.reply(req.user, req.params.id, parse(replySchema, req.body), req.get('Idempotency-Key')) }));
  return router;
}
