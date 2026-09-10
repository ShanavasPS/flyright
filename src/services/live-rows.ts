import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import type { AnySQLiteSelect } from 'drizzle-orm/sqlite-core';

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
 */
export function useLiveRows<T extends LiveSelect>(query: T, deps: unknown[] = []): LiveRows<T> {
  const { data, error, updatedAt } = useLiveQuery(query, deps);
  return { data: updatedAt ? data : undefined, error };
}

/** The first row of a live select, with the loading/missing distinction. */
export function useLiveRow<T extends LiveSelect>(query: T, deps: unknown[] = []): LiveRow<T> {
  const { data, error, updatedAt } = useLiveQuery(query, deps);
  const rows = data as unknown as RowOf<T>[] | undefined;
  return { row: updatedAt ? rows?.[0] : undefined, loaded: !!updatedAt, error };
}
