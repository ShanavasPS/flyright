import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/**
 * Which store version the traveller has already been shown as "Update
 * available". The Settings row keeps its count for as long as the update is
 * out — like iOS's own Software Update row — but the app icon counts an
 * update only until Settings has been opened once with it showing: the
 * icon says "something new for you", not "you still haven't updated".
 */
const KEY = 'update-seen-version';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function updateSeenVersion(): string | null {
  return Storage.getItemSync(KEY) ?? null;
}

export function markUpdateSeen(version: string) {
  if (updateSeenVersion() === version) return;
  Storage.setItemSync(KEY, version);
  notify();
}

/** Whether the update to `version` still counts on the app icon. */
export function useUpdateUnseen(version: string | null | undefined): boolean {
  const seen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    updateSeenVersion,
    () => null,
  );
  return !!version && seen !== version;
}
