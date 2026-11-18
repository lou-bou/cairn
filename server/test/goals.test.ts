import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  FIRST_GOAL_ID,
  type ExportFile,
  type Goal,
  type GoalDetail,
  type ImportPreview,
  type ImportResult,
  type Milestone,
  type Mutation,
  type Transaction,
} from '@cairn/shared';
import { migrate } from '../src/db/index.js';
import { MIGRATIONS } from '../src/db/migrations.js';
import { call, testApp } from './helpers.js';

let app: FastifyInstance;
beforeEach(async () => {
  app = await testApp();
});
afterEach(async () => {
  await app.close();
});

const goals = async () => (await call<{ data: GoalDetail[] }>(app, 'GET', '/api/goals')).data;
const goalById = async (id: string) => (await goals()).find((g) => g.id === id)!;
const activeGoal = async () => (await call<{ data: Goal }>(app, 'GET', '/api/goal')).data;
const addGoal = (body: Record<string, unknown>) =>
  call<Mutation<Goal>>(app, 'POST', '/api/goals', body, 201);
const addMilestone = (goalId: string, name: string, euros: number) =>
  call<Mutation<Milestone>>(
    app,
    'POST',
    `/api/goals/${goalId}/milestones`,
    { name, costOriginal: euros * 100, currency: 'EUR' },
    201,
  );
const addMoney = (euros: number) =>
  call<Mutation<Transaction>>(
    app,
    'POST',
    '/api/transactions',
    {
      type: 'in',
      date: '2026-11-01',
      amountOriginal: euros * 100,
      currency: 'EUR',
      categoryId: 'income',
    },
    201,
  );

/** The car from the request: a goal in auto mode built from five milestones. */
async function carGoal() {
  const car = (await addGoal({ name: 'Car', mode: 'auto' })).data;
  for (const [name, euros] of [
    ['Car', 16000],
    ['Insurance (first year)', 2000],
    ['Registration', 150],
    ['Repair buffer', 1000],
    ['Driving test and licence', 4000],
  ] as const) {
    await addMilestone(car.id, name, euros);
  }
  return car;
}

describe('goals', () => {
  it('starts with the existing goal, active, under a fixed id', async () => {
    const list = await goals();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: FIRST_GOAL_ID, active: true, archivedAt: null });
    expect(list[0]!.milestones).toHaveLength(5);
    expect((await activeGoal()).id).toBe(FIRST_GOAL_ID);
  });

  it('adds a goal with no amount, then its milestones add up to it', async () => {
    const created = await addGoal({ name: 'Car', mode: 'auto' });
    expect(created.data).toMatchObject({ amountEur: 0, active: false, sortOrder: 2 });
    await carGoal();
    const car = (await goals()).find((g) => g.name === 'Car' && g.milestones.length === 5)!;
    expect(car.amountEur).toBe(2_315_000);
    expect(car.milestones.map((m) => m.thresholdEur)).toEqual([
      1_600_000, 1_800_000, 1_815_000, 1_915_000, 2_315_000,
    ]);
    expect(car.milestones.every((m) => m.goalId === car.id)).toBe(true);
    // The active goal and its milestones are untouched.
    expect((await activeGoal()).id).toBe(FIRST_GOAL_ID);
    expect((await call<{ data: Milestone[] }>(app, 'GET', '/api/milestones')).data).toHaveLength(5);
  });

  it('switching goals moves the Home and Goal screens, without celebrating old money', async () => {
    const car = await carGoal();
    await addMoney(17000);
    const res = await call<Mutation<Goal>>(app, 'POST', `/api/goals/${car.id}/activate`);
    expect(res.data).toMatchObject({ id: car.id, active: true, amountEur: 2_315_000 });

    // The old endpoints now mean the car.
    expect((await activeGoal()).name).toBe('Car');
    const ms = (await call<{ data: Milestone[] }>(app, 'GET', '/api/milestones')).data;
    expect(ms.map((m) => m.name)[0]).toBe('Car');
    // €17,000 already covers the car itself: recorded, not celebrated.
    expect(ms[0]).toMatchObject({ celebrationSeen: true });
    expect(ms[0]!.achievedAt).not.toBeNull();
    expect(ms[1]!.achievedAt).toBeNull();

    // Money saved after the switch celebrates as usual.
    await addMoney(1000);
    const after = (await call<{ data: Milestone[] }>(app, 'GET', '/api/milestones')).data;
    expect(after[1]).toMatchObject({ celebrationSeen: false });
    expect(after[1]!.achievedAt).not.toBeNull();

    // A milestone added through the old endpoint joins the active goal.
    await call(
      app,
      'POST',
      '/api/milestones',
      { name: 'Winter tyres', costOriginal: 60000, currency: 'EUR' },
      201,
    );
    expect((await goalById(car.id)).milestones).toHaveLength(6);
    expect((await goalById(FIRST_GOAL_ID)).active).toBe(false);
  });

  it('only the active goal tracks achievements', async () => {
    const car = await carGoal();
    await addMoney(30000);
    const other = await goalById(car.id);
    expect(other.milestones.every((m) => m.achievedAt === null)).toBe(true);
    expect(other.achievedAt).toBeNull();
  });

  it('edits any goal, and a custom amount must cover its own milestones', async () => {
    const car = await carGoal();
    const bad = await call<{ error: string }>(
      app,
      'PUT',
      `/api/goals/${car.id}`,
      { name: 'Car', mode: 'custom', customOriginal: 2_000_000, currency: 'EUR' },
      400,
    );
    expect(bad.error).toBe('The goal must be at least the milestone total of €23,150.00');
    const ok = await call<Mutation<Goal>>(app, 'PUT', `/api/goals/${car.id}`, {
      name: 'Used car',
      mode: 'custom',
      customOriginal: 2_500_000,
      currency: 'EUR',
    });
    expect(ok.data).toMatchObject({ name: 'Used car', amountEur: 2_500_000, active: false });
  });

  it("raising another goal's custom amount says which goal", async () => {
    const trip = (
      await addGoal({ name: 'Trip', mode: 'custom', customOriginal: 50000, currency: 'EUR' })
    ).data;
    const res = await addMilestone(trip.id, 'Flights', 700);
    expect(res.notices).toEqual([
      'Trip: The milestones now add up to more than the goal, so the goal was raised to €700.00.',
    ]);
  });

  it('never deletes or archives the active goal; deleting another takes its milestones', async () => {
    const car = await carGoal();
    await call(app, 'DELETE', `/api/goals/${FIRST_GOAL_ID}`, undefined, 400);
    await call(app, 'POST', `/api/goals/${FIRST_GOAL_ID}/archive`, { archived: true }, 400);

    const archived = await call<Mutation<Goal>>(app, 'POST', `/api/goals/${car.id}/archive`, {
      archived: true,
    });
    expect(archived.data.archivedAt).not.toBeNull();
    // Making an archived goal active brings it back.
    await call(app, 'POST', `/api/goals/${car.id}/activate`);
    expect((await goalById(car.id)).archivedAt).toBeNull();

    await call(app, 'POST', `/api/goals/${FIRST_GOAL_ID}/activate`);
    await call(app, 'DELETE', `/api/goals/${car.id}`);
    expect(await goals()).toHaveLength(1);
    await call(app, 'GET', `/api/milestones?goalId=${car.id}`, undefined, 404);
    const count = (await call<{ data: GoalDetail[] }>(app, 'GET', '/api/goals')).data.flatMap(
      (g) => g.milestones,
    ).length;
    expect(count).toBe(5);
  });

  it('reorders one goal at a time', async () => {
    const car = await carGoal();
    const ids = (await goalById(car.id)).milestones.map((m) => m.id);
    const res = await call<Mutation<Milestone[]>>(app, 'POST', '/api/milestones/reorder', {
      ids: [...ids].reverse(),
    });
    expect(res.data[0]!.name).toBe('Driving test and licence');
    expect(res.data.at(-1)!.thresholdEur).toBe(2_315_000);
    // Mixing goals is refused.
    const first = (await goalById(FIRST_GOAL_ID)).milestones.map((m) => m.id);
    await call(app, 'POST', '/api/milestones/reorder', { ids: [...ids, first[0]] }, 400);
  });

  it('deleting the last milestone of an auto goal keeps its amount as a custom one', async () => {
    const car = (await addGoal({ name: 'Bike', mode: 'auto' })).data;
    const m = (await addMilestone(car.id, 'Bike', 800)).data;
    const res = await call<Mutation<unknown>>(app, 'DELETE', `/api/milestones/${m.id}`);
    expect(res.notices).toEqual([
      'Bike: No milestones left, so the goal is now a custom amount of €800.00.',
    ]);
    expect(await goalById(car.id)).toMatchObject({ mode: 'custom', amountEur: 80000 });
  });
});

describe('export and import with several goals', () => {
  let b: FastifyInstance;
  beforeEach(async () => {
    b = await testApp();
  });
  afterEach(async () => {
    await b.close();
  });
  const exportOf = (x: FastifyInstance) => call<ExportFile>(x, 'GET', '/api/export');
  // The two test installs were seeded a few ms apart, and import ignores when you last counted.
  const strip = (f: ExportFile) => ({
    ...f,
    exportedAt: '',
    settings: { ...f.settings, lastReconciledAt: null },
  });

  it('round-trips every goal, its milestones and which one is active', async () => {
    const car = await carGoal();
    const dropped = (await addGoal({ name: 'Boat', mode: 'auto' })).data;
    await call(app, 'POST', `/api/goals/${dropped.id}/archive`, { archived: true });
    await call(app, 'POST', `/api/goals/${car.id}/activate`);
    const file = await exportOf(app);
    expect(file).toMatchObject({ schemaVersion: 2, activeGoalId: car.id });
    expect(file.goals).toHaveLength(3);

    await call(b, 'POST', '/api/import', {
      file,
      resolution: { conflicts: 'replace', goal: 'replace', settings: 'replace' },
    });
    expect(strip(await exportOf(b))).toEqual(strip(file));
    expect((await call<{ data: Goal }>(b, 'GET', '/api/goal')).data.name).toBe('Car');
  });

  it('keeps this install’s active goal unless the file’s is asked for', async () => {
    const car = await carGoal();
    await call(app, 'POST', `/api/goals/${car.id}/activate`);
    const file = await exportOf(app);
    const preview = await call<{ data: ImportPreview }>(b, 'POST', '/api/import?dryRun=1', {
      file,
    });
    expect(preview.data.goalDiffers).toBe(true);
    expect(preview.data.counts.goals).toEqual({ new: 1, identical: 1, conflicts: 0 });
    await call(b, 'POST', '/api/import', { file });
    expect((await call<{ data: Goal }>(b, 'GET', '/api/goal')).data.id).toBe(FIRST_GOAL_ID);
  });

  it('a goal kept as a copy takes its milestones with it', async () => {
    const car = await carGoal();
    const file = await exportOf(app);
    // The same goal changed on the other install.
    await call(b, 'POST', '/api/import', { file });
    await call(b, 'PUT', `/api/goals/${car.id}`, { name: 'Van', mode: 'auto' });
    const preview = await call<{ data: ImportPreview }>(b, 'POST', '/api/import?dryRun=1', {
      file,
    });
    expect(preview.data.conflicts.map((c) => c.entity)).toEqual(['goals']);
    const res = await call<Mutation<ImportResult>>(b, 'POST', '/api/import', {
      file: { ...file, milestones: file.milestones.map((m) => ({ ...m, id: `${m.id}-x` })) },
      resolution: { conflicts: 'keepBoth' },
    });
    expect(res.data.keptBoth).toBe(1);
    const list = (await call<{ data: GoalDetail[] }>(b, 'GET', '/api/goals')).data;
    const copy = list.find((g) => g.name === 'Car (1)')!;
    expect(copy.milestones).toHaveLength(5);
    expect(list.find((g) => g.name === 'Van')!.milestones).toHaveLength(5);
  });

  it('imports a version 1 export into the first goal', async () => {
    const v2 = await exportOf(app);
    const goal = v2.goals[0]!;
    const v1 = {
      app: 'cairn',
      schemaVersion: 1,
      exportedAt: v2.exportedAt,
      settings: v2.settings,
      goal: {
        name: 'Germany',
        mode: goal.mode,
        customOriginal: goal.customOriginal,
        currency: goal.currency,
        rate: goal.rate,
        customEur: goal.customEur,
        achievedAt: goal.achievedAt,
        celebrationSeen: goal.celebrationSeen,
      },
      milestones: v2.milestones.map(({ goalId, ...m }) => (void goalId, m)),
      transactions: v2.transactions,
      reconciliations: v2.reconciliations,
    };
    const preview = await call<{ data: ImportPreview }>(b, 'POST', '/api/import?dryRun=1', {
      file: v1,
    });
    expect(preview.data.counts.goals).toEqual({ new: 0, identical: 0, conflicts: 1 });
    expect(preview.data.counts.milestones).toEqual({ new: 0, identical: 5, conflicts: 0 });
    expect(preview.data.goalDiffers).toBe(false);
    await call(b, 'POST', '/api/import', { file: v1, resolution: { conflicts: 'replace' } });
    expect((await call<{ data: Goal }>(b, 'GET', '/api/goal')).data.name).toBe('Germany');
  });
});

describe('migration 5', () => {
  it('turns the single goal into the first, active goal, with its milestones', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const ctx = { defaultRateMilli: 275000, now: '2026-11-01T00:00:00.000Z' };
    // An install from before goals could be added.
    db.exec(
      'CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    for (const m of MIGRATIONS.filter((x) => x.version <= 4)) {
      m.up(db, ctx);
      db.prepare('INSERT INTO schema_version VALUES (?, ?, ?)').run(m.version, m.name, ctx.now);
    }
    db.prepare(
      "UPDATE goal SET name = 'Mine', achieved_at = '2026-10-01', celebration_seen = 0 WHERE id = 1",
    ).run();

    expect(migrate(db, ctx)).toEqual([5]);
    expect(db.prepare('SELECT id, name, achieved_at, celebration_seen FROM goals').all()).toEqual([
      { id: FIRST_GOAL_ID, name: 'Mine', achieved_at: '2026-10-01', celebration_seen: 0 },
    ]);
    expect(db.prepare('SELECT DISTINCT goal_id FROM milestones').pluck().all()).toEqual([
      FIRST_GOAL_ID,
    ]);
    expect(db.prepare('SELECT COUNT(*) FROM milestones').pluck().get()).toBe(5);
    expect(
      db.prepare("SELECT value FROM settings WHERE key = 'active_goal_id'").pluck().get(),
    ).toBe(FIRST_GOAL_ID);
    db.close();
  });
});
