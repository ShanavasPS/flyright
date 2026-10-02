import { useSyncExternalStore } from 'react';

import { DEFAULT_TRIP_SORT, type TripSort } from '@/services/trip-groups';

/** The web twin of trip-sort.ts: the same chips, remembered in this
 * browser. Storage can be missing or blocked (private windows), so every
 * access is guarded and the defaults stand in. */
const KEY = 'trip-sort';
const listeners = new Set<() => void>();
let current: TripSort | null = null;

function read(): TripSort {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<TripSort>;
    return {
      upcoming: saved.upcoming === 'added' ? 'added' : DEFAULT_TRIP_SORT.upcoming,
      past: saved.past === 'oldest' ? 'oldest' : DEFAULT_TRIP_SORT.past,
    };
  } catch {
    return DEFAULT_TRIP_SORT;
  }
}

export function getTripSort(): TripSort {
  current ??= read();
  return current;
}

export function setTripSort(change: Partial<TripSort>) {
  current = { ...getTripSort(), ...change };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {}
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTripSort(): TripSort {
  return useSyncExternalStore(subscribe, getTripSort, () => DEFAULT_TRIP_SORT);
}
