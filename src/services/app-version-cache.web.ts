import type { AppVersionResponse } from './app-version';

export function cachedAppVersion(): AppVersionResponse | undefined { return undefined; }
export function cacheAppVersion(_value: AppVersionResponse) {}
