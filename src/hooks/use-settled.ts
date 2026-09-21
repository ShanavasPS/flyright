import { useEffect, useState } from 'react';

/** How long a screen waits for Clerk to restore the session before reading
 * as whoever it can see. Session restore is a cache read (well under a
 * second); the cap only matters when the client can't reach Clerk at all. */
const AUTH_SETTLE_CAP_MS = 4000;

/** True once `ready`, or once `capMs` has passed without it — so a screen
 * can hold its skeleton through the first read without hanging on it when
 * the network never answers. The cap restarts if `ready` drops again. */
export function useSettled(ready: boolean, capMs: number) {
  const [capped, setCapped] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setCapped(true), capMs);
    return () => clearTimeout(timer);
  }, [ready, capMs]);
  return ready || capped;
}

/** True once Clerk reports loaded, or once the cap has passed without it. */
export function useAuthSettled(authLoaded: boolean) {
  return useSettled(authLoaded, AUTH_SETTLE_CAP_MS);
}
