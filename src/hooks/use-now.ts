import { useEffect, useState } from 'react';

/** A clock that re-renders the caller on an interval — for live surfaces
 * (travel-day banner/timeline) whose countdowns must tick while open. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
