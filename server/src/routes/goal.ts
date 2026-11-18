import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  archiveInput,
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
import {
  activeGoalId,
  defaultRate,
  findGoalRow,
  getGoal,
  listGoals,
  listMilestones,
  milestoneRows,
  setActiveGoal,
} from '../domain/queries.js';
import { ApiError, notFound, parse } from '../errors.js';

type MilestoneValues = z.output<typeof milestoneInput>;
type GoalValues = z.output<typeof goalInput>;

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

function milestoneGoalId(db: Db, id: string): string | undefined {
  return db.prepare('SELECT goal_id FROM milestones WHERE id = ?').pluck().get(id) as
    string | undefined;
}

function getMilestone(db: Db, id: string): Milestone {
  const goalId = milestoneGoalId(db, id);
  const m = goalId ? listMilestones(db, goalId).find((x) => x.id === id) : undefined;
  if (!m) throw notFound('Milestone');
  return m;
}

function requireGoal(db: Db, id: string) {
  const row = findGoalRow(db, id);
  if (!row) throw notFound('Goal');
  return row;
}

/** Add a milestone at the end of a goal's list. */
export function insertMilestone(
  db: Db,
  input: MilestoneValues,
  goalId: string,
  id: string = randomUUID(),
): string {
  const nextOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM milestones WHERE goal_id = ?')
    .pluck()
    .get(goalId) as number;
  db.prepare(
    `INSERT INTO milestones (id, goal_id, name, note, sort_order, cost_original, currency, rate, cost_eur)
     VALUES (@id, @goal_id, @name, @note, @sort_order, @cost_original, @currency, @rate, @cost_eur)`,
  ).run({ id, goal_id: goalId, sort_order: nextOrder, ...milestoneValues(db, input) });
  return id;
}

/** The stored columns for a goal's name and amount, checked against its milestones. */
function goalValues(db: Db, input: GoalValues, goalId: string | null) {
  if (input.mode === 'auto') {
    // A goal in auto mode is its milestones' total, so a new one has no amount until it has some.
    return { name: input.name, mode: 'auto' as const };
  }
  const rate = input.rate ?? defaultRate(db);
  const customEur = toEurCents(input.customOriginal!, input.currency!, rate);
  if (customEur <= 0) {
    throw new ApiError(400, 'The goal must be more than €0.00', {
      customOriginal: 'Must be more than €0.00',
    });
  }
  const sum = goalId ? sumMinor(milestoneRows(db, goalId).map((m) => m.cost_eur)) : 0;
  if (customEur < sum) {
    const msg = `The goal must be at least the milestone total of ${formatMoney(sum, 'EUR')}`;
    throw new ApiError(400, msg, { customOriginal: msg });
  }
  return {
    name: input.name,
    mode: 'custom' as const,
    custom_original: input.customOriginal!,
    currency: input.currency!,
    rate,
    custom_eur: customEur,
  };
}

function updateGoal(db: Db, id: string, input: GoalValues): void {
  requireGoal(db, id);
  const v = goalValues(db, input, id);
  if (v.mode === 'auto') {
    db.prepare(`UPDATE goals SET name = ?, mode = 'auto' WHERE id = ?`).run(v.name, id);
    return;
  }
  db.prepare(
    `UPDATE goals SET name = ?, mode = 'custom', custom_original = ?, currency = ?, rate = ?, custom_eur = ?
     WHERE id = ?`,
  ).run(v.name, v.custom_original, v.currency, v.rate, v.custom_eur, id);
}

export const goalRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  // ---- The active goal (what the Home and Goal screens show) ----

  app.get('/goal', async () => ({ data: getGoal(db) }));

  app.put('/goal', async (req) => {
    const input = parse(goalInput, req.body);
    return mutate(
      db,
      () => updateGoal(db, activeGoalId(db), input),
      () => getGoal(db),
    );
  });

  // ---- Every goal ----

  app.get('/goals', async () => ({ data: listGoals(db) }));

  app.post('/goals', async (req, reply) => {
    const input = parse(goalInput, req.body);
    const result = mutate(
      db,
      () => {
        const id = randomUUID();
        const v = goalValues(db, input, null);
        const order = db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM goals')
          .pluck()
          .get() as number;
        db.prepare(
          `INSERT INTO goals (id, name, mode, custom_original, currency, rate, custom_eur, sort_order)
           VALUES (@id, @name, @mode, @custom_original, @currency, @rate, @custom_eur, @order)`,
        ).run({
          id,
          order,
          custom_original: null,
          currency: null,
          rate: null,
          custom_eur: null,
          ...v,
        });
        return id;
      },
      (id) => getGoal(db, id),
    );
    return reply.code(201).send(result);
  });

  app.put<{ Params: { id: string } }>('/goals/:id', async (req) => {
    const input = parse(goalInput, req.body);
    const { id } = req.params;
    return mutate(
      db,
      () => updateGoal(db, id, input),
      () => getGoal(db, id),
    );
  });

  app.delete<{ Params: { id: string } }>('/goals/:id', async (req) => {
    const { id } = req.params;
    return mutate(
      db,
      () => {
        requireGoal(db, id);
        if (id === activeGoalId(db)) {
          throw new ApiError(400, 'Switch to another goal before deleting this one');
        }
        // Its milestones go with it (ON DELETE CASCADE).
        db.prepare('DELETE FROM goals WHERE id = ?').run(id);
      },
      () => ({ id }),
    );
  });

  /** Work toward this goal now. What the balance already covers is recorded, not celebrated. */
  app.post<{ Params: { id: string } }>('/goals/:id/activate', async (req) => {
    const { id } = req.params;
    return mutate(
      db,
      () => {
        requireGoal(db, id);
        setActiveGoal(db, id);
        db.prepare('UPDATE goals SET archived_at = NULL WHERE id = ?').run(id);
      },
      () => getGoal(db, id),
      { silent: true },
    );
  });

  app.post<{ Params: { id: string } }>('/goals/:id/archive', async (req) => {
    const { archived } = parse(archiveInput, req.body);
    const { id } = req.params;
    return mutate(
      db,
      () => {
        requireGoal(db, id);
        if (archived && id === activeGoalId(db)) {
          throw new ApiError(400, 'Switch to another goal before archiving this one');
        }
        db.prepare('UPDATE goals SET archived_at = ? WHERE id = ?').run(
          archived ? new Date().toISOString() : null,
          id,
        );
      },
      () => getGoal(db, id),
    );
  });

  // ---- Milestones ----

  /** The active goal's milestones, or another goal's with ?goalId=. */
  app.get<{ Querystring: { goalId?: string } }>('/milestones', async (req) => {
    if (req.query.goalId) requireGoal(db, req.query.goalId);
    return { data: listMilestones(db, req.query.goalId) };
  });

  /** Adds to the active goal. */
  app.post('/milestones', async (req, reply) => {
    const input = parse(milestoneInput, req.body);
    const result = mutate(
      db,
      () => insertMilestone(db, input, activeGoalId(db)),
      (id) => getMilestone(db, id),
    );
    return reply.code(201).send(result);
  });

  app.post<{ Params: { id: string } }>('/goals/:id/milestones', async (req, reply) => {
    const input = parse(milestoneInput, req.body);
    const { id } = req.params;
    const result = mutate(
      db,
      () => {
        requireGoal(db, id);
        return insertMilestone(db, input, id);
      },
      (mid) => getMilestone(db, mid),
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
      (notices) => {
        const goalId = milestoneGoalId(db, id);
        if (!goalId) throw notFound('Milestone');
        db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
        // Deleting the last milestone of a goal in auto mode would leave it with no amount: keep
        // the amount it had as a custom one instead.
        const goal = findGoalRow(db, goalId)!;
        if (goal.mode === 'auto' && milestoneRows(db, goalId).length === 0 && goal.amount_eur > 0) {
          db.prepare(
            `UPDATE goals SET mode = 'custom', custom_original = ?, currency = 'EUR', rate = ?, custom_eur = ?
             WHERE id = ?`,
          ).run(goal.amount_eur, defaultRate(db), goal.amount_eur, goalId);
          const text = `No milestones left, so the goal is now a custom amount of ${formatMoney(goal.amount_eur, 'EUR')}.`;
          notices.push(goalId === activeGoalId(db) ? text : `${goal.name}: ${text}`);
        }
      },
      () => ({ id }),
    );
  });

  /** A new order for one goal's milestones: [ids] must list every milestone of that goal once. */
  app.post('/milestones/reorder', async (req) => {
    const { ids } = parse(reorderInput, req.body);
    const goalId = milestoneGoalId(db, ids[0]!) ?? '';
    return mutate(
      db,
      () => {
        const existing = milestoneRows(db, goalId).map((m) => m.id);
        const same =
          ids.length === existing.length &&
          new Set(ids).size === ids.length &&
          ids.every((id) => existing.includes(id));
        if (!same) throw new ApiError(400, 'The new order must list every milestone exactly once');
        const stmt = db.prepare('UPDATE milestones SET sort_order = ? WHERE id = ?');
        ids.forEach((id, i) => stmt.run(i + 1, id));
      },
      () => listMilestones(db, goalId),
    );
  });

  app.post('/celebrations/seen', async (req) => {
    const input = parseSeen(req.body);
    db.transaction(() => {
      const stmt = db.prepare(
        'UPDATE milestones SET celebration_seen = 1 WHERE id = ? AND achieved_at IS NOT NULL',
      );
      for (const id of input.milestoneIds) stmt.run(id);
      if (input.goal)
        db.prepare(
          'UPDATE goals SET celebration_seen = 1 WHERE id = ? AND achieved_at IS NOT NULL',
        ).run(activeGoalId(db));
    })();
    return { data: { goal: getGoal(db), milestones: listMilestones(db) }, notices: [] };
  });
};

const parseSeen = (body: unknown) => parse(celebrationsSeenInput, body);
