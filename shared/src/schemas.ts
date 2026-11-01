import { z } from 'zod';
import { CURRENCIES, MAX_MINOR, MAX_RATE_MILLI } from './money.js';
import { isIsoDate } from './dates.js';
import { DEFAULT_SOURCE, SOURCE_IDS } from './sources.js';

const isoDate = z.string().refine(isIsoDate, 'Use a valid date (YYYY-MM-DD)');
const currency = z.enum(CURRENCIES, 'Currency must be EUR or DZD');
const rate = z
  .number('Rate is required')
  .int('Rate must be in thousandths')
  .positive('Rate must be greater than 0')
  .max(MAX_RATE_MILLI, 'Rate is too large');
const positiveMinor = z
  .number('Amount is required')
  .int('Amount must be in minor units')
  .positive('Amount must be greater than 0')
  .max(MAX_MINOR, 'Amount is too large');
const note = z.string().trim().max(500, 'Note is too long (500 characters max)');

export const transactionInput = z.object({
  type: z.enum(['in', 'out'], 'Type must be "in" or "out"'),
  date: isoDate,
  note: note.default(''),
  amountOriginal: positiveMinor,
  currency,
  rate: rate.optional(),
  categoryId: z.string('Choose a category').min(1, 'Choose a category'),
  source: z.enum(SOURCE_IDS, 'Choose a source').default(DEFAULT_SOURCE),
  isAdjustment: z.boolean().default(false),
});
export type TransactionInput = z.input<typeof transactionInput>;

export const transactionQuery = z.object({
  type: z.enum(['in', 'out']).optional(),
  categoryId: z.string().optional(),
  currency: currency.optional(),
  source: z.enum(SOURCE_IDS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TransactionQuery = z.input<typeof transactionQuery>;

export const milestoneInput = z.object({
  name: z
    .string('Name is required')
    .trim()
    .min(1, 'Name is required')
    .max(80, 'Name is too long (80 characters max)'),
  note: note.default(''),
  costOriginal: positiveMinor,
  currency,
  rate: rate.optional(),
});
export type MilestoneInput = z.input<typeof milestoneInput>;

export const reorderInput = z.object({
  ids: z.array(z.string()).min(1, 'Provide the milestone order'),
});

export const goalInput = z
  .object({
    name: z
      .string('Name is required')
      .trim()
      .min(1, 'Name is required')
      .max(80, 'Name is too long (80 characters max)'),
    mode: z.enum(['auto', 'custom'], 'Mode must be "auto" or "custom"'),
    customOriginal: positiveMinor.optional(),
    currency: currency.optional(),
    rate: rate.optional(),
  })
  .refine(
    (g) => g.mode === 'auto' || (g.customOriginal !== undefined && g.currency !== undefined),
    {
      message: 'A custom goal needs an amount and a currency',
      path: ['customOriginal'],
    },
  );
export type GoalInput = z.input<typeof goalInput>;

export const celebrationsSeenInput = z.object({
  milestoneIds: z.array(z.string()).default([]),
  goal: z.boolean().default(false),
});

export const settingsInput = z
  .object({
    defaultRate: rate,
    reconcileFrequency: z.enum(['weekly', 'monthly', 'off']),
    reconcileDay: z.number().int().min(0).max(31),
    reconcileSnoozedUntil: isoDate.nullable(),
  })
  .partial()
  .superRefine((s, ctx) => {
    if (s.reconcileFrequency === 'weekly' && s.reconcileDay !== undefined && s.reconcileDay > 6) {
      ctx.addIssue({ code: 'custom', path: ['reconcileDay'], message: 'Pick a weekday' });
    }
    if (s.reconcileFrequency === 'monthly' && s.reconcileDay !== undefined && s.reconcileDay < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['reconcileDay'],
        message: 'Pick a day of the month (1–31)',
      });
    }
  });
export type SettingsInput = z.input<typeof settingsInput>;

export const reconciliationInput = z.object({
  date: isoDate.optional(),
  countedOriginal: z
    .number('Counted amount is required')
    .int('Amount must be in minor units')
    .min(0, 'Amount cannot be negative')
    .max(MAX_MINOR, 'Amount is too large'),
  currency,
  rate: rate.optional(),
  /** When present and the counts differ, an adjustment transaction is created in this category. */
  adjustment: z.object({ categoryId: z.string().min(1, 'Choose a category') }).optional(),
});
export type ReconciliationInput = z.input<typeof reconciliationInput>;

export const summaryQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
