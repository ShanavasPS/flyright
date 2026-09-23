import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';

export interface ProReminder { journeyKey: string; remindAt: number }
export interface ProPreferences {
  introductionSeen: boolean;
  homeDismissed: boolean;
  loaded: boolean;
  remoteLoaded: boolean;
  reminders: ProReminder[];
}
const EMPTY: ProPreferences = { introductionSeen: false, homeDismissed: false, loaded: false, remoteLoaded: false, reminders: [] };
const useStore = create<{ accounts: Record<string, ProPreferences> }>(() => ({ accounts: {} }));
const keyFor = (userId: string | null | undefined) => userId || 'guest';
const storageKey = (key: string) => `pro-prompts:v1:${key}`;
const loading = new Set<string>();

/** Monotonic local flags make dismissal immediate, including while offline. */
function merge(key: string, incoming: Partial<ProPreferences>) {
  const current = useStore.getState().accounts[key] ?? EMPTY;
  const next = {
    ...current, ...incoming,
    introductionSeen: current.introductionSeen || !!incoming.introductionSeen || !!incoming.homeDismissed,
    homeDismissed: current.homeDismissed || !!incoming.homeDismissed,
  };
  useStore.setState(s => ({ accounts: { ...s.accounts, [key]: next } }));
  if (next.loaded) void AsyncStorage.setItem(storageKey(key), JSON.stringify({ introductionSeen: next.introductionSeen, homeDismissed: next.homeDismissed })).catch(() => {});
}

export function useProPreferences(userId: string | null | undefined): ProPreferences {
  const key = keyFor(userId);
  const value = useStore(s => s.accounts[key] ?? EMPTY);
  useEffect(() => {
    if (loading.has(key) || useStore.getState().accounts[key]?.loaded) return;
    loading.add(key);
    void Promise.all([AsyncStorage.getItem(storageKey(key)), key === 'guest' ? Promise.resolve(null) : AsyncStorage.getItem(storageKey('guest'))]).then(([raw, guestRaw]) => {
      let saved: Partial<ProPreferences> = {};
      try {
        saved = raw ? JSON.parse(raw) : {};
        const guest = guestRaw ? JSON.parse(guestRaw) : {};
        saved.introductionSeen = saved.introductionSeen === true || guest.introductionSeen === true;
        saved.homeDismissed = saved.homeDismissed === true || guest.homeDismissed === true;
      } catch { saved = { introductionSeen: true, homeDismissed: true }; }
      merge(key, { introductionSeen: saved.introductionSeen === true, homeDismissed: saved.homeDismissed === true, loaded: true });
    }).catch(() => merge(key, { introductionSeen: true, homeDismissed: true, loaded: true }))
      .finally(() => loading.delete(key));
  }, [key]);
  return value;
}

export function markProIntroductionSeen(userId: string | null | undefined) {
  merge(keyFor(userId), { introductionSeen: true });
}
export function dismissHomeProCard(userId: string | null | undefined) {
  merge(keyFor(userId), { introductionSeen: true, homeDismissed: true });
}
export function receiveProPreferences(userId: string, remote: Pick<ProPreferences, 'introductionSeen' | 'homeDismissed' | 'reminders'>) {
  merge(userId, { ...remote, remoteLoaded: true });
}
