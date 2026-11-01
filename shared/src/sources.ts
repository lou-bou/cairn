/** Where money came from or went out of. Fixed list; ids are stable keys. */
export const SOURCES = [
  { id: 'cash', name: 'Cash' },
  { id: 'ccp', name: 'CCP' },
  { id: 'bna', name: 'BNA' },
  { id: 'check', name: 'Check' },
  { id: 'other', name: 'Other' },
] as const;

export type SourceId = (typeof SOURCES)[number]['id'];

export const SOURCE_IDS = SOURCES.map((s) => s.id) as [SourceId, ...SourceId[]];

/** Entries from before sources existed, and imports of older exports, get this. */
export const DEFAULT_SOURCE: SourceId = 'other';

export function sourceName(id: string): string {
  return SOURCES.find((s) => s.id === id)?.name ?? id;
}
