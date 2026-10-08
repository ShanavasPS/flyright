/** Over-the-air JavaScript updates (expo-updates, served by EAS Update).
 *
 * The binary checks for an update by itself at every launch (`updates.
 * checkAutomatically: ON_LOAD` in app.json) and runs whatever it downloaded
 * at the launch after. That alone is slow for a phone that is never cold
 * started, so the app also looks while it runs: on a return to the
 * foreground, at most hourly, it downloads a waiting update, and when the
 * traveller has been away long enough that nothing is in progress, it
 * restarts into the downloaded one. The decisions are pure and tested here;
 * `components/ota-update-sync` listens to AppState and calls them.
 *
 * Updates reach only binaries with the same runtime version, and the policy
 * is `appVersion`: every release bumps `expo.version`, so a 1.2.3 phone gets
 * 1.2.3 updates only. An update therefore may change JavaScript and assets
 * alone — anything native (a package, a plugin, app.json) still ships as a
 * build. See docs/release-workflow.md → Over-the-air updates. */

import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

/** A foreground check at most this often. The launch check is the OS's. */
export const FOREGROUND_CHECK_GAP_MS = 60 * 60_000;
/** Away this long before a downloaded update may restart the app on return:
 * the traveller is coming back, not in the middle of something. */
export const RELOAD_AFTER_AWAY_MS = 12 * 60 * 60_000;

/** Release builds on a phone or simulator only — the Updates API is
 * unavailable in development builds and does nothing on web. */
export function updatesActive(): boolean {
  return Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;
}

/** Whether a return to the foreground should look for an update. */
export function shouldCheck(lastCheckAt: number, now: number): boolean {
  return now - lastCheckAt >= FOREGROUND_CHECK_GAP_MS;
}

/** Whether a return to the foreground should restart into a downloaded
 * update: one is waiting, and the app sat in the background long enough. */
export function shouldReload(pending: boolean, backgroundedAt: number | null, now: number): boolean {
  return pending && backgroundedAt !== null && now - backgroundedAt >= RELOAD_AFTER_AWAY_MS;
}

/** Download the update the server has for this runtime, if any. Resolves
 * true when a new one is now waiting for the next launch or reload. Never
 * throws: a check from an airport's Wi-Fi fails like any other request. */
export async function fetchPendingUpdate(): Promise<boolean> {
  if (!updatesActive()) return false;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const fetched = await Updates.fetchUpdateAsync();
    return fetched.isNew;
  } catch (error) {
    console.warn('[ota-update] check failed', error);
    return false;
  }
}

/** The running update for the version line in Profile: "update 3f2a9c1d
 * (production)" when an over-the-air update is running, '' for the bundle
 * the binary shipped with. Support reads it next to the build number. */
export function describeRunningUpdate(): string {
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return '';
  const id = Updates.updateId.replace(/-/g, '').slice(0, 8);
  return Updates.channel ? `update ${id} (${Updates.channel})` : `update ${id}`;
}
