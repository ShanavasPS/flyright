/** JS boundary for looking at the Live Activities iOS still shows for the
 * app — the piece OneSignal's JS SDK lacks. The travel-day lifecycle only
 * remembers one activity id per journey; anything else on the lock screen
 * (a journey that vanished from the journal, a start whose id was lost, an
 * activity carried across an update) would otherwise linger until the OS
 * expires it hours later. The native module exists only in iOS binaries;
 * elsewhere every call resolves to "nothing there". */

import { requireOptionalNativeModule, type NativeModule } from 'expo';

declare class LiveActivitiesModule extends NativeModule {
  listActivityIds(): Promise<string[]>;
  endActivities(except: string[]): Promise<number>;
}

const native = requireOptionalNativeModule<LiveActivitiesModule>('FlyRightLiveActivities');

/** Activity ids (as passed to OneSignal's startDefault) the OS still holds. */
export function listLiveActivityIds(): Promise<string[]> {
  return native?.listActivityIds() ?? Promise.resolve([]);
}

/** End every activity of ours except the ids in `keep`. Resolves with how
 * many were ended. */
export function endOrphanLiveActivities(keep: string[]): Promise<number> {
  return native?.endActivities(keep) ?? Promise.resolve(0);
}
