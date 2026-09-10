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

/** Ids (as passed to OneSignal's startDefault) of the activities the OS
 * still shows live — active or stale, not ended. Null where the module is
 * absent (Android, web, a dev client built without it): "unknown" must not
 * read as "none", or the lifecycle would forget every id and start twins. */
export function listLiveActivityIds(): Promise<string[] | null> {
  return native?.listActivityIds() ?? Promise.resolve(null);
}

/** End every activity of ours except the ids in `keep`. Resolves with how
 * many were ended. */
export function endOrphanLiveActivities(keep: string[]): Promise<number> {
  return native?.endActivities(keep) ?? Promise.resolve(0);
}
