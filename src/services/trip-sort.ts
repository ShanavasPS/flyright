import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { DEFAULT_TRIP_SORT, type TripSort } from '@/services/trip-groups';

/** The Flights list's sort chips — Next up / Recently added on Upcoming,
 * Latest / Oldest on the past — remembered on this device like the globe's
 * sun switch. */
const KEY = 'trip-sort';
const listeners = new Set<() => void>();
let current: TripSort | null = null;

function read(): TripSort {
  try {
    const saved = JSON.parse(Storage.getItemSync(KEY) ?? '{}') as Partial<TripSort>;
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
  Storage.setItemSync(KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTripSort(): TripSort {
  return useSyncExternalStore(subscribe, getTripSort, getTripSort);
}
