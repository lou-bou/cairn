import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  isReconcileDue,
  type Mutation,
  type Reconciliation,
  type Settings,
  type Transaction,
} from '@cairn/shared';
import { call, testApp } from './helpers.js';

let app: FastifyInstance;
beforeEach(async () => {
  app = await testApp();
  await call(
    app,
    'POST',
    '/api/transactions',
    {
      type: 'in',
      date: '2026-10-01',
      amountOriginal: 100000,
      currency: 'EUR',
      categoryId: 'income',
    },
    201,
  );
});
afterEach(async () => {
  await app.close();
});

describe('reconciliation (AC 8)', () => {
  it('records a matching count and resets the reminder', async () => {
    await call(app, 'PUT', '/api/settings', { reconcileSnoozedUntil: '2026-11-02' });
    const { data } = await call<Mutation<Reconciliation>>(
      app,
      'POST',
      '/api/reconciliations',
      {
        date: '2026-11-01',
        countedOriginal: 100000,
        currency: 'EUR',
      },
      201,
    );
    expect(data).toMatchObject({
      countedEur: 100000,
      appBalanceEur: 100000,
      differenceEur: 0,
      adjustmentTransactionId: null,
    });
    const settings = (await call<{ data: Settings }>(app, 'GET', '/api/settings')).data;
    expect(settings.reconcileSnoozedUntil).toBeNull();
    expect(settings.lastReconciledAt).not.toBeNull();
  });

  it('creates an OUT adjustment when less money was counted', async () => {
    const { data } = await call<Mutation<Reconciliation>>(
      app,
      'POST',
      '/api/reconciliations',
      {
        countedOriginal: 26125000,
        currency: 'DZD',
        adjustment: { categoryId: 'living' },
      },
      201,
    );
    // 261,250 DA at 275 = €950.00, so €50.00 is missing.
    expect(data).toMatchObject({ countedEur: 95000, differenceEur: -5000 });
    const tx = await call<{ data: Transaction }>(
      app,
      'GET',
      `/api/transactions/${data.adjustmentTransactionId}`,
    );
    expect(tx.data).toMatchObject({
      type: 'out',
      amountEur: 5000,
      isAdjustment: true,
      categoryId: 'living',
    });
    const goal = await call<{ data: { balanceEur: number } }>(app, 'GET', '/api/goal');
    expect(goal.data.balanceEur).toBe(95000);
  });

  it('creates an IN adjustment when more money was counted', async () => {
    const { data } = await call<Mutation<Reconciliation>>(
      app,
      'POST',
      '/api/reconciliations',
      {
        countedOriginal: 101000,
        currency: 'EUR',
        adjustment: { categoryId: 'other' },
      },
      201,
    );
    const tx = await call<{ data: Transaction }>(
      app,
      'GET',
      `/api/transactions/${data.adjustmentTransactionId}`,
    );
    expect(tx.data).toMatchObject({ type: 'in', amountEur: 1000, categoryId: 'other' });
  });

  it('rejects an adjustment category of the wrong direction and saves nothing', async () => {
    await call(
      app,
      'POST',
      '/api/reconciliations',
      {
        countedOriginal: 90000,
        currency: 'EUR',
        adjustment: { categoryId: 'income' },
      },
      400,
    );
    expect(
      (await call<{ data: Reconciliation[] }>(app, 'GET', '/api/reconciliations')).data,
    ).toHaveLength(0);
  });

  it('lists past counts, newest first', async () => {
    await call(
      app,
      'POST',
      '/api/reconciliations',
      { date: '2026-10-05', countedOriginal: 100000, currency: 'EUR' },
      201,
    );
    await call(
      app,
      'POST',
      '/api/reconciliations',
      { date: '2026-10-12', countedOriginal: 100000, currency: 'EUR' },
      201,
    );
    const { data } = await call<{ data: Reconciliation[] }>(app, 'GET', '/api/reconciliations');
    expect(data.map((r) => r.date)).toEqual(['2026-10-12', '2026-10-05']);
  });
});

describe('isReconcileDue', () => {
  const weekly = {
    reconcileFrequency: 'weekly' as const,
    reconcileDay: 0,
    lastReconciledAt: 'x',
    reconcileSnoozedUntil: null,
  };
  // 2026-11-01 is a Sunday.
  it('is due on and after the weekday once the last count is older', () => {
    expect(isReconcileDue(weekly, '2026-11-01', '2026-10-31')).toBe(true);
    expect(isReconcileDue(weekly, '2026-11-03', '2026-10-31')).toBe(true);
    expect(isReconcileDue(weekly, '2026-10-31', '2026-10-30')).toBe(false);
    expect(isReconcileDue(weekly, '2026-11-01', '2026-11-01')).toBe(false);
  });

  it('respects snooze and off', () => {
    expect(
      isReconcileDue(
        { ...weekly, reconcileSnoozedUntil: '2026-11-02' },
        '2026-11-01',
        '2026-10-01',
      ),
    ).toBe(false);
    expect(
      isReconcileDue(
        { ...weekly, reconcileSnoozedUntil: '2026-11-02' },
        '2026-11-02',
        '2026-10-01',
      ),
    ).toBe(true);
    expect(isReconcileDue({ ...weekly, reconcileFrequency: 'off' }, '2026-11-01', null)).toBe(
      false,
    );
  });

  it('handles monthly days past the end of the month', () => {
    const monthly = { ...weekly, reconcileFrequency: 'monthly' as const, reconcileDay: 31 };
    expect(isReconcileDue(monthly, '2026-11-30', '2026-11-01')).toBe(true); // Nov has 30 days
    expect(isReconcileDue(monthly, '2026-11-29', '2026-11-01')).toBe(false); // last due was Oct 31
    expect(isReconcileDue(monthly, '2026-11-29', '2026-10-30')).toBe(true);
  });
});
