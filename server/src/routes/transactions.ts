import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { toEurCents, transactionInput, transactionQuery, type Transaction } from '@cairn/shared';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { mutate } from '../domain/mutate.js';
import { defaultRate } from '../domain/queries.js';
import { toTransaction, type TransactionRow } from '../domain/rows.js';
import { ApiError, notFound, parse } from '../errors.js';

type TxInput = z.output<typeof transactionInput>;

export function getTransaction(db: Db, id: string): Transaction {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as
    TransactionRow | undefined;
  if (!row) throw notFound('Transaction');
  return toTransaction(row);
}

function checkCategory(db: Db, input: TxInput): void {
  const cat = db.prepare('SELECT type, name FROM categories WHERE id = ?').get(input.categoryId) as
    { type: string; name: string } | undefined;
  if (!cat) throw new ApiError(400, 'Unknown category', { categoryId: 'Unknown category' });
  if (cat.type !== input.type) {
    const msg = `${cat.name} is a money ${cat.type === 'in' ? 'in' : 'out'} category`;
    throw new ApiError(400, msg, { categoryId: msg });
  }
}

/** Resolve the rate and EUR value for a write. Exported for import and reconciliation. */
export function txValues(db: Db, input: TxInput) {
  checkCategory(db, input);
  const rate = input.rate ?? defaultRate(db);
  return {
    type: input.type,
    date: input.date,
    note: input.note,
    amount_original: input.amountOriginal,
    currency: input.currency,
    rate,
    amount_eur: toEurCents(input.amountOriginal, input.currency, rate),
    category_id: input.categoryId,
    source: input.source,
    is_adjustment: input.isAdjustment ? 1 : 0,
  };
}

export function insertTransaction(
  db: Db,
  input: TxInput,
  now: string,
  id: string = randomUUID(),
): string {
  db.prepare(
    `INSERT INTO transactions (id, type, date, note, amount_original, currency, rate, amount_eur,
       category_id, source, is_adjustment, created_at, updated_at)
     VALUES (@id, @type, @date, @note, @amount_original, @currency, @rate, @amount_eur,
       @category_id, @source, @is_adjustment, @now, @now)`,
  ).run({ id, now, ...txValues(db, input) });
  return id;
}

export const transactionRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get('/transactions', async (req) => {
    const q = parse(transactionQuery, req.query);
    const where: string[] = [];
    const params: Record<string, string | number> = {};
    if (q.type) {
      where.push('type = @type');
      params.type = q.type;
    }
    if (q.categoryId) {
      where.push('category_id = @categoryId');
      params.categoryId = q.categoryId;
    }
    if (q.currency) {
      where.push('currency = @currency');
      params.currency = q.currency;
    }
    if (q.source) {
      where.push('source = @source');
      params.source = q.source;
    }
    if (q.from) {
      where.push('date >= @from');
      params.from = q.from;
    }
    if (q.to) {
      where.push('date <= @to');
      params.to = q.to;
    }
    if (q.q) {
      where.push(`note LIKE @q ESCAPE '\\'`);
      params.q = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db
      .prepare(`SELECT COUNT(*) FROM transactions ${clause}`)
      .pluck()
      .get(params) as number;
    const rows = db
      .prepare(
        `SELECT * FROM transactions ${clause} ORDER BY date DESC, created_at DESC LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: q.limit, offset: q.offset }) as TransactionRow[];
    return { data: rows.map(toTransaction), total };
  });

  app.get<{ Params: { id: string } }>('/transactions/:id', async (req) => ({
    data: getTransaction(db, req.params.id),
  }));

  app.post('/transactions', async (req, reply) => {
    const input = parse(transactionInput, req.body);
    const now = new Date().toISOString();
    const result = mutate(
      db,
      () => insertTransaction(db, input, now),
      (id) => getTransaction(db, id),
    );
    return reply.code(201).send(result);
  });

  app.put<{ Params: { id: string } }>('/transactions/:id', async (req) => {
    const input = parse(transactionInput, req.body);
    const { id } = req.params;
    return mutate(
      db,
      () => {
        getTransaction(db, id);
        db.prepare(
          `UPDATE transactions SET type = @type, date = @date, note = @note, amount_original = @amount_original,
             currency = @currency, rate = @rate, amount_eur = @amount_eur, category_id = @category_id,
             source = @source, is_adjustment = @is_adjustment, updated_at = @now
           WHERE id = @id`,
        ).run({ id, now: new Date().toISOString(), ...txValues(db, input) });
      },
      () => getTransaction(db, id),
    );
  });

  app.delete<{ Params: { id: string } }>('/transactions/:id', async (req) => {
    const { id } = req.params;
    return mutate(
      db,
      () => {
        const res = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
        if (res.changes === 0) throw notFound('Transaction');
      },
      () => ({ id }),
    );
  });
};
