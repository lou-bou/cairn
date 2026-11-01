import type {
  Currency,
  Goal,
  GoalMode,
  Milestone,
  Reconciliation,
  SourceId,
  Transaction,
  TxType,
} from '@cairn/shared';

export interface TransactionRow {
  id: string;
  type: TxType;
  date: string;
  note: string;
  amount_original: number;
  currency: Currency;
  rate: number;
  amount_eur: number;
  category_id: string;
  source: SourceId;
  is_adjustment: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface MilestoneRow {
  id: string;
  name: string;
  note: string;
  sort_order: number;
  cost_original: number;
  currency: Currency;
  rate: number;
  cost_eur: number;
  achieved_at: string | null;
  celebration_seen: 0 | 1;
}

export interface GoalRow {
  name: string;
  mode: GoalMode;
  custom_original: number | null;
  currency: Currency | null;
  rate: number | null;
  custom_eur: number | null;
  amount_eur: number;
  achieved_at: string | null;
  celebration_seen: 0 | 1;
}

export interface ReconciliationRow {
  id: string;
  date: string;
  counted_original: number;
  currency: Currency;
  rate: number;
  counted_eur: number;
  app_balance_eur: number;
  difference_eur: number;
  adjustment_transaction_id: string | null;
  created_at: string;
}

export const toTransaction = (r: TransactionRow): Transaction => ({
  id: r.id,
  type: r.type,
  date: r.date,
  note: r.note,
  amountOriginal: r.amount_original,
  currency: r.currency,
  rate: r.rate,
  amountEur: r.amount_eur,
  categoryId: r.category_id,
  source: r.source,
  isAdjustment: r.is_adjustment === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toMilestone = (r: MilestoneRow, thresholdEur: number): Milestone => ({
  id: r.id,
  name: r.name,
  note: r.note,
  sortOrder: r.sort_order,
  costOriginal: r.cost_original,
  currency: r.currency,
  rate: r.rate,
  costEur: r.cost_eur,
  thresholdEur,
  achievedAt: r.achieved_at,
  celebrationSeen: r.celebration_seen === 1,
});

export const toGoal = (r: GoalRow, milestoneSumEur: number, balanceEur: number): Goal => ({
  name: r.name,
  mode: r.mode,
  customOriginal: r.custom_original,
  currency: r.currency,
  rate: r.rate,
  customEur: r.custom_eur,
  amountEur: r.amount_eur,
  milestoneSumEur,
  balanceEur,
  achievedAt: r.achieved_at,
  celebrationSeen: r.celebration_seen === 1,
});

export const toReconciliation = (r: ReconciliationRow): Reconciliation => ({
  id: r.id,
  date: r.date,
  countedOriginal: r.counted_original,
  currency: r.currency,
  rate: r.rate,
  countedEur: r.counted_eur,
  appBalanceEur: r.app_balance_eur,
  differenceEur: r.difference_eur,
  adjustmentTransactionId: r.adjustment_transaction_id,
  createdAt: r.created_at,
});
