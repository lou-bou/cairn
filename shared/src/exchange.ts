import { z } from 'zod';
import { CURRENCIES } from './money.js';
import { DEFAULT_SOURCE, SOURCE_IDS } from './sources.js';

/** The JSON export format. `schemaVersion` changes only when the shape changes. */
export const EXPORT_SCHEMA_VERSION = 1;

const int = z.number().int();
const currency = z.enum(CURRENCIES);
const nullableTs = z.string().nullable();

export const exportFile = z.object({
  app: z.literal('cairn', 'This is not a Cairn export file'),
  schemaVersion: z.literal(
    EXPORT_SCHEMA_VERSION,
    'This export was made by a different version of Cairn',
  ),
  exportedAt: z.string(),
  settings: z.object({
    defaultRate: int.positive(),
    reconcileFrequency: z.enum(['weekly', 'monthly', 'off']),
    reconcileDay: int.min(0).max(31),
    lastReconciledAt: nullableTs,
    reconcileSnoozedUntil: z.string().nullable(),
  }),
  goal: z.object({
    name: z.string().min(1).max(80),
    mode: z.enum(['auto', 'custom']),
    customOriginal: int.positive().nullable(),
    currency: currency.nullable(),
    rate: int.positive().nullable(),
    customEur: int.positive().nullable(),
    achievedAt: nullableTs,
    celebrationSeen: z.boolean(),
  }),
  milestones: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(80),
      note: z.string().max(500),
      sortOrder: int,
      costOriginal: int.positive(),
      currency,
      rate: int.positive(),
      costEur: int.positive(),
      achievedAt: nullableTs,
      celebrationSeen: z.boolean(),
    }),
  ),
  transactions: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(['in', 'out']),
      date: z.string(),
      note: z.string().max(500),
      amountOriginal: int.positive(),
      currency,
      rate: int.positive(),
      amountEur: int.nonnegative(),
      categoryId: z.string(),
      // Optional so exports from before sources existed still import.
      source: z.enum(SOURCE_IDS).default(DEFAULT_SOURCE),
      isAdjustment: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  reconciliations: z.array(
    z.object({
      id: z.string().min(1),
      date: z.string(),
      countedOriginal: int.nonnegative(),
      currency,
      rate: int.positive(),
      countedEur: int,
      appBalanceEur: int,
      differenceEur: int,
      adjustmentTransactionId: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type ExportFile = z.infer<typeof exportFile>;

export type ConflictChoice = 'replace' | 'keepBoth' | 'skip';
export type ImportEntity = 'transactions' | 'milestones' | 'reconciliations';

export const importInput = z.object({
  file: z.unknown(),
  resolution: z
    .object({
      /** Applied to every conflict without its own choice ("apply to all"). */
      conflicts: z.enum(['replace', 'keepBoth', 'skip']).default('skip'),
      perRecord: z.record(z.string(), z.enum(['replace', 'keepBoth', 'skip'])).default({}),
      goal: z.enum(['keep', 'replace']).default('keep'),
      settings: z.enum(['keep', 'replace']).default('keep'),
    })
    .default({ conflicts: 'skip', perRecord: {}, goal: 'keep', settings: 'keep' }),
});
export type ImportInput = z.input<typeof importInput>;

export interface ImportConflict {
  entity: ImportEntity;
  id: string;
  /** Short human descriptions of both versions, e.g. "Rent · 2026-10-01 · €450.00". */
  existing: string;
  incoming: string;
}

export interface ImportPreview {
  counts: Record<ImportEntity, { new: number; identical: number; conflicts: number }>;
  conflicts: ImportConflict[];
  goalDiffers: boolean;
  settingsDiffer: boolean;
  exportedAt: string;
}

export interface ImportResult {
  added: number;
  replaced: number;
  keptBoth: number;
  skipped: number;
  goalReplaced: boolean;
  settingsReplaced: boolean;
  backupFile: string | null;
}
