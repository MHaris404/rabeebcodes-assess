import { createApp } from './app.js';
import { db } from './lib/database.js';
import { config } from './lib/config.js';
import pino from 'pino';
const cfg = config();
const logger = pino({ level: cfg.LOG_LEVEL });
const lifecycle = { draining: false };
const app = createApp({ db, logger, lifecycle });
const server = app.listen(cfg.PORT, () => logger.info({ port: cfg.PORT }, 'server_started'));
server.requestTimeout = 15000; server.headersTimeout = 10000;
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true; lifecycle.draining = true; logger.info({ signal }, 'server_draining');
  const deadline = setTimeout(() => { logger.error('shutdown_deadline_exceeded'); server.closeAllConnections(); process.exitCode = 1; }, 10000);
  deadline.unref();
  server.close(async () => { await db.$disconnect(); clearTimeout(deadline); logger.info('server_stopped'); });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
