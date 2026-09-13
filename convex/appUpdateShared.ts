import { isVersion } from '../src/services/app-version';

export type StorePlatform = 'ios' | 'android';

export function storeVersion(response: unknown): string | null {
  if (!response || typeof response !== 'object' || !('latest' in response)) return null;
  const latest = response.latest;
  if (!latest || typeof latest !== 'object' || !('version' in latest)) return null;
  return typeof latest.version === 'string' && latest.version.length <= 40 && isVersion(latest.version)
    ? latest.version : null;
}

/** Subscription app_version is reported by the native OneSignal SDK.
 * Filter each platform separately: the two stores rarely release together.
 * This is public release news and also reaches opted-in anonymous installs;
 * private People/support pushes still require the secret recipient alias. */
export function updatePushPayload(platform: StorePlatform, version: string, idempotencyKey: string) {
  return {
    target_channel: 'push',
    filters: [{ field: 'app_version', relation: '<', value: version }],
    isIos: platform === 'ios',
    isAndroid: platform === 'android',
    isAnyWeb: false,
    isHuawei: false,
    isAdm: false,
    headings: { en: 'FlyRight update available' },
    contents: { en: `FlyRight ${version} is now available. Open Settings to see what's new and update.` },
    // Settings exists in older binaries that predate the What's new page.
    data: { url: 'https://getflyright.com/settings', attention: 'update', version },
    ios_badgeType: 'SetTo',
    ios_badgeCount: 1,
    ios_interruption_level: 'passive',
    android_group: 'flyright-attention-update',
    collapse_id: 'flyright-app-update',
    // If a phone stays offline for days, its next launch will check the
    // store. Avoid a much older announcement arriving after an upgrade.
    ttl: 86400,
    idempotency_key: idempotencyKey,
  };
}
