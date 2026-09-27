import { useObserve } from 'expo-observe';
import { useEffect, useRef } from 'react';

/**
 * Reports this route as interactive to EAS Observe. With the expo-router
 * integration on, the call is scoped to the current route (per-navigation
 * TTI); the first call of the session also records app-level TTI. Screens
 * here render local SQLite data synchronously, so first mount ≈ interactive.
 *
 * A screen that waits on the network (Convex, RevenueCat) passes `ready`
 * once its data is in, so the metric times the content, not the spinner.
 * Only the first time counts.
 */
export function useMarkInteractive(ready = true) {
  const { markInteractive } = useObserve();
  const marked = useRef(false);
  useEffect(() => {
    if (!ready || marked.current) return;
    marked.current = true;
    markInteractive();
  }, [markInteractive, ready]);
}
