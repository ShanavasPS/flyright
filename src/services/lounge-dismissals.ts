/** "Not today" on the lounge sheet (docs/lounges.md, decision 6): the
 * travel-day lounge card stays hidden for that flight only, on this phone. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';

const STORAGE = 'lounge-not-today:v1';
/** Kept for a while after the flight, then forgotten. */
const KEEP_DAYS = 14;
const useStore = create<{ hidden: Record<string, number>; loaded: boolean }>(() => ({ hidden: {}, loaded: false }));
let loading = false;

function ensureLoaded() {
  if (loading || useStore.getState().loaded) return;
  loading = true;
  void AsyncStorage.getItem(STORAGE)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
      const kept = Object.fromEntries(Object.entries(saved).filter(([, at]) => at > cutoff));
      useStore.setState((s) => ({ hidden: { ...kept, ...s.hidden }, loaded: true }));
    })
    .catch(() => useStore.setState({ loaded: true }))
    .finally(() => { loading = false; });
}

export function useLoungesHidden(journeyId: string): boolean {
  useEffect(ensureLoaded, []);
  return useStore((s) => journeyId in s.hidden);
}

export function hideLoungesFor(journeyId: string) {
  useStore.setState((s) => ({ hidden: { ...s.hidden, [journeyId]: Date.now() } }));
  void AsyncStorage.setItem(STORAGE, JSON.stringify(useStore.getState().hidden)).catch(() => {});
}
