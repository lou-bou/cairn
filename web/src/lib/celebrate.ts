import { useSyncExternalStore } from 'react';

/** A tiny store for the logo's goal-celebration hop. */
let bouncing = false;
const listeners = new Set<() => void>();

export function bounceLogo(ms = 1600): void {
  bouncing = true;
  listeners.forEach((l) => l());
  window.setTimeout(() => {
    bouncing = false;
    listeners.forEach((l) => l());
  }, ms);
}

export function useLogoBounce(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => bouncing,
    () => false,
  );
}
