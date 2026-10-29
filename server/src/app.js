import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { config } from './lib/config.js';
import { authModule, requireRole } from './modules/auth/index.js';
import { ticketRouter } from './modules/tickets/routes.js';
import { userRouter } from './modules/users/index.js';
import { dashboardRouter } from './modules/dashboard/index.js';
import { healthRouter } from './modules/health/index.js';
export function createApp({ db, logger, lifecycle = { draining: false } }) {
  const cfg = config();
  const log = logger || pino({ level: cfg.LOG_LEVEL, redact: ['password', 'passwordHash', 'cookie', 'authorization', 'body', 'description'] });
  const app = express();
  const metrics = { requests: 0, responses: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, latencyBucketsMs: { 100: 0, 300: 0, 500: 0, 1000: 0, 5000: 0, 10000: 0 }, databaseTimeouts: 0, startedAt: new Date().toISOString() };
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.id = randomUUID(); res.setHeader('X-Request-ID', req.id);
    const start = performance.now();
    res.on('finish', () => {
      const durationMs = performance.now() - start;
      metrics.requests++; metrics.responses[`${Math.floor(res.statusCode / 100)}xx`] = (metrics.responses[`${Math.floor(res.statusCode / 100)}xx`] || 0) + 1;
      for (const bound of Object.keys(metrics.latencyBucketsMs)) if (durationMs <= Number(bound)) metrics.latencyBucketsMs[bound]++;
      log.info({ requestId: req.id, method: req.method, route: req.route?.path || 'unmatched', status: res.statusCode, durationMs: Math.round(durationMs), actorId: req.user?.id }, 'request');
    });
    next();
  });
  app.use(helmet(), cors({ origin: cfg.CLIENT_ORIGIN, credentials: true }), express.json({ limit: '64kb' }), cookieParser());
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Origin') !== cfg.CLIENT_ORIGIN) return next(Object.assign(new Error('Request origin is not allowed.'), { status: 403, code: 'ORIGIN_DENIED' }));
    next();
  });
  const auth = authModule(db, cfg);
  app.use('/api/health', healthRouter(db, lifecycle));
  app.use('/api/auth', auth.router);
  app.get('/api/operations/metrics', auth.authenticate, requireRole('Admin'), (req, res) => res.json({ data: metrics }));
  app.use('/api/tickets', auth.authenticate, auth.csrf, ticketRouter(db));
  app.use('/api/users', auth.authenticate, auth.csrf, userRouter(db));
  app.use('/api/dashboard', auth.authenticate, auth.csrf, dashboardRouter(db));
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'This resource does not exist.', requestId: req.id } }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500, code = error.code || 'INTERNAL_ERROR', message = error.message;
    if (error.code === 'P2002') { status = 409; code = 'CONFLICT'; message = 'This record already exists.'; }
    const databaseFailure = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034'].includes(error.code) || error.name === 'PrismaClientInitializationError' || (error.code === 'P2010' && ['57014', '55P03', '40P01', '40001'].includes(error.meta?.code));
    if (databaseFailure) { metrics.databaseTimeouts++; status = 503; code = 'DEPENDENCY_UNAVAILABLE'; message = 'The service is temporarily unavailable. Try again shortly.'; res.setHeader('Retry-After', '3'); }
    if (status === 413) { code = 'PAYLOAD_TOO_LARGE'; message = 'The request is too large.'; }
    if (status >= 500) { log.error({ requestId: req.id, code, errorType: error.name }, 'request_failed'); if (status === 500) message = 'An unexpected error occurred. Try again or share the request ID with support.'; }
    res.status(status).json({ error: { code, message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}), requestId: req.id } });
  });
  return app;
}
