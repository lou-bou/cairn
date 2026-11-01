import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  DEFAULT_SOURCE,
  reconciliationInput,
  todayIso,
  toEurCents,
  type Reconciliation,
} from '@cairn/shared';
import type { Db } from '../db/index.js';
import { mutate } from '../domain/mutate.js';
import { balanceEur, defaultRate, saveSettings } from '../domain/queries.js';
import { toReconciliation, type ReconciliationRow } from '../domain/rows.js';
import { notFound, parse } from '../errors.js';
import { insertTransaction } from './transactions.js';

function getReconciliation(db: Db, id: string): Reconciliation {
  const row = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(id) as
    ReconciliationRow | undefined;
  if (!row) throw notFound('Reconciliation');
  return toReconciliation(row);
}

export const reconciliationRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get('/reconciliations', async () => {
    const rows = db
      .prepare('SELECT * FROM reconciliations ORDER BY date DESC, created_at DESC')
      .all() as ReconciliationRow[];
    return { data: rows.map(toReconciliation) };
  });

  /**
   * Record a count (spec §9). When the count differs from the app balance and an adjustment
   * category is given, an IN or OUT adjustment for the difference is created, so the app
   * balance matches the money actually counted.
   */
  app.post('/reconciliations', async (req, reply) => {
    const input = parse(reconciliationInput, req.body);
    const now = new Date().toISOString();
    const date = input.date ?? todayIso();
    const result = mutate(
      db,
      () => {
        const rate = input.rate ?? defaultRate(db);
        const countedEur = toEurCents(input.countedOriginal, input.currency, rate);
        const appBalance = balanceEur(db);
        const difference = countedEur - appBalance;

        let adjustmentId: string | null = null;
        if (input.adjustment && difference !== 0) {
          adjustmentId = insertTransaction(
            db,
            {
              type: difference > 0 ? 'in' : 'out',
              date,
              note: 'Reconciliation adjustment',
              amountOriginal: Math.abs(difference),
              currency: 'EUR',
              rate: defaultRate(db),
              categoryId: input.adjustment.categoryId,
              source: DEFAULT_SOURCE,
              isAdjustment: true,
            },
            now,
          );
        }

        const id = randomUUID();
        db.prepare(
          `INSERT INTO reconciliations (id, date, counted_original, currency, rate, counted_eur, app_balance_eur,
             difference_eur, adjustment_transaction_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          date,
          input.countedOriginal,
          input.currency,
          rate,
          countedEur,
          appBalance,
          difference,
          adjustmentId,
          now,
        );
        saveSettings(db, { lastReconciledAt: now, reconcileSnoozedUntil: null });
        return id;
      },
      (id) => getReconciliation(db, id),
    );
    return reply.code(201).send(result);
  });
};
