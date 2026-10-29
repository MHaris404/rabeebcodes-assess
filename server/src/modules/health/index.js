import { Router } from 'express';
import { transaction } from '../../lib/database.js';
export function healthRouter(db, lifecycle) {
  const router = Router();
  router.get('/live', (req, res) => res.json({ data: { status: 'alive' } }));
  const ready = async (req, res) => {
    if (lifecycle.draining) return res.status(503).json({ data: { status: 'draining' } });
    try { await transaction(db, tx => tx.$queryRaw`SELECT 1`); res.json({ data: { status: 'ready' } }); }
    catch { res.status(503).json({ data: { status: 'unavailable' } }); }
  };
  router.get('/ready', ready); router.get('/', ready); return router;
}
