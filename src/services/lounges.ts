/** The lounge directory for a trip's airports (docs/lounges.md), from
 * convex/lounges and kept on the phone so the lounge card still works
 * airside without signal. Only airport codes are sent. The server's answer
 * always replaces what is kept, so an airport the server empties (a wrong
 * entry pulled) disappears here too. Not on web: no lounge surfaces there. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from 'convex/react';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { api } from '../../convex/_generated/api';
import { isAirportCode, MAX_AIRPORTS } from '../../convex/loungeShared';
import { type Lounge } from '@/services/lounge-access';

const STORAGE = 'lounges:v1';
const useStore = create<{ byAirport: Record<string, Lounge[]>; loaded: boolean }>(() => ({ byAirport: {}, loaded: false }));
let loading = false;

function ensureLoaded() {
  if (loading || useStore.getState().loaded) return;
  loading = true;
  void AsyncStorage.getItem(STORAGE)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as Record<string, Lounge[]>) : {};
      useStore.setState((s) => ({ byAirport: { ...saved, ...s.byAirport }, loaded: true }));
    })
    .catch(() => useStore.setState({ loaded: true }))
    .finally(() => { loading = false; });
}

function persist() {
  void AsyncStorage.setItem(STORAGE, JSON.stringify(useStore.getState().byAirport)).catch(() => {});
}

/** The airports a question can carry: distinct, valid, at most MAX_AIRPORTS. */
export function loungeAirports(codes: (string | null | undefined)[]): string[] {
  const valid = codes.map((c) => c?.trim().toUpperCase() ?? '').filter(isAirportCode);
  return [...new Set(valid)].sort().slice(0, MAX_AIRPORTS);
}

/** Every lounge at these airports: the server's answer, or the phone's copy
 * while offline. Undefined until either is known; [] for airports the
 * directory doesn't cover. */
export function useLounges(codes: (string | null | undefined)[]): Lounge[] | undefined {
  const web = Platform.OS === 'web';
  const key = loungeAirports(codes).join(',');
  const airports = useMemo(() => (key ? key.split(',') : []), [key]);
  const remote = useQuery(api.lounges.atAirports, !web && airports.length ? { airports } : 'skip');
  const byAirport = useStore((s) => s.byAirport);
  const loaded = useStore((s) => s.loaded);

  useEffect(ensureLoaded, []);

  useEffect(() => {
    if (!remote || !loaded) return;
    const next = { ...useStore.getState().byAirport };
    for (const airport of airports) next[airport] = remote.filter((l) => l.airport === airport);
    if (JSON.stringify(next) === JSON.stringify(useStore.getState().byAirport)) return;
    useStore.setState({ byAirport: next });
    persist();
  }, [remote, loaded, airports]);

  if (web || airports.length === 0) return [];
  if (remote) return remote;
  if (!loaded || airports.some((a) => !(a in byAirport))) return undefined;
  return airports.flatMap((a) => byAirport[a]);
}
