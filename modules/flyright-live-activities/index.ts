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
  endFollowerActivities(except: string[]): Promise<number>;
  setStaleDate(activityId: string, atSeconds: number): Promise<boolean>;
  staleDateOf(activityId: string): Promise<number>;
  updateActivityContent(activityId: string, state: Record<string, unknown>): Promise<boolean>;
}

const native = requireOptionalNativeModule<LiveActivitiesModule>('FlyRightLiveActivities');

/** Ids (as passed to OneSignal's startDefault) of the activities the OS
 * still shows live — active or stale, not ended. Null where the module is
 * absent (Android, web, a dev client built without it): "unknown" must not
 * read as "none", or the lifecycle would forget every id and start twins. */
export function listLiveActivityIds(): Promise<string[] | null> {
  return native?.listActivityIds() ?? Promise.resolve(null);
}

/** End traveller activities except the ids in `keep`. Follower activities
 * have a separate authenticated cleanup path. Resolves with how many ended. */
export function endOrphanLiveActivities(keep: string[]): Promise<number> {
  return native?.endActivities(keep) ?? Promise.resolve(0);
}

export const supportsFollowerActivities = () => !!native?.endFollowerActivities;

export function endOrphanFollowerActivities(keep: string[]): Promise<number> {
  return native?.endFollowerActivities?.(keep) ?? Promise.resolve(0);
}

/** Tell iOS when the activity's card stops being trustworthy, so it rebuilds
 * the view there (see the widget's ClockText). Pushes carry their own stale
 * date; this is the device-side half, for the render that `startDefault`
 * makes before any push exists. Resolves false when the activity is gone. */
export function setLiveActivityStaleDate(activityId: string, at: number): Promise<boolean> {
  return native?.setStaleDate?.(activityId, at / 1000) ?? Promise.resolve(false);
}

/** Rewrite the card's content straight through ActivityKit, with no network.
 * The server proxy is a fetch, so it cannot reach a phone in the air — which
 * is precisely when the widget's countdown runs out and its archived clock
 * starts drawing nonsense. Resolves false when the activity is gone. */
export function updateLiveActivityLocally(
  activityId: string,
  state: Record<string, unknown>,
): Promise<boolean> {
  return native?.updateActivityContent?.(activityId, state) ?? Promise.resolve(false);
}

/** The stale date iOS holds for the activity, in ms — 0 for none. Used by the
 * release checks to prove the deadline stuck, not by the app itself. */
export function liveActivityStaleDate(activityId: string): Promise<number> {
  return native?.staleDateOf?.(activityId).then((s) => s * 1000) ?? Promise.resolve(0);
}
