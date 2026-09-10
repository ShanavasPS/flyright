import Storage from 'expo-sqlite/kv-store';

import type { TripVisibility } from '@/services/trip-visibility';

const KEY = 'trip-visibility-default';

/** The visibility a NEWLY added trip starts with (Settings → "Show new trips
 * to"). The add-trip screens show it and let the traveler change it for the
 * trip at hand; a per-trip change never writes back here. */
export function getDefaultTripVisibility(): TripVisibility {
  const value = Storage.getItemSync(KEY);
  return value === 'close' || value === 'private' ? value : 'circle';
}

export function setDefaultTripVisibility(value: TripVisibility) {
  Storage.setItemSync(KEY, value);
}
