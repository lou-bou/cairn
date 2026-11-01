import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BackupStatus,
  Category,
  Goal,
  GoalInput,
  Milestone,
  MilestoneInput,
  Mutation,
  Reconciliation,
  ReconciliationInput,
  Settings,
  SettingsInput,
  Summary,
  Transaction,
  TransactionInput,
} from '@cairn/shared';
import { api, qs } from './client';
import { useToast } from '../components/Toast';

export const keys = {
  all: ['cairn'] as const,
  categories: ['cairn', 'categories'] as const,
  transactions: (f: TransactionFilters = {}) => ['cairn', 'transactions', f] as const,
  goal: ['cairn', 'goal'] as const,
  milestones: ['cairn', 'milestones'] as const,
  summary: (from?: string, to?: string) => ['cairn', 'summary', from ?? null, to ?? null] as const,
  settings: ['cairn', 'settings'] as const,
  reconciliations: ['cairn', 'reconciliations'] as const,
  backup: ['cairn', 'backup'] as const,
};

export interface TransactionFilters {
  type?: 'in' | 'out';
  categoryId?: string;
  currency?: 'EUR' | 'DZD';
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
}

type Data<T> = { data: T };
const unwrap = <T>(p: Promise<Data<T>>) => p.then((r) => r.data);

export const useCategories = () =>
  useQuery({
    queryKey: keys.categories,
    queryFn: () => unwrap(api.get<Data<Category[]>>('/api/categories')),
    staleTime: Infinity,
  });

export const useTransactions = (f: TransactionFilters = {}) =>
  useQuery({
    queryKey: keys.transactions(f),
    queryFn: () =>
      api.get<{ data: Transaction[]; total: number }>(`/api/transactions${qs({ ...f })}`),
  });

export const useGoal = () =>
  useQuery({ queryKey: keys.goal, queryFn: () => unwrap(api.get<Data<Goal>>('/api/goal')) });

export const useMilestones = () =>
  useQuery({
    queryKey: keys.milestones,
    queryFn: () => unwrap(api.get<Data<Milestone[]>>('/api/milestones')),
  });

export const useSummary = (from?: string, to?: string) =>
  useQuery({
    queryKey: keys.summary(from, to),
    queryFn: () => unwrap(api.get<Data<Summary>>(`/api/summary${qs({ from, to })}`)),
  });

export const useSettings = () =>
  useQuery({
    queryKey: keys.settings,
    queryFn: () => unwrap(api.get<Data<Settings>>('/api/settings')),
  });

export const useReconciliations = () =>
  useQuery({
    queryKey: keys.reconciliations,
    queryFn: () => unwrap(api.get<Data<Reconciliation[]>>('/api/reconciliations')),
  });

export const useBackupStatus = () =>
  useQuery({
    queryKey: keys.backup,
    queryFn: () => unwrap(api.get<Data<BackupStatus>>('/api/backup/status')),
  });

/**
 * Every write can change balances, achievements and the goal, so refetch everything after it.
 * Server notices ("Goal raised to …") are shown as toasts.
 */
function useWrite<V, T>(fn: (vars: V) => Promise<Mutation<T>>) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    networkMode: 'online',
    onSuccess: async (res) => {
      for (const n of res.notices) toast.show(n, { tone: 'info', duration: 7000 });
      await qc.invalidateQueries({ queryKey: keys.all });
    },
  });
}

export const useCreateTransaction = () =>
  useWrite((v: TransactionInput) => api.post<Mutation<Transaction>>('/api/transactions', v));
export const useUpdateTransaction = () =>
  useWrite(({ id, ...v }: TransactionInput & { id: string }) =>
    api.put<Mutation<Transaction>>(`/api/transactions/${id}`, v),
  );
export const useDeleteTransaction = () =>
  useWrite((id: string) => api.del<Mutation<{ id: string }>>(`/api/transactions/${id}`));

export const useUpdateGoal = () =>
  useWrite((v: GoalInput) => api.put<Mutation<Goal>>('/api/goal', v));
export const useCreateMilestone = () =>
  useWrite((v: MilestoneInput) => api.post<Mutation<Milestone>>('/api/milestones', v));
export const useUpdateMilestone = () =>
  useWrite(({ id, ...v }: MilestoneInput & { id: string }) =>
    api.put<Mutation<Milestone>>(`/api/milestones/${id}`, v),
  );
export const useDeleteMilestone = () =>
  useWrite((id: string) => api.del<Mutation<{ id: string }>>(`/api/milestones/${id}`));
export const useReorderMilestones = () =>
  useWrite((ids: string[]) => api.post<Mutation<Milestone[]>>('/api/milestones/reorder', { ids }));

export const useMarkCelebrationsSeen = () =>
  useWrite((v: { milestoneIds: string[]; goal: boolean }) =>
    api.post<Mutation<unknown>>('/api/celebrations/seen', v),
  );

export const useUpdateSettings = () =>
  useWrite((v: SettingsInput) => api.put<Mutation<Settings>>('/api/settings', v));

export const useCreateReconciliation = () =>
  useWrite((v: ReconciliationInput) =>
    api.post<Mutation<Reconciliation>>('/api/reconciliations', v),
  );
