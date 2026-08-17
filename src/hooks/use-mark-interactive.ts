import { useObserve } from 'expo-observe';
import { useEffect } from 'react';

/**
 * Reports this route as interactive to EAS Observe. With the expo-router
 * integration on, the call is scoped to the current route (per-navigation
 * TTI); the first call of the session also records app-level TTI. Screens
 * here render local SQLite data synchronously, so first mount ≈ interactive.
 */
export function useMarkInteractive() {
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);
}
