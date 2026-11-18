import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import {
  EXPORT_SCHEMA_VERSION,
  exportFile,
  formatAmountInput,
  formatMoney,
  formatRate,
  importInput,
  isIsoDate,
  sourceName,
  toEurCents,
  type ConflictChoice,
  type ExportFile,
  type ImportConflict,
  type ImportEntity,
  type ImportPreview,
  type ImportResult,
} from '@cairn/shared';
import type { Db } from '../db/index.js';
import { mutate } from '../domain/mutate.js';
import {
  activeGoalId,
  allMilestoneRows,
  getSettings,
  goalRows,
  saveSettings,
  setActiveGoal,
} from '../domain/queries.js';
import {
  toMilestone,
  toReconciliation,
  toTransaction,
  type ReconciliationRow,
  type TransactionRow,
} from '../domain/rows.js';
import { ApiError, parse } from '../errors.js';

export function exportData(db: Db): ExportFile {
  return {
    app: 'cairn',
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: getSettings(db),
    activeGoalId: activeGoalId(db),
    // amountEur is derived from the milestones or the custom amount, so it is not in the file.
    goals: goalRows(db).map((g) => ({
      id: g.id,
      name: g.name,
      mode: g.mode,
      customOriginal: g.custom_original,
      currency: g.currency,
      rate: g.rate,
      customEur: g.custom_eur,
      sortOrder: g.sort_order,
      archivedAt: g.archived_at,
      achievedAt: g.achieved_at,
      celebrationSeen: g.celebration_seen === 1,
    })),
    // thresholdEur is derived from the order, so it is not part of the file.
    milestones: allMilestoneRows(db).map((r) => {
      const { thresholdEur, ...rest } = toMilestone(r, 0);
      void thresholdEur;
      return rest;
    }),
    transactions: (
      db
        .prepare('SELECT * FROM transactions ORDER BY date, created_at, id')
        .all() as TransactionRow[]
    ).map(toTransaction),
    reconciliations: (
      db
        .prepare('SELECT * FROM reconciliations ORDER BY date, created_at, id')
        .all() as ReconciliationRow[]
    ).map(toReconciliation),
  };
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function transactionsCsv(db: Db): string {
  const names = new Map(
    (db.prepare('SELECT id, name FROM categories').all() as { id: string; name: string }[]).map(
      (c) => [c.id, c.name],
    ),
  );
  const header = [
    'id',
    'date',
    'type',
    'category',
    'amount',
    'currency',
    'rate_dzd_per_eur',
    'amount_eur',
    'source',
    'note',
    'adjustment',
  ];
  const rows = exportData(db).transactions.map((t) => [
    t.id,
    t.date,
    t.type,
    names.get(t.categoryId) ?? t.categoryId,
    formatAmountInput(t.amountOriginal, t.currency),
    t.currency,
    formatRate(t.rate),
    formatAmountInput(t.amountEur, 'EUR'),
    sourceName(t.source),
    t.note,
    t.isAdjustment ? 'yes' : 'no',
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---- Merge import ----

type Gl = ExportFile['goals'][number];
type Tx = ExportFile['transactions'][number];
type Ms = ExportFile['milestones'][number];
type Rec = ExportFile['reconciliations'][number];

const txKey = (t: Tx) =>
  JSON.stringify([
    t.type,
    t.date,
    t.note,
    t.amountOriginal,
    t.currency,
    t.rate,
    t.categoryId,
    t.source,
    t.isAdjustment,
  ]);
const glKey = (g: Gl) =>
  JSON.stringify([g.name, g.mode, g.customOriginal, g.currency, g.rate, g.archivedAt !== null]);
const msKey = (m: Ms) =>
  JSON.stringify([m.goalId, m.name, m.note, m.costOriginal, m.currency, m.rate]);
const recKey = (r: Rec) =>
  JSON.stringify([r.date, r.countedOriginal, r.currency, r.rate, r.appBalanceEur, r.differenceEur]);

const describeTx = (t: Tx) =>
  `${t.note || t.categoryId} · ${t.date} · ${t.type === 'in' ? '+' : '−'}${formatMoney(t.amountOriginal, t.currency)}`;
const describeGl = (g: Gl) =>
  `${g.name} · ${
    g.mode === 'custom' && g.customOriginal && g.currency
      ? formatMoney(g.customOriginal, g.currency)
      : 'sum of milestones'
  }`;
const describeMs = (m: Ms) => `${m.name} · ${formatMoney(m.costOriginal, m.currency)}`;
const describeRec = (r: Rec) => `${r.date} · counted ${formatMoney(r.countedOriginal, r.currency)}`;

interface Plan<T> {
  fresh: T[];
  identical: T[];
  conflicts: { existing: T; incoming: T }[];
}

function classify<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  key: (x: T) => string,
): Plan<T> {
  const byId = new Map(existing.map((x) => [x.id, x]));
  const plan: Plan<T> = { fresh: [], identical: [], conflicts: [] };
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur) plan.fresh.push(inc);
    else if (key(cur) === key(inc)) plan.identical.push(inc);
    else plan.conflicts.push({ existing: cur, incoming: inc });
  }
  return plan;
}

function validateFile(db: Db, raw: unknown): ExportFile {
  const file = parse(exportFile, raw);
  const cats = new Map(
    (db.prepare('SELECT id, type FROM categories').all() as { id: string; type: string }[]).map(
      (c) => [c.id, c.type],
    ),
  );
  for (const t of file.transactions) {
    if (cats.get(t.categoryId) !== t.type) {
      throw new ApiError(
        400,
        `Entry ${t.id} has an unknown or mismatched category "${t.categoryId}"`,
      );
    }
    if (!isIsoDate(t.date))
      throw new ApiError(400, `Entry ${t.id} has an invalid date "${t.date}"`);
  }
  return file;
}

function analyze(db: Db, file: ExportFile) {
  const current = exportData(db);
  const plans = {
    goals: classify(current.goals, file.goals, glKey),
    transactions: classify(current.transactions, file.transactions, txKey),
    milestones: classify(current.milestones, file.milestones, msKey),
    reconciliations: classify(current.reconciliations, file.reconciliations, recKey),
  };
  const describe = {
    goals: describeGl,
    transactions: describeTx,
    milestones: describeMs,
    reconciliations: describeRec,
  } as const;
  const conflicts: ImportConflict[] = (Object.keys(plans) as ImportEntity[]).flatMap((entity) =>
    (plans[entity].conflicts as { existing: never; incoming: never }[]).map((c) => ({
      entity,
      id: (c.incoming as { id: string }).id,
      existing: describe[entity](c.existing),
      incoming: describe[entity](c.incoming),
    })),
  );
  const count = (p: Plan<unknown>) => ({
    new: p.fresh.length,
    identical: p.identical.length,
    conflicts: p.conflicts.length,
  });
  const preview: ImportPreview = {
    counts: {
      goals: count(plans.goals),
      transactions: count(plans.transactions),
      milestones: count(plans.milestones),
      reconciliations: count(plans.reconciliations),
    },
    conflicts,
    goalDiffers: current.activeGoalId !== file.activeGoalId,
    settingsDiffer:
      JSON.stringify({ ...current.settings, lastReconciledAt: null }) !==
      JSON.stringify({ ...file.settings, lastReconciledAt: null }),
    exportedAt: file.exportedAt,
  };
  return { plans, preview, current };
}

/** "Car" → "Car (1)", or the next free number, like a file manager does for copies. */
function copyName(name: string, taken: Set<string>): string {
  const base = name.replace(/ \(\d+\)$/, '');
  for (let n = 1; ; n++) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, 80 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

function backupBeforeImport(dbPath: string, db: Db): string | null {
  if (dbPath === ':memory:') return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = path.join(path.dirname(dbPath), `pre-import-${stamp}.db`);
  if (fs.existsSync(file)) fs.rmSync(file);
  db.prepare('VACUUM INTO ?').run(file);
  return path.basename(file);
}

export const dataRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get<{ Querystring: { format?: string } }>('/export', async (req, reply) => {
    const day = new Date().toISOString().slice(0, 10);
    if (req.query.format === 'csv') {
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="cairn-transactions-${day}.csv"`)
        .send(transactionsCsv(db));
    }
    return reply
      .header('Content-Disposition', `attachment; filename="cairn-export-${day}.json"`)
      .send(exportData(db));
  });

  app.post<{ Querystring: { dryRun?: string } }>(
    '/import',
    { bodyLimit: 32 * 1024 * 1024 },
    async (req) => {
      const input = parse(importInput, req.body);
      const file = validateFile(db, input.file);
      const { plans, preview } = analyze(db, file);
      if (req.query.dryRun === '1' || req.query.dryRun === 'true') return { data: preview };

      const res = input.resolution;
      const choice = (id: string): ConflictChoice => res.perRecord[id] ?? res.conflicts;
      const backupFile = backupBeforeImport(app.config.dbPath, db);

      return mutate(
        db,
        () => {
          const result: ImportResult = {
            added: 0,
            replaced: 0,
            keptBoth: 0,
            skipped: 0,
            goalReplaced: false,
            settingsReplaced: false,
            backupFile,
          };

          if (res.settings === 'replace' && preview.settingsDiffer) {
            saveSettings(db, file.settings);
            result.settingsReplaced = true;
          }

          // Goals first, so every milestone has its goal. A goal kept as a copy gets a new id,
          // and its milestones follow it there.
          const goalIdMap = new Map<string, string>();
          const goalNames = new Set(goalRows(db).map((g) => g.name));
          let nextGoalOrder = db
            .prepare('SELECT COALESCE(MAX(sort_order), 0) FROM goals')
            .pluck()
            .get() as number;
          const customEur = (g: Gl) =>
            g.mode === 'custom' && g.customOriginal && g.currency && g.rate
              ? toEurCents(g.customOriginal, g.currency, g.rate)
              : null;
          const goalParams = (g: Gl, overrides: Partial<Gl> = {}) => {
            const merged = { ...g, ...overrides };
            return {
              ...merged,
              customEur: customEur(merged),
              seen: merged.celebrationSeen ? 1 : 0,
            };
          };
          const insertGoal = db.prepare(
            `INSERT INTO goals (id, name, mode, custom_original, currency, rate, custom_eur, sort_order, archived_at,
             achieved_at, celebration_seen)
           VALUES (@id, @name, @mode, @customOriginal, @currency, @rate, @customEur, @sortOrder, @archivedAt,
             @achievedAt, @seen)`,
          );
          for (const g of [...plans.goals.fresh].sort((a, b) => a.sortOrder - b.sortOrder)) {
            insertGoal.run(goalParams(g, { sortOrder: ++nextGoalOrder }));
            goalNames.add(g.name);
            result.added++;
          }
          for (const { incoming: g } of plans.goals.conflicts) {
            const c = choice(g.id);
            if (c === 'replace') {
              db.prepare(
                `UPDATE goals SET name = @name, mode = @mode, custom_original = @customOriginal, currency = @currency,
                 rate = @rate, custom_eur = @customEur, archived_at = @archivedAt, achieved_at = @achievedAt,
                 celebration_seen = @seen
                 WHERE id = @id`,
              ).run(goalParams(g));
              result.replaced++;
            } else if (c === 'keepBoth') {
              const id = randomUUID();
              const name = copyName(g.name, goalNames);
              goalNames.add(name);
              goalIdMap.set(g.id, id);
              insertGoal.run(
                goalParams(g, { id, name, sortOrder: ++nextGoalOrder, achievedAt: null }),
              );
              result.keptBoth++;
            } else result.skipped++;
          }
          const goalOf = (m: Ms) => goalIdMap.get(m.goalId) ?? m.goalId;

          // Transactions
          const insertTx = db.prepare(
            `INSERT INTO transactions (id, type, date, note, amount_original, currency, rate, amount_eur, category_id,
             source, is_adjustment, created_at, updated_at)
           VALUES (@id, @type, @date, @note, @amountOriginal, @currency, @rate, @amountEur, @categoryId,
             @source, @isAdjustment, @createdAt, @updatedAt)`,
          );
          const updateTx = db.prepare(
            `UPDATE transactions SET type = @type, date = @date, note = @note, amount_original = @amountOriginal,
             currency = @currency, rate = @rate, amount_eur = @amountEur, category_id = @categoryId,
             source = @source, is_adjustment = @isAdjustment, created_at = @createdAt, updated_at = @updatedAt
           WHERE id = @id`,
          );
          const txParams = (t: Tx, id = t.id) => ({
            ...t,
            id,
            amountEur: toEurCents(t.amountOriginal, t.currency, t.rate),
            isAdjustment: t.isAdjustment ? 1 : 0,
          });
          for (const t of plans.transactions.fresh) {
            insertTx.run(txParams(t));
            result.added++;
          }

          // Milestones: new ones go after their goal's existing ones, in the file's order.
          const lastOrder = db.prepare(
            'SELECT COALESCE(MAX(sort_order), 0) FROM milestones WHERE goal_id = ?',
          );
          const nextOrder = (goalId: string) => (lastOrder.pluck().get(goalId) as number) + 1;
          const names = new Set(
            db.prepare('SELECT name FROM milestones').pluck().all() as string[],
          );
          const insertMs = db.prepare(
            `INSERT INTO milestones (id, goal_id, name, note, sort_order, cost_original, currency, rate, cost_eur,
             achieved_at, celebration_seen)
           VALUES (@id, @goalId, @name, @note, @sortOrder, @costOriginal, @currency, @rate, @costEur, @achievedAt,
             @seen)`,
          );
          const msParams = (m: Ms, overrides: Partial<Ms> = {}) => {
            const merged = { ...m, ...overrides };
            return {
              ...merged,
              goalId: goalOf(merged),
              costEur: toEurCents(merged.costOriginal, merged.currency, merged.rate),
              seen: merged.celebrationSeen ? 1 : 0,
            };
          };
          for (const m of [...plans.milestones.fresh].sort((a, b) => a.sortOrder - b.sortOrder)) {
            insertMs.run(msParams(m, { sortOrder: nextOrder(goalOf(m)) }));
            names.add(m.name);
            result.added++;
          }

          // Conflicts, per the user's choice.
          for (const { incoming: t } of plans.transactions.conflicts) {
            const c = choice(t.id);
            if (c === 'replace') {
              updateTx.run(txParams(t));
              result.replaced++;
            } else if (c === 'keepBoth') {
              insertTx.run(txParams(t, randomUUID()));
              result.keptBoth++;
            } else result.skipped++;
          }
          for (const { incoming: m } of plans.milestones.conflicts) {
            const c = choice(m.id);
            if (c === 'replace') {
              const params = msParams(m);
              const moved =
                db.prepare('SELECT goal_id FROM milestones WHERE id = ?').pluck().get(m.id) !==
                params.goalId;
              db.prepare(
                `UPDATE milestones SET goal_id = @goalId, name = @name, note = @note, cost_original = @costOriginal,
                 currency = @currency, rate = @rate, cost_eur = @costEur,
                 sort_order = CASE WHEN @moved = 1 THEN @nextOrder ELSE sort_order END
                 WHERE id = @id`,
              ).run({ ...params, moved: moved ? 1 : 0, nextOrder: nextOrder(params.goalId) });
              result.replaced++;
            } else if (c === 'keepBoth') {
              const name = copyName(m.name, names);
              names.add(name);
              insertMs.run(
                msParams(m, {
                  id: randomUUID(),
                  name,
                  sortOrder: nextOrder(goalOf(m)),
                  achievedAt: null,
                }),
              );
              result.keptBoth++;
            } else result.skipped++;
          }

          // Reconciliations, after transactions so adjustment links can resolve.
          const txExists = db.prepare('SELECT 1 FROM transactions WHERE id = ?').pluck();
          const insertRec = db.prepare(
            `INSERT INTO reconciliations (id, date, counted_original, currency, rate, counted_eur, app_balance_eur,
             difference_eur, adjustment_transaction_id, created_at)
           VALUES (@id, @date, @countedOriginal, @currency, @rate, @countedEur, @appBalanceEur, @differenceEur,
             @adj, @createdAt)`,
          );
          const recParams = (r: Rec, id = r.id) => ({
            ...r,
            id,
            adj:
              r.adjustmentTransactionId && txExists.get(r.adjustmentTransactionId)
                ? r.adjustmentTransactionId
                : null,
          });
          for (const r of plans.reconciliations.fresh) {
            insertRec.run(recParams(r));
            result.added++;
          }
          for (const { incoming: r } of plans.reconciliations.conflicts) {
            const c = choice(r.id);
            if (c === 'replace') {
              db.prepare('DELETE FROM reconciliations WHERE id = ?').run(r.id);
              insertRec.run(recParams(r));
              result.replaced++;
            } else if (c === 'keepBoth') {
              insertRec.run(recParams(r, randomUUID()));
              result.keptBoth++;
            } else result.skipped++;
          }

          // Which goal is active: this install's unless the file's is asked for.
          if (res.goal === 'replace' && preview.goalDiffers) {
            const id = goalIdMap.get(file.activeGoalId) ?? file.activeGoalId;
            setActiveGoal(db, id);
            result.goalReplaced = true;
          }
          // The active goal is never archived.
          db.prepare('UPDATE goals SET archived_at = NULL WHERE id = ?').run(activeGoalId(db));
          return result;
        },
        (r) => r,
      );
    },
  );

  app.get('/backup/status', async () => ({ data: readBackupStatus(app.config.backupStatusPath) }));
};

const STALE_MS = 36 * 60 * 60 * 1000;

/** Read the status.json the backup container writes after each run (spec §13). */
export function readBackupStatus(file: string, now = Date.now()) {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return {
      state: 'unknown' as const,
      lastSuccessAt: null,
      lastAttemptAt: null,
      sizeBytes: null,
      file: null,
      error: null,
      stale: true,
    };
  }
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : null);
  const lastSuccessAt = str('lastSuccessAt');
  const success = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  return {
    state: (str('error') ? 'error' : lastSuccessAt ? 'ok' : 'unknown') as
      'ok' | 'error' | 'unknown',
    lastSuccessAt,
    lastAttemptAt: str('lastAttemptAt'),
    sizeBytes: typeof raw.sizeBytes === 'number' ? raw.sizeBytes : null,
    file: str('file'),
    error: str('error'),
    stale: Number.isNaN(success) || now - success > STALE_MS,
  };
}
