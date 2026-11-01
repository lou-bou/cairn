import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { parseRate } from '@cairn/shared';
import type { Config } from './config.js';
import { openDb, type Db } from './db/index.js';
import { errorHandler } from './errors.js';
import { categoryRoutes } from './routes/categories.js';
import { goalRoutes } from './routes/goal.js';
import { healthRoutes } from './routes/health.js';
import { reconciliationRoutes } from './routes/reconciliations.js';
import { settingsRoutes } from './routes/settings.js';
import { summaryRoutes } from './routes/summary.js';
import { transactionRoutes } from './routes/transactions.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
  }
}

export async function buildApp(
  config: Config,
  opts: { logger?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  const db = openDb(config.dbPath, { defaultRateMilli: parseRate(config.defaultRate) });
  app.decorate('db', db);
  app.decorate('config', config);
  app.addHook('onClose', async () => db.close());
  app.setErrorHandler(errorHandler);

  for (const routes of [
    healthRoutes,
    categoryRoutes,
    transactionRoutes,
    goalRoutes,
    summaryRoutes,
    settingsRoutes,
    reconciliationRoutes,
  ]) {
    await app.register(routes, { prefix: '/api' });
  }

  const hasWeb = fs.existsSync(config.webDist);
  if (hasWeb) {
    await app.register(fastifyStatic, { root: config.webDist });
  }

  app.setNotFoundHandler((req, reply) => {
    // SPA fallback: unknown non-API GETs get index.html so client-side routes work on reload.
    // Paths with a file extension (missing assets) get a real 404 instead of HTML.
    const pathname = req.url.split('?')[0] ?? '';
    if (
      hasWeb &&
      req.method === 'GET' &&
      !pathname.startsWith('/api/') &&
      !/\.[a-z0-9]+$/i.test(pathname)
    ) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
