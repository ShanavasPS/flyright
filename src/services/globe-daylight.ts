import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/** Whether the globe is lit by the real sun — day and night as they are
 * right now — or by the fixed studio light. One switch in the World tab's
 * header, remembered like the theme; on until the traveller says otherwise. */
const KEY = 'globe-daylight';
const listeners = new Set<() => void>();
let current: boolean | null = null;

export function getGlobeDaylight(): boolean {
  current ??= Storage.getItemSync(KEY) !== 'off';
  return current;
}

export function setGlobeDaylight(enabled: boolean) {
  current = enabled;
  Storage.setItemSync(KEY, enabled ? 'on' : 'off');
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The switch's state, live: every globe on screen follows a flip. */
export function useGlobeDaylight(): boolean {
  return useSyncExternalStore(subscribe, getGlobeDaylight, getGlobeDaylight);
}
