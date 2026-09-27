/** The photo a trip shows on Flights when the traveller changed it from the
 * destination's Wikipedia photo: one of their journal photos, or none (the
 * flag). Kept per account on the phone and synced by
 * components/trip-covers-sync, last write wins (docs/trip-covers.md). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';

export type TripCover = { kind: 'none'; photoId: null } | { kind: 'photo'; photoId: string };
export interface TripCovers {
  covers: Record<string, TripCover>;
  updatedAt: number;
  loaded: boolean;
}

const EMPTY: TripCovers = { covers: {}, updatedAt: 0, loaded: false };
const useStore = create<{ accounts: Record<string, TripCovers> }>(() => ({ accounts: {} }));
const keyFor = (userId: string | null | undefined) => userId || 'guest';
const storageKey = (key: string) => `trip-covers:v1:${key}`;
const loading = new Set<string>();

/** Drops anything malformed, from storage or the server. */
export function sanitizeCovers(value: unknown): Omit<TripCovers, 'loaded'> {
  const v = (value ?? {}) as { covers?: unknown; updatedAt?: unknown };
  const list = Array.isArray(v.covers)
    ? v.covers
    : v.covers && typeof v.covers === 'object'
      ? Object.entries(v.covers as Record<string, unknown>).map(([groupId, c]) => ({ groupId, ...(c as object) }))
      : [];
  const covers: Record<string, TripCover> = {};
  for (const raw of list as { groupId?: unknown; kind?: unknown; photoId?: unknown }[]) {
    if (typeof raw?.groupId !== 'string' || !raw.groupId || raw.groupId.length > 200) continue;
    if (raw.kind === 'none') covers[raw.groupId] = { kind: 'none', photoId: null };
    else if (raw.kind === 'photo' && typeof raw.photoId === 'string' && raw.photoId) covers[raw.groupId] = { kind: 'photo', photoId: raw.photoId };
  }
  return { covers, updatedAt: typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? v.updatedAt : 0 };
}

/** The server's shape: a list. */
export const coverList = (covers: Record<string, TripCover>) =>
  Object.entries(covers).map(([groupId, c]) => ({ groupId, kind: c.kind, photoId: c.photoId }));

function put(key: string, next: TripCovers) {
  useStore.setState((s) => ({ accounts: { ...s.accounts, [key]: next } }));
  if (next.loaded) {
    void AsyncStorage.setItem(storageKey(key), JSON.stringify({ covers: next.covers, updatedAt: next.updatedAt })).catch(() => {});
  }
}

async function load(key: string) {
  const [raw, guestRaw] = await Promise.all([
    AsyncStorage.getItem(storageKey(key)).catch(() => null),
    key === 'guest' ? Promise.resolve(null) : AsyncStorage.getItem(storageKey('guest')).catch(() => null),
  ]);
  const parse = (text: string | null) => {
    try { return sanitizeCovers(text ? JSON.parse(text) : null); } catch { return sanitizeCovers(null); }
  };
  let state = parse(raw);
  // Photos chosen before signing in carry over to an account that has none.
  const guest = parse(guestRaw);
  if (!state.updatedAt && guest.updatedAt) state = guest;
  const current = useStore.getState().accounts[key];
  if (current && current.updatedAt > state.updatedAt) put(key, { ...current, loaded: true });
  else put(key, { ...state, loaded: true });
}

export function useTripCovers(userId: string | null | undefined): TripCovers {
  const key = keyFor(userId);
  const value = useStore((s) => s.accounts[key] ?? EMPTY);
  useEffect(() => {
    if (loading.has(key) || useStore.getState().accounts[key]?.loaded) return;
    loading.add(key);
    void load(key).finally(() => loading.delete(key));
  }, [key]);
  return value;
}

/** A trip's photo choice; `null` goes back to the destination's photo. */
export function setTripCover(userId: string | null | undefined, groupId: string, cover: TripCover | null) {
  const key = keyFor(userId);
  const current = useStore.getState().accounts[key] ?? { ...EMPTY, loaded: true };
  const covers = { ...current.covers };
  if (cover) covers[groupId] = cover;
  else delete covers[groupId];
  put(key, { covers, updatedAt: Math.max(Date.now(), current.updatedAt + 1), loaded: true });
}

/** A server copy: taken only when newer than what the phone has. */
export function receiveTripCovers(userId: string, remote: unknown) {
  const incoming = sanitizeCovers(remote);
  const current = useStore.getState().accounts[userId];
  if (current && current.updatedAt >= incoming.updatedAt) return;
  put(userId, { ...incoming, loaded: current?.loaded ?? false });
}

/** A city's photo for every trip there, its page and its home base screens,
 * kept in the same synced list under this key. */
export const cityCoverKey = (place: { city: string; country: string }) => `city:${place.country}:${place.city}`;
