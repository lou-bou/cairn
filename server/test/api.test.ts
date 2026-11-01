import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Goal, Milestone, Mutation, Settings, Summary, Transaction } from '@cairn/shared';
import { call, testApp } from './helpers.js';

let app: FastifyInstance;
beforeEach(async () => {
  app = await testApp();
});
afterEach(async () => {
  await app.close();
});

const tx = (overrides: Record<string, unknown> = {}) => ({
  type: 'in',
  date: '2026-11-01',
  amountOriginal: 10000,
  currency: 'EUR',
  categoryId: 'income',
  ...overrides,
});

const addTx = (overrides: Record<string, unknown> = {}) =>
  call<Mutation<Transaction>>(app, 'POST', '/api/transactions', tx(overrides), 201);
const milestones = async () =>
  (await call<{ data: Milestone[] }>(app, 'GET', '/api/milestones')).data;
const goal = async () => (await call<{ data: Goal }>(app, 'GET', '/api/goal')).data;

describe('transactions', () => {
  it('AC 1: 1,000 DZD at 275 stores €3.64 and keeps the original', async () => {
    const { data } = await addTx({ amountOriginal: 100000, currency: 'DZD' });
    expect(data).toMatchObject({
      amountOriginal: 100000,
      currency: 'DZD',
      rate: 275000,
      amountEur: 364,
    });
    expect((await goal()).balanceEur).toBe(364);
  });

  it('computes balance as IN minus OUT', async () => {
    await addTx({ amountOriginal: 50000 });
    await addTx({ type: 'out', categoryId: 'living', amountOriginal: 12345 });
    expect((await goal()).balanceEur).toBe(37655);
  });

  it('edits and deletes', async () => {
    const { data } = await addTx();
    const edited = await call<Mutation<Transaction>>(
      app,
      'PUT',
      `/api/transactions/${data.id}`,
      tx({ note: 'Salary', amountOriginal: 20000 }),
    );
    expect(edited.data).toMatchObject({ note: 'Salary', amountEur: 20000 });
    await call(app, 'DELETE', `/api/transactions/${data.id}`);
    await call(app, 'GET', `/api/transactions/${data.id}`, undefined, 404);
    expect((await goal()).balanceEur).toBe(0);
  });

  it('rejects a category of the wrong type', async () => {
    const res = await call<{ error: string; fields: Record<string, string> }>(
      app,
      'POST',
      '/api/transactions',
      tx({ categoryId: 'living' }),
      400,
    );
    expect(res.fields.categoryId).toBe('Living is a money out category');
  });

  it('rejects floats and bad input with field messages', async () => {
    const res = await call<{ fields: Record<string, string> }>(
      app,
      'POST',
      '/api/transactions',
      tx({ amountOriginal: 10.5, date: '2026-02-30' }),
      400,
    );
    expect(res.fields).toMatchObject({
      amountOriginal: 'Amount must be in minor units',
      date: 'Use a valid date (YYYY-MM-DD)',
    });
  });

  it('filters and searches notes', async () => {
    await addTx({ note: 'Freelance 50%' });
    await addTx({ note: 'Gift', categoryId: 'funding', date: '2026-10-01' });
    await addTx({ type: 'out', categoryId: 'living', note: 'Rent' });
    const get = async (qs: string) =>
      (
        await call<{ data: Transaction[]; total: number }>(app, 'GET', `/api/transactions?${qs}`)
      ).data.map((t) => t.note);
    expect(await get('type=out')).toEqual(['Rent']);
    expect(await get('q=50%25')).toEqual(['Freelance 50%']);
    expect(await get('q=%25')).toEqual(['Freelance 50%']); // % is literal, not a wildcard
    expect(await get('categoryId=funding')).toEqual(['Gift']);
    expect(await get('from=2026-11-01&type=in')).toEqual(['Freelance 50%']);
  });

  it('AC 7: changing the default rate keeps stored rates', async () => {
    const before = await addTx({ amountOriginal: 100000, currency: 'DZD' });
    await call(app, 'PUT', '/api/settings', { defaultRate: 300000 });
    const old = await call<{ data: Transaction }>(
      app,
      'GET',
      `/api/transactions/${before.data.id}`,
    );
    expect(old.data).toMatchObject({ rate: 275000, amountEur: 364 });
    const after = await addTx({ amountOriginal: 100000, currency: 'DZD' });
    expect(after.data).toMatchObject({ rate: 300000, amountEur: 333 });
  });
});

describe('categories (AC 6)', () => {
  it('lists the fixed categories', async () => {
    const { data } = await call<{ data: { id: string }[] }>(app, 'GET', '/api/categories');
    expect(data.map((c) => c.id)).toEqual([
      'income',
      'funding',
      'savings',
      'other',
      'administrative',
      'luxury',
      'living',
    ]);
  });

  it.each([
    ['POST', '/api/categories'],
    ['PUT', '/api/categories/income'],
    ['DELETE', '/api/categories/income'],
  ] as const)('has no %s route', async (method, url) => {
    await call(app, method, url, { name: 'X', type: 'in' }, 404);
  });
});

describe('milestones and achievements', () => {
  it('seeds cumulative thresholds', async () => {
    expect((await milestones()).map((m) => m.thresholdEur)).toEqual([
      136500, 380000, 490000, 1680400, 2380400,
    ]);
  });

  it('AC 2 + 3: achieve, mark seen, un-achieve, achieve again', async () => {
    await addTx({ amountOriginal: 136500 });
    let [p1] = await milestones();
    expect(p1!.achievedAt).not.toBeNull();
    expect(p1!.celebrationSeen).toBe(false);

    await call(app, 'POST', '/api/celebrations/seen', { milestoneIds: [p1!.id] });
    [p1] = await milestones();
    expect(p1!.celebrationSeen).toBe(true); // a reload sees it as seen

    const out = await addTx({ type: 'out', categoryId: 'living', amountOriginal: 1 });
    [p1] = await milestones();
    expect(p1!.achievedAt).toBeNull();

    await call(app, 'DELETE', `/api/transactions/${out.data.id}`);
    [p1] = await milestones();
    expect(p1!.achievedAt).not.toBeNull();
    expect(p1!.celebrationSeen).toBe(false); // celebrates again
  });

  it('AC 4: reordering recalculates thresholds and achievements', async () => {
    await addTx({ amountOriginal: 136500 });
    const ms = await milestones();
    const reversed = ms.map((m) => m.id).reverse();
    const res = await call<Mutation<Milestone[]>>(app, 'POST', '/api/milestones/reorder', {
      ids: reversed,
    });
    expect(res.data.map((m) => m.thresholdEur)).toEqual([
      700000, 1890400, 2000400, 2243900, 2380400,
    ]);
    expect(res.data.every((m) => m.achievedAt === null)).toBe(true);
  });

  it('rejects a reorder that does not list every milestone once', async () => {
    const ids = (await milestones()).map((m) => m.id);
    await call(app, 'POST', '/api/milestones/reorder', { ids: ids.slice(1) }, 400);
    await call(app, 'POST', '/api/milestones/reorder', { ids: [...ids.slice(1), ids[1]] }, 400);
  });

  it('adds, edits and deletes milestones, with DZD costs', async () => {
    const created = await call<Mutation<Milestone>>(
      app,
      'POST',
      '/api/milestones',
      { name: 'Laptop', costOriginal: 27500000, currency: 'DZD' },
      201,
    );
    expect(created.data).toMatchObject({ costEur: 100000, sortOrder: 6, thresholdEur: 2480400 });
    const edited = await call<Mutation<Milestone>>(
      app,
      'PUT',
      `/api/milestones/${created.data.id}`,
      { name: 'Laptop', costOriginal: 50000, currency: 'EUR' },
    );
    expect(edited.data.costEur).toBe(50000);
    await call(app, 'DELETE', `/api/milestones/${created.data.id}`);
    expect(await milestones()).toHaveLength(5);
  });

  it('the goal is achieved at its amount and un-achieves', async () => {
    const big = await addTx({ amountOriginal: 3_000_000 });
    let g = await goal();
    expect(g.achievedAt).not.toBeNull();
    expect(g.celebrationSeen).toBe(false);
    await call(app, 'POST', '/api/celebrations/seen', { goal: true });
    expect((await goal()).celebrationSeen).toBe(true);
    await call(app, 'DELETE', `/api/transactions/${big.data.id}`);
    g = await goal();
    expect(g.achievedAt).toBeNull();
  });
});

describe('goal rules (AC 5)', () => {
  it('rejects a custom goal below the milestone sum', async () => {
    const res = await call<{ error: string }>(
      app,
      'PUT',
      '/api/goal',
      { name: 'G', mode: 'custom', customOriginal: 100000, currency: 'EUR' },
      400,
    );
    expect(res.error).toBe('The goal must be at least the milestone total of €23,804.00');
  });

  it('accepts a custom goal in DZD', async () => {
    const res = await call<Mutation<Goal>>(app, 'PUT', '/api/goal', {
      name: 'Germany',
      mode: 'custom',
      customOriginal: 825_000_000,
      currency: 'DZD',
    });
    expect(res.data).toMatchObject({
      name: 'Germany',
      customEur: 3_000_000,
      amountEur: 3_000_000,
      currency: 'DZD',
    });
  });

  it('auto mode uses the milestone sum', async () => {
    const res = await call<Mutation<Goal>>(app, 'PUT', '/api/goal', { name: 'G', mode: 'auto' });
    expect(res.data.amountEur).toBe(2380400);
  });

  it('raises a custom goal when milestones exceed it, with a notice', async () => {
    const res = await call<Mutation<Milestone>>(
      app,
      'POST',
      '/api/milestones',
      { name: 'Masters', costOriginal: 1_000_000, currency: 'EUR' },
      201,
    );
    expect(res.notices).toEqual([
      'The milestones now add up to more than the goal, so the goal was raised to €33,804.00.',
    ]);
    expect((await goal()).amountEur).toBe(3_380_400);
  });

  it('switches auto to custom when the last milestone is deleted', async () => {
    await call(app, 'PUT', '/api/goal', { name: 'G', mode: 'auto' });
    const ids = (await milestones()).map((m) => m.id);
    let last: Mutation<unknown> | undefined;
    for (const id of ids)
      last = await call<Mutation<unknown>>(app, 'DELETE', `/api/milestones/${id}`);
    expect(last!.notices).toEqual([
      'No milestones left, so the goal is now a custom amount of €7,000.00.',
    ]);
    // Each delete in auto mode lowers the goal; the last one keeps the value it had just before.
    expect(await goal()).toMatchObject({ mode: 'custom', customEur: 700000, amountEur: 700000 });
  });

  it('with no milestones, any custom goal above 0 works, and auto is refused', async () => {
    for (const m of await milestones()) await call(app, 'DELETE', `/api/milestones/${m.id}`);
    await call(app, 'PUT', '/api/goal', {
      name: 'Laptop',
      mode: 'custom',
      customOriginal: 1,
      currency: 'EUR',
    });
    expect((await goal()).amountEur).toBe(1);
    const res = await call<{ error: string }>(
      app,
      'PUT',
      '/api/goal',
      { name: 'Laptop', mode: 'auto' },
      400,
    );
    expect(res.error).toMatch(/Auto mode needs at least one milestone/);
  });
});

describe('summary', () => {
  it('totals a range with categories, months and a balance series', async () => {
    await addTx({ date: '2026-09-10', amountOriginal: 100000 });
    await addTx({ date: '2026-10-05', amountOriginal: 50000, categoryId: 'funding' });
    await addTx({ date: '2026-10-20', type: 'out', categoryId: 'living', amountOriginal: 30000 });
    const { data } = await call<{ data: Summary }>(
      app,
      'GET',
      '/api/summary?from=2026-10-01&to=2026-10-31',
    );
    expect(data).toMatchObject({
      balanceEur: 120000,
      inEur: 50000,
      outEur: 30000,
      netEur: 20000,
      monthCount: 1,
    });
    expect(data.monthly).toEqual([{ month: '2026-10', inEur: 50000, outEur: 30000 }]);
    expect(data.balanceSeries).toEqual([
      { date: '2026-10-01', balanceEur: 100000 },
      { date: '2026-10-05', balanceEur: 150000 },
      { date: '2026-10-20', balanceEur: 120000 },
      { date: '2026-10-31', balanceEur: 120000 },
    ]);
    expect(data.categories).toEqual([
      { categoryId: 'funding', type: 'in', totalEur: 50000, count: 1 },
      { categoryId: 'living', type: 'out', totalEur: 30000, count: 1 },
    ]);
  });

  it('averages per month across empty months, rounding half up', async () => {
    await addTx({ date: '2026-08-01', amountOriginal: 100001 });
    const { data } = await call<{ data: Summary }>(
      app,
      'GET',
      '/api/summary?from=2026-08-01&to=2026-09-30',
    );
    expect(data.monthly.map((m) => m.month)).toEqual(['2026-08', '2026-09']);
    expect(data.avgMonthlyInEur).toBe(50001); // 50000.5 → 50001
  });
});

describe('settings', () => {
  it('reads and updates, keeping the day valid for the frequency', async () => {
    let { data } = await call<{ data: Settings }>(app, 'GET', '/api/settings');
    expect(data).toMatchObject({
      defaultRate: 275000,
      reconcileFrequency: 'weekly',
      reconcileDay: 0,
    });
    ({ data } = await call<Mutation<Settings>>(app, 'PUT', '/api/settings', {
      reconcileFrequency: 'monthly',
    }));
    expect(data).toMatchObject({ reconcileFrequency: 'monthly', reconcileDay: 1 });
    await call(app, 'PUT', '/api/settings', { reconcileFrequency: 'weekly', reconcileDay: 9 }, 400);
  });
});
