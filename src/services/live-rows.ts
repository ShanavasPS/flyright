import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import type { AnySQLiteSelect } from 'drizzle-orm/sqlite-core';
import { useState } from 'react';

type LiveSelect = Pick<AnySQLiteSelect, '_' | 'then'>;
type RowOf<T> = Awaited<T> extends (infer R)[] ? R : never;

export type LiveRows<T> = {
  /** undefined until the first read lands (or if it failed). */
  data: Awaited<T> | undefined;
  error: Error | undefined;
};

export type LiveRow<T> = {
  /** undefined while loading, when the read failed, or when no row matches —
   * `loaded` tells the last two apart from the first. */
  row: RowOf<T> | undefined;
  loaded: boolean;
  error: Error | undefined;
};

/**
 * drizzle's useLiveQuery seeds a list select with `[]` and never says when
 * the first read has landed, so every screen that gates on `data` paints
 * its empty state for a frame (or forever, on a failed read) before the
 * rows arrive. `updatedAt` is the tell — it stays undefined until a query
 * resolves — so this wrapper hides `data` until then and passes the error
 * through instead of dropping it.
 *
 * The same applies when `deps` change: drizzle keeps the previous query's
 * rows (and `updatedAt`) until the new one lands, so a screen whose filter
 * just changed — the viewer id arriving once Clerk restores the session —
 * would show the old answer as if it were the new one. `data` goes back to
 * undefined until a read lands for the current deps.
 */
export function useLiveRows<T extends LiveSelect>(query: T, deps: unknown[] = []): LiveRows<T> {
  const { data, error, updatedAt } = useLiveQuery(query, deps);
  const settled = useSettledForDeps(updatedAt, deps);
  return { data: settled ? data : undefined, error };
}

/** The first row of a live select, with the loading/missing distinction. */
export function useLiveRow<T extends LiveSelect>(query: T, deps: unknown[] = []): LiveRow<T> {
  const { data, error, updatedAt } = useLiveQuery(query, deps);
  const settled = useSettledForDeps(updatedAt, deps);
  const rows = data as unknown as RowOf<T>[] | undefined;
  return { row: settled ? rows?.[0] : undefined, loaded: settled, error };
}

/** True once a read has landed for the *current* deps. A deps change resets
 * it: the `updatedAt` seen at the moment deps changed is remembered, and only
 * a newer one counts. (drizzle stamps a fresh Date on every read, so the
 * re-run after a change always moves it forward.) Kept in state, updated
 * during render — React's "remember the previous render" pattern — so the
 * reset lands in the same frame as the deps change. */
function useSettledForDeps(updatedAt: Date | undefined, deps: unknown[]): boolean {
  const [mark, setMark] = useState<{ deps: unknown[]; stale: Date | undefined }>({
    deps,
    stale: undefined,
  });
  if (!sameDeps(mark.deps, deps)) {
    setMark({ deps, stale: updatedAt });
    return false;
  }
  return !!updatedAt && updatedAt !== mark.stale;
}

function sameDeps(a: unknown[], b: unknown[]) {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}
