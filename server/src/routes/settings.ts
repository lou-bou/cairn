import type { FastifyPluginAsync } from 'fastify';
import { settingsInput } from '@cairn/shared';
import { getSettings, saveSettings } from '../domain/queries.js';
import { parse } from '../errors.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get('/settings', async () => ({ data: getSettings(db) }));

  app.put('/settings', async (req) => {
    const patch = parse(settingsInput, req.body);
    db.transaction(() => {
      const current = getSettings(db);
      const next = { ...current, ...patch };
      // Keep the day valid when only the frequency changes: weekly 0–6, monthly 1–31.
      if (next.reconcileFrequency === 'weekly' && next.reconcileDay > 6) next.reconcileDay = 0;
      if (next.reconcileFrequency === 'monthly' && next.reconcileDay < 1) next.reconcileDay = 1;
      saveSettings(db, {
        defaultRate: next.defaultRate,
        reconcileFrequency: next.reconcileFrequency,
        reconcileDay: next.reconcileDay,
        reconcileSnoozedUntil: next.reconcileSnoozedUntil,
      });
    })();
    return { data: getSettings(db), notices: [] };
  });
};
