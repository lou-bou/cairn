import type { Mutation } from '@cairn/shared';
import type { Db } from '../db/index.js';
import { recompute } from './recompute.js';

/**
 * Run a write, recompute achievements, then read the result, all in one DB transaction,
 * so the goal and milestones can never be out of step with the data (spec §5).
 */
export function mutate<W, T>(
  db: Db,
  write: (notices: string[]) => W,
  read: (written: W) => T,
): Mutation<T> {
  return db.transaction(() => {
    const notices: string[] = [];
    const written = write(notices);
    notices.push(...recompute(db));
    return { data: read(written), notices };
  })();
}
