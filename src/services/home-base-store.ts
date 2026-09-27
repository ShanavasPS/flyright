/** The home base kept per account (and `guest`) on the phone, synced for a
 * signed-in account by components/home-base-sync — see docs/home-base.md. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';

import { EMPTY_HOME_BASE, sanitize, type HomeBaseState } from '@/services/home-base';

export interface StoredHomeBase extends HomeBaseState {
  loaded: boolean;
}

const EMPTY: StoredHomeBase = { ...EMPTY_HOME_BASE, loaded: false };
const useStore = create<{ accounts: Record<string, StoredHomeBase> }>(() => ({ accounts: {} }));
const keyFor = (userId: string | null | undefined) => userId || 'guest';
const storageKey = (key: string) => `home-base:v1:${key}`;
const loading = new Set<string>();

function put(key: string, next: StoredHomeBase) {
  useStore.setState((s) => ({ accounts: { ...s.accounts, [key]: next } }));
  if (next.loaded) {
    const { loaded: _loaded, ...state } = next;
    void AsyncStorage.setItem(storageKey(key), JSON.stringify(state)).catch(() => {});
  }
}

async function load(key: string) {
  const [raw, guestRaw] = await Promise.all([
    AsyncStorage.getItem(storageKey(key)).catch(() => null),
    key === 'guest' ? Promise.resolve(null) : AsyncStorage.getItem(storageKey('guest')).catch(() => null),
  ]);
  const parse = (text: string | null) => {
    try { return text ? sanitize(JSON.parse(text)) : EMPTY_HOME_BASE; } catch { return EMPTY_HOME_BASE; }
  };
  let state = parse(raw);
  // A home set before signing in carries over to an account that has none.
  const guest = parse(guestRaw);
  if (!state.updatedAt && guest.updatedAt) state = guest;
  const current = useStore.getState().accounts[key];
  // Whatever arrived meanwhile (a server copy, a tap) wins if it is newer.
  if (current && current.updatedAt > state.updatedAt) put(key, { ...current, loaded: true });
  else put(key, { ...state, loaded: true });
}

export function useHomeBase(userId: string | null | undefined): StoredHomeBase {
  const key = keyFor(userId);
  const value = useStore((s) => s.accounts[key] ?? EMPTY);
  useEffect(() => {
    if (loading.has(key) || useStore.getState().accounts[key]?.loaded) return;
    loading.add(key);
    void load(key).finally(() => loading.delete(key));
  }, [key]);
  return value;
}

export function getHomeBase(userId: string | null | undefined): StoredHomeBase {
  return useStore.getState().accounts[keyFor(userId)] ?? EMPTY;
}

/** Applies a local change and stamps it, so it wins the next sync. */
export function updateHomeBase(userId: string | null | undefined, change: (state: HomeBaseState) => Partial<HomeBaseState>) {
  const key = keyFor(userId);
  const current = useStore.getState().accounts[key] ?? { ...EMPTY, loaded: true };
  const merged = sanitize({ ...current, ...change(current), updatedAt: Math.max(Date.now(), current.updatedAt + 1) });
  put(key, { ...merged, loaded: true });
}

export function dismissHomePrompt(userId: string | null | undefined, id: string) {
  updateHomeBase(userId, (s) => ({ dismissed: s.dismissed.includes(id) ? s.dismissed : [...s.dismissed, id] }));
}

/** A server copy: taken only when newer than what the phone has. */
export function receiveHomeBase(userId: string, remote: unknown) {
  const incoming = sanitize(remote);
  const current = useStore.getState().accounts[userId];
  if (current && current.updatedAt >= incoming.updatedAt) return;
  put(userId, { ...incoming, loaded: current?.loaded ?? false });
}

/** The period being edited: the editor and the city picker it opens share
 * it, so a picked city comes back without route params. */
export interface PeriodDraft {
  id: string | null;
  city: string;
  country: string;
  from: string | null;
  until: string | null;
}
export const usePeriodDraft = create<{ draft: PeriodDraft | null; setDraft: (d: PeriodDraft | null) => void; patch: (d: Partial<PeriodDraft>) => void }>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  patch: (d) => set((s) => (s.draft ? { draft: { ...s.draft, ...d } } : s)),
}));

/** The last change the picker made to today's home, for a few seconds'
 * Undo on the Home base screen: choosing a city is one tap, so taking it
 * back is one tap too. */
export interface HomeUndo {
  message: string;
  periods: HomeBaseState['periods'];
  at: number;
}
export const useHomeUndo = create<{ undo: HomeUndo | null }>(() => ({ undo: null }));
/** How long the Undo stays offered. */
const UNDO_MS = 8000;

/** Applies `change` to the periods and offers to undo it. */
export function changeHomeWithUndo(userId: string | null | undefined, message: string, change: (state: HomeBaseState) => HomeBaseState['periods']) {
  const before = getHomeBase(userId).periods;
  updateHomeBase(userId, (s) => ({ periods: change(s) }));
  const at = Date.now();
  useHomeUndo.setState({ undo: { message, periods: before, at } });
  setTimeout(() => {
    if (useHomeUndo.getState().undo?.at === at) useHomeUndo.setState({ undo: null });
  }, UNDO_MS);
}

export function undoHomeChange(userId: string | null | undefined) {
  const { undo } = useHomeUndo.getState();
  if (!undo) return;
  updateHomeBase(userId, () => ({ periods: undo.periods }));
  useHomeUndo.setState({ undo: null });
}
