import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  celebrationsSeenInput,
  formatMoney,
  goalInput,
  milestoneInput,
  reorderInput,
  sumMinor,
  toEurCents,
  type Milestone,
} from '@cairn/shared';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { mutate } from '../domain/mutate.js';
import { defaultRate, getGoal, listMilestones, milestoneRows } from '../domain/queries.js';
import { ApiError, notFound, parse } from '../errors.js';

type MilestoneValues = z.output<typeof milestoneInput>;

function milestoneValues(db: Db, input: MilestoneValues) {
  const rate = input.rate ?? defaultRate(db);
  const costEur = toEurCents(input.costOriginal, input.currency, rate);
  if (costEur === 0) {
    const msg = 'Cost is too small: it rounds to €0.00';
    throw new ApiError(400, msg, { costOriginal: msg });
  }
  return {
    name: input.name,
    note: input.note,
    cost_original: input.costOriginal,
    currency: input.currency,
    rate,
    cost_eur: costEur,
  };
}

function getMilestone(db: Db, id: string): Milestone {
  const m = listMilestones(db).find((x) => x.id === id);
  if (!m) throw notFound('Milestone');
  return m;
}

export function insertMilestone(db: Db, input: MilestoneValues, id: string = randomUUID()): string {
  const nextOrder =
    (db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM milestones')
      .pluck()
      .get() as number) ?? 1;
  db.prepare(
    `INSERT INTO milestones (id, name, note, sort_order, cost_original, currency, rate, cost_eur)
     VALUES (@id, @name, @note, @sort_order, @cost_original, @currency, @rate, @cost_eur)`,
  ).run({ id, sort_order: nextOrder, ...milestoneValues(db, input) });
  return id;
}

export const goalRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get('/goal', async () => ({ data: getGoal(db) }));

  app.put('/goal', async (req) => {
    const input = parse(goalInput, req.body);
    return mutate(
      db,
      () => {
        const milestones = milestoneRows(db);
        const sum = sumMinor(milestones.map((m) => m.cost_eur));
        if (input.mode === 'auto') {
          if (milestones.length === 0) {
            throw new ApiError(
              400,
              'Auto mode needs at least one milestone. Add one, or set a custom amount.',
              {
                mode: 'Auto mode needs at least one milestone',
              },
            );
          }
          db.prepare(`UPDATE goal SET name = ?, mode = 'auto' WHERE id = 1`).run(input.name);
          return;
        }
        const rate = input.rate ?? defaultRate(db);
        const customEur = toEurCents(input.customOriginal!, input.currency!, rate);
        if (customEur <= 0) {
          throw new ApiError(400, 'The goal must be more than €0.00', {
            customOriginal: 'Must be more than €0.00',
          });
        }
        if (customEur < sum) {
          const msg = `The goal must be at least the milestone total of ${formatMoney(sum, 'EUR')}`;
          throw new ApiError(400, msg, { customOriginal: msg });
        }
        db.prepare(
          `UPDATE goal SET name = ?, mode = 'custom', custom_original = ?, currency = ?, rate = ?, custom_eur = ?
           WHERE id = 1`,
        ).run(input.name, input.customOriginal, input.currency, rate, customEur);
      },
      () => getGoal(db),
    );
  });

  app.get('/milestones', async () => ({ data: listMilestones(db) }));

  app.post('/milestones', async (req, reply) => {
    const input = parse(milestoneInput, req.body);
    const result = mutate(
      db,
      () => insertMilestone(db, input),
      (id) => getMilestone(db, id),
    );
    return reply.code(201).send(result);
  });

  app.put<{ Params: { id: string } }>('/milestones/:id', async (req) => {
    const input = parse(milestoneInput, req.body);
    const { id } = req.params;
    return mutate(
      db,
      () => {
        const res = db
          .prepare(
            `UPDATE milestones SET name = @name, note = @note, cost_original = @cost_original,
               currency = @currency, rate = @rate, cost_eur = @cost_eur
             WHERE id = @id`,
          )
          .run({ id, ...milestoneValues(db, input) });
        if (res.changes === 0) throw notFound('Milestone');
      },
      () => getMilestone(db, id),
    );
  });

  app.delete<{ Params: { id: string } }>('/milestones/:id', async (req) => {
    const { id } = req.params;
    return mutate(
      db,
      () => {
        const res = db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
        if (res.changes === 0) throw notFound('Milestone');
      },
      () => ({ id }),
    );
  });

  app.post('/milestones/reorder', async (req) => {
    const { ids } = parse(reorderInput, req.body);
    return mutate(
      db,
      () => {
        const existing = milestoneRows(db).map((m) => m.id);
        const same =
          ids.length === existing.length &&
          new Set(ids).size === ids.length &&
          ids.every((id) => existing.includes(id));
        if (!same) throw new ApiError(400, 'The new order must list every milestone exactly once');
        const stmt = db.prepare('UPDATE milestones SET sort_order = ? WHERE id = ?');
        ids.forEach((id, i) => stmt.run(i + 1, id));
      },
      () => listMilestones(db),
    );
  });

  app.post('/celebrations/seen', async (req) => {
    const input = parse(celebrationsSeenInput, req.body);
    db.transaction(() => {
      const stmt = db.prepare(
        'UPDATE milestones SET celebration_seen = 1 WHERE id = ? AND achieved_at IS NOT NULL',
      );
      for (const id of input.milestoneIds) stmt.run(id);
      if (input.goal)
        db.prepare(
          'UPDATE goal SET celebration_seen = 1 WHERE id = 1 AND achieved_at IS NOT NULL',
        ).run();
    })();
    return { data: { goal: getGoal(db), milestones: listMilestones(db) }, notices: [] };
  });
};
