import type { TxType } from './types.js';

/** The fixed category set (spec §4). Ids are stable keys; colors come from theme tokens. */
export const CATEGORIES = [
  { id: 'income', type: 'in', name: 'Income', sortOrder: 1 },
  { id: 'funding', type: 'in', name: 'Funding', sortOrder: 2 },
  { id: 'savings', type: 'in', name: 'Savings', sortOrder: 3 },
  { id: 'other', type: 'in', name: 'Other', sortOrder: 4 },
  { id: 'administrative', type: 'out', name: 'Administrative', sortOrder: 5 },
  { id: 'luxury', type: 'out', name: 'Luxury', sortOrder: 6 },
  { id: 'living', type: 'out', name: 'Living', sortOrder: 7 },
] as const satisfies readonly { id: string; type: TxType; name: string; sortOrder: number }[];

export type CategoryId = (typeof CATEGORIES)[number]['id'];
