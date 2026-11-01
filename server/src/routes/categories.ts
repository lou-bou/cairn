import type { FastifyPluginAsync } from 'fastify';
import type { Category } from '@cairn/shared';

/** Read-only: categories are fixed (spec §2). There are deliberately no write routes. */
export const categoryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/categories', async () => {
    const data = app.db
      .prepare('SELECT id, type, name, sort_order AS sortOrder FROM categories ORDER BY sort_order')
      .all() as Category[];
    return { data };
  });
};
