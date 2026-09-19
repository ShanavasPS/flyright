import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/** Which trip updates from the people you follow this phone has already
 * shown you, so a face on the rail marks only what is new. Kept on the
 * device (a mark is a nudge, not a record) and capped: an update lives a
 * day or two, so the newest few hundred ids are all that can still matter. */
const KEY = 'seen-trip-updates';
const CAP = 300;
const listeners = new Set<() => void>();
let current: readonly string[] | null = null;

function read(): readonly string[] {
  if (current) return current;
  try {
    const parsed: unknown = JSON.parse(Storage.getItemSync(KEY) ?? '[]');
    current = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    current = [];
  }
  return current;
}

export function markUpdatesSeen(ids: string[]) {
  const seen = read();
  const fresh = ids.filter((id) => !seen.includes(id));
  if (!fresh.length) return;
  current = [...fresh, ...seen].slice(0, CAP);
  Storage.setItemSync(KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether an update is still new to this phone, live: opening one
 * person's sheet clears their mark on every surface at once. */
export function useIsUnseen(): (updateId: string) => boolean {
  const seen = useSyncExternalStore(subscribe, read, read);
  return (updateId) => !seen.includes(updateId);
}
