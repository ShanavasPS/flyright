/** A home base city's photo (docs/home-base.md): Wikipedia's, looked up once
 * per city by convex/cityPhoto and shared, unless the traveller chose their
 * own photo or none on this phone. The answer is kept on the phone too, so
 * the photo still shows offline; expo-image keeps the file itself. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAction, useQuery } from 'convex/react';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect } from 'react';
import { create } from 'zustand';

import { api } from '../../convex/_generated/api';
import { cityPhotoKey } from '../../convex/cityPhotoShared';
import { countryName } from '@/services/airports';
import type { HomePlace } from '@/services/home-base';

export interface WikiPhoto {
  url: string;
  credit: string | null;
  licence: string | null;
  page: string | null;
}

/** What this phone shows for a city: Wikipedia's photo (the default), the
 * traveller's own file, or the flag. */
export type PhotoChoice = { kind: 'wiki' } | { kind: 'none' } | { kind: 'own'; uri: string };

export type CityPhoto =
  | { status: 'loading' }
  | { status: 'none'; choice: PhotoChoice['kind'] }
  | { status: 'ok'; url: string; own: boolean; credit: string | null; licence: string | null; page: string | null };

interface Stored {
  wiki: Record<string, WikiPhoto | null>;
  choices: Record<string, PhotoChoice>;
}

const STORAGE = 'city-photos:v1';
const useStore = create<Stored & { loaded: boolean }>(() => ({ wiki: {}, choices: {}, loaded: false }));
let loading = false;
const asked = new Set<string>();

function persist() {
  const { wiki, choices } = useStore.getState();
  void AsyncStorage.setItem(STORAGE, JSON.stringify({ wiki, choices })).catch(() => {});
}

function ensureLoaded() {
  if (loading || useStore.getState().loaded) return;
  loading = true;
  void AsyncStorage.getItem(STORAGE)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as Partial<Stored>) : {};
      useStore.setState((s) => ({
        wiki: { ...saved.wiki, ...s.wiki },
        choices: { ...saved.choices, ...s.choices },
        loaded: true,
      }));
    })
    .catch(() => useStore.setState({ loaded: true }))
    .finally(() => { loading = false; });
}

export const photoKey = (place: HomePlace) => cityPhotoKey(place.city, place.country);

/** The photo to show for a city, or its state while it is looked up. */
export function useCityPhoto(place: HomePlace | null | undefined, { wikiOnly = false }: { wikiOnly?: boolean } = {}): CityPhoto {
  const key = place?.city && place.country ? photoKey(place) : null;
  const kept = useStore((s) => (key ? s.wiki[key] : undefined));
  const stored = useStore((s) => (key ? s.choices[key] : undefined));
  const choice: PhotoChoice = wikiOnly || !stored ? { kind: 'wiki' } : stored;
  const remote = useQuery(api.cityPhoto.get, key && choice.kind === 'wiki' ? { city: place!.city, country: place!.country } : 'skip');
  const ensure = useAction(api.cityPhoto.ensure);

  useEffect(ensureLoaded, []);

  // Keep the server's answer on the phone for offline use.
  useEffect(() => {
    if (!key || remote === undefined || remote === null) return;
    const next = remote.status === 'ok' && remote.url
      ? { url: remote.url, credit: remote.credit, licence: remote.licence, page: remote.page }
      : null;
    const prev = useStore.getState().wiki[key];
    if (prev === undefined || JSON.stringify(prev) !== JSON.stringify(next)) {
      useStore.setState((s) => ({ wiki: { ...s.wiki, [key]: next } }));
      persist();
    }
  }, [key, remote]);

  // Nobody has looked this city up yet: ask the server to, once a session.
  useEffect(() => {
    if (!key || remote !== null || asked.has(key)) return;
    asked.add(key);
    void ensure({ city: place!.city, country: place!.country, countryName: countryName(place!.country) }).catch(() => asked.delete(key));
  }, [key, remote, ensure, place]);

  if (!key) return { status: 'none', choice: 'wiki' };
  if (choice.kind === 'own') return { status: 'ok', url: choice.uri, own: true, credit: null, licence: null, page: null };
  if (choice.kind === 'none') return { status: 'none', choice: 'none' };
  const photo = kept !== undefined ? kept : remote?.status === 'ok' && remote.url
    ? { url: remote.url, credit: remote.credit, licence: remote.licence, page: remote.page }
    : remote?.status === 'none' ? null : undefined;
  if (photo === undefined) return { status: 'loading' };
  if (photo === null) return { status: 'none', choice: 'wiki' };
  return { status: 'ok', own: false, ...photo };
}

export function usePhotoChoice(place: HomePlace | null | undefined): PhotoChoice {
  const key = place?.city && place.country ? photoKey(place) : null;
  return useStore((s) => (key ? s.choices[key] : undefined)) ?? { kind: 'wiki' };
}

const ownDir = () => new Directory(Paths.document, 'home-photos');

/** Show Wikipedia's photo, none, or a picked image (copied into the app's
 * documents: the picker's file is temporary). An own photo stays on this
 * phone. */
export async function setPhotoChoice(place: HomePlace, choice: { kind: 'wiki' } | { kind: 'none' } | { kind: 'own'; pickedUri: string }) {
  const key = photoKey(place);
  const previous = useStore.getState().choices[key];
  let next: PhotoChoice;
  if (choice.kind === 'own') {
    const dir = ownDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const target = new File(dir, `${key.replace(/[^A-Za-z0-9]+/g, '-')}-${Date.now().toString(36)}.jpg`);
    await new File(choice.pickedUri).copy(target);
    next = { kind: 'own', uri: target.uri };
  } else {
    next = choice;
  }
  if (previous?.kind === 'own') {
    try { new File(previous.uri).delete(); } catch { /* already gone */ }
  }
  useStore.setState((s) => ({ choices: { ...s.choices, [key]: next } }));
  persist();
}
