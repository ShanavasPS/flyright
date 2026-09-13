import Storage from 'expo-sqlite/kv-store';
import { isVersion, type AppVersionResponse } from './app-version';

const KEY = 'last-store-release';

/** Only advisory release information is persisted. A cached force-update
 * decision must never block an offline launch. */
export function cachedAppVersion(): AppVersionResponse | undefined {
  try {
    const value = JSON.parse(Storage.getItemSync(KEY) ?? 'null') as AppVersionResponse | null;
    if (!value?.latest || !isVersion(value.latest.version)) return undefined;
    return { ...value, valid: true, minVersion: '1.0.0' };
  } catch { return undefined; }
}

export function cacheAppVersion(value: AppVersionResponse) {
  if (value.latest && isVersion(value.latest.version)) {
    Storage.setItemSync(KEY, JSON.stringify({ ...value, valid: true, minVersion: '1.0.0' }));
  }
}
