import { useSyncExternalStore } from 'react';

/** Hand-off from a journey's detail screen to the World tab: "open on this
 * trip only". A module-level store rather than a route param because
 * NativeTabs never commits JS-initiated tab switches to the router state, so
 * params written into `/world` may never reach the screen — a plain store
 * read on focus always does. The World tab clears it when it loses focus, so
 * a later plain visit shows every travel again. */
let focusedJourneyId: string | null = null;
const listeners = new Set<() => void>();

export function focusWorldOn(journeyId: string | null) {
  if (focusedJourneyId === journeyId) return;
  focusedJourneyId = journeyId;
  for (const listener of listeners) listener();
}

export function useWorldFocus(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => focusedJourneyId,
    () => focusedJourneyId,
  );
}
