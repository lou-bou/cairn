import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** True when the browser reports a connection. Writes are disabled while offline (spec §11). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
