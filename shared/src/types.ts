import type { Currency } from './money.js';
import type { ReconcileFrequency } from './reconcile.js';
import type { SourceId } from './sources.js';

export type TxType = 'in' | 'out';
export type GoalMode = 'auto' | 'custom';

export interface Category {
  id: string;
  type: TxType;
  name: string;
  sortOrder: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  date: string;
  note: string;
  amountOriginal: number;
  currency: Currency;
  /** DZD per 1 EUR in thousandths, at entry time. */
  rate: number;
  amountEur: number;
  categoryId: string;
  source: SourceId;
  isAdjustment: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  name: string;
  note: string;
  sortOrder: number;
  costOriginal: number;
  currency: Currency;
  rate: number;
  costEur: number;
  /** Sum of this milestone's cost and every one before it. */
  thresholdEur: number;
  achievedAt: string | null;
  celebrationSeen: boolean;
}

export interface Goal {
  name: string;
  mode: GoalMode;
  customOriginal: number | null;
  currency: Currency | null;
  rate: number | null;
  customEur: number | null;
  /** The effective goal: the milestone sum in auto mode, customEur in custom mode. */
  amountEur: number;
  milestoneSumEur: number;
  balanceEur: number;
  achievedAt: string | null;
  celebrationSeen: boolean;
}

export interface Settings {
  defaultRate: number;
  reconcileFrequency: ReconcileFrequency;
  reconcileDay: number;
  lastReconciledAt: string | null;
  reconcileSnoozedUntil: string | null;
}

export interface Reconciliation {
  id: string;
  date: string;
  countedOriginal: number;
  currency: Currency;
  rate: number;
  countedEur: number;
  appBalanceEur: number;
  differenceEur: number;
  adjustmentTransactionId: string | null;
  createdAt: string;
}

export interface CategoryTotal {
  categoryId: string;
  type: TxType;
  totalEur: number;
  count: number;
}

export interface MonthTotal {
  month: string;
  inEur: number;
  outEur: number;
}

export interface BalancePoint {
  date: string;
  balanceEur: number;
}

export interface Summary {
  from: string | null;
  to: string | null;
  balanceEur: number;
  inEur: number;
  outEur: number;
  netEur: number;
  monthCount: number;
  avgMonthlyInEur: number;
  avgMonthlyOutEur: number;
  categories: CategoryTotal[];
  monthly: MonthTotal[];
  balanceSeries: BalancePoint[];
}

export interface BackupStatus {
  state: 'ok' | 'error' | 'unknown';
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  sizeBytes: number | null;
  file: string | null;
  error: string | null;
  /** True when the last success is older than 36 hours or there is none. */
  stale: boolean;
}

/** Every write returns the changed data plus human-readable notices (e.g. "Goal raised to €4,900.00"). */
export interface Mutation<T> {
  data: T;
  notices: string[];
}

export interface ApiErrorBody {
  error: string;
  fields?: Record<string, string>;
}
