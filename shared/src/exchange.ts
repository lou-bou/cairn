import { z } from 'zod';
import { CURRENCIES } from './money.js';
import { DEFAULT_SOURCE, SOURCE_IDS } from './sources.js';

/**
 * The JSON export format. `schemaVersion` changes only when the shape changes.
 * 1: one goal. 2: several goals, each with its own milestones, and one of them active.
 */
export const EXPORT_SCHEMA_VERSION = 2;

/**
 * The id of the first goal on every install: the seeded one, or the single goal an install had
 * before goals could be added. Fixed, so a version 1 export lands on it instead of beside it.
 */
export const FIRST_GOAL_ID = '5eed0000-0000-4000-8000-100000000001';

const int = z.number().int();
const currency = z.enum(CURRENCIES);
const nullableTs = z.string().nullable();

const settings = z.object({
  defaultRate: int.positive(),
  reconcileFrequency: z.enum(['weekly', 'monthly', 'off']),
  reconcileDay: int.min(0).max(31),
  lastReconciledAt: nullableTs,
  reconcileSnoozedUntil: z.string().nullable(),
});

const goalFields = {
  name: z.string().min(1).max(80),
  mode: z.enum(['auto', 'custom']),
  customOriginal: int.positive().nullable(),
  currency: currency.nullable(),
  rate: int.positive().nullable(),
  customEur: int.positive().nullable(),
  achievedAt: nullableTs,
  celebrationSeen: z.boolean(),
};

const milestoneFields = {
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
};

const transactions = z.array(
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
);

const reconciliations = z.array(
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
);

const v1 = z.object({
  app: z.literal('cairn'),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  settings,
  goal: z.object(goalFields),
  milestones: z.array(z.object(milestoneFields)),
  transactions,
  reconciliations,
});

const v2 = z
  .object({
    app: z.literal('cairn'),
    schemaVersion: z.literal(2),
    exportedAt: z.string(),
    settings,
    activeGoalId: z.string().min(1),
    goals: z
      .array(
        z.object({
          id: z.string().min(1),
          ...goalFields,
          sortOrder: int,
          archivedAt: nullableTs,
        }),
      )
      .min(1, 'The file has no goals'),
    milestones: z.array(z.object({ ...milestoneFields, goalId: z.string().min(1) })),
    transactions,
    reconciliations,
  })
  .superRefine((f, ctx) => {
    const ids = new Set(f.goals.map((g) => g.id));
    if (!ids.has(f.activeGoalId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['activeGoalId'],
        message: 'The active goal is missing',
      });
    }
    for (const m of f.milestones) {
      if (!ids.has(m.goalId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['milestones'],
          message: `Milestone "${m.name}" belongs to a goal that is not in the file`,
        });
        return;
      }
    }
  });

/** A version 1 file as version 2: its goal is the first goal, and holds every milestone. */
function upgrade(f: z.output<typeof v1>): z.output<typeof v2> {
  const { goal, ...rest } = f;
  return {
    ...rest,
    schemaVersion: 2,
    activeGoalId: FIRST_GOAL_ID,
    goals: [{ id: FIRST_GOAL_ID, ...goal, sortOrder: 1, archivedAt: null }],
    milestones: f.milestones.map((m) => ({ ...m, goalId: FIRST_GOAL_ID })),
  };
}

export const exportFile = z
  .object({
    app: z.literal('cairn', 'This is not a Cairn export file'),
    schemaVersion: z.union(
      [z.literal(1), z.literal(2)],
      'This export was made by a different version of Cairn',
    ),
  })
  .loose()
  .pipe(z.discriminatedUnion('schemaVersion', [v1, v2]))
  .transform((f) => (f.schemaVersion === 1 ? upgrade(f) : f));
export type ExportFile = z.output<typeof v2>;

export type ConflictChoice = 'replace' | 'keepBoth' | 'skip';
export type ImportEntity = 'goals' | 'transactions' | 'milestones' | 'reconciliations';

export const importInput = z.object({
  file: z.unknown(),
  resolution: z
    .object({
      /** Applied to every conflict without its own choice ("apply to all"). */
      conflicts: z.enum(['replace', 'keepBoth', 'skip']).default('skip'),
      perRecord: z.record(z.string(), z.enum(['replace', 'keepBoth', 'skip'])).default({}),
      /** Which goal is active afterwards: this install's, or the file's. */
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
  /** The file's active goal is a different one from this install's. */
  goalDiffers: boolean;
  settingsDiffer: boolean;
  exportedAt: string;
}

export interface ImportResult {
  added: number;
  replaced: number;
  keptBoth: number;
  skipped: number;
  /** The file's active goal became the active goal. */
  goalReplaced: boolean;
  settingsReplaced: boolean;
  backupFile: string | null;
}
