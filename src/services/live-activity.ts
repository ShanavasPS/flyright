/** iOS Live Activity boundary for the travel-day surfaces.
 *
 * Uses OneSignal's DefaultLiveActivityAttributes flow: `startDefault` renders
 * the widget locally with initial content and registers its update token with
 * OneSignal; every later change goes through our /api/live-activity proxy,
 * which calls OneSignal's REST update/end endpoints (APNs push under the
 * hood — updates therefore only render on real devices, not simulators).
 *
 * The activity id is the journey id plus a random suffix so the public proxy
 * can't be aimed at someone's widget by guessing the natural key. The dict
 * keys sent here are the contract with targets/FlyRightWidget/
 * FlyRightLiveActivity.swift — change them together. */

import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { OneSignal } from 'react-native-onesignal';
import Storage from 'expo-sqlite/kv-store';

import { ONESIGNAL_APP_ID } from '@/constants/config';
import type { LiveContent, TravelJourney } from '@/services/travel-day';

const activityKey = (journeyId: string) => `travel-activity-id-${journeyId}`;

// Reinstalls and app updates kill OS-level Live Activities, but the id
// persisted below outlives them — without a liveness check (the JS SDK has
// none) the app would "update" a dead activity forever and never restart it.
// Stamping ids with the native build catches every install boundary; an id
// from another build is treated as dead.
const buildStamp = () =>
  `${Application.nativeApplicationVersion ?? '0'}(${Application.nativeBuildVersion ?? '0'})`;

const supported = () => Platform.OS === 'ios' && !!ONESIGNAL_APP_ID;

export function initLiveActivities(): void {
  if (!supported()) return;
  OneSignal.LiveActivities.setupDefault({
    enablePushToStart: true,
    enablePushToUpdate: true,
  });
}

/** The journey's activity id, or null if none was started this app build.
 * Stored as `<buildStamp>|<id>`; a stamp mismatch (or a legacy unstamped
 * value) means the activity predates the current install and is gone from
 * the OS — the caller should start a fresh one. */
export function getActivityId(journeyId: string): string | null {
  const stored = Storage.getItemSync(activityKey(journeyId));
  if (!stored) return null;
  const sep = stored.indexOf('|');
  const stamp = sep === -1 ? '' : stored.slice(0, sep);
  const id = sep === -1 ? stored : stored.slice(sep + 1);
  if (stamp === buildStamp()) return id;
  // In case the OS did carry the activity across the update, end the orphan
  // remotely so the restart below can't leave two cards on the lock screen.
  Storage.removeItemSync(activityKey(journeyId));
  endById(id);
  return null;
}

/** The mutable half the widget renders — must stay JSON-serializable. */
function contentState(content: LiveContent) {
  return {
    subtitle: content.subtitle,
    progress: content.progress,
    stageLabel: content.stageLabel ?? '',
    compactLabel: content.compactLabel,
    gate: content.gate ?? '',
    terminal: content.terminal ?? '',
    delayLabel: content.delayLabel ?? '',
    emphasis: content.emphasis,
  };
}

/** Start (or no-op if already started) the journey's Live Activity. */
export function startTravelActivity(journey: TravelJourney, content: LiveContent): void {
  if (!supported() || getActivityId(journey.id)) return;
  const activityId = `${journey.id}~${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  OneSignal.LiveActivities.startDefault(
    activityId,
    { journeyId: journey.id, title: content.title },
    contentState(content),
  );
  Storage.setItemSync(activityKey(journey.id), `${buildStamp()}|${activityId}`);
}

/** Push fresh content to an already-started activity via the server proxy.
 * Fire-and-forget: a missed update is corrected by the next one. */
export function updateTravelActivity(journeyId: string, content: LiveContent): void {
  const activityId = getActivityId(journeyId);
  if (!supported() || !activityId) return;
  void fetch('/api/live-activity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ activityId, event: 'update', contentState: contentState(content) }),
  }).catch(() => {});
}

/** End the activity and forget its id (window closed or feature toggled
 * off). The final content renders in the dimmed post-end state, so ends
 * always carry one — a generic goodbye when the caller has none. */
export function endTravelActivity(journeyId: string, content?: LiveContent): void {
  const activityId = getActivityId(journeyId);
  if (!activityId) return;
  Storage.removeItemSync(activityKey(journeyId));
  endById(activityId, content);
}

/** Fire-and-forget REST end for an activity id whose storage entry is
 * already gone (or about to be). */
function endById(activityId: string, content?: LiveContent): void {
  if (!supported()) return;
  const finalState = content
    ? contentState(content)
    : {
        subtitle: 'Travel day complete',
        progress: 1,
        stageLabel: '',
        compactLabel: 'Done',
        gate: '',
        terminal: '',
        delayLabel: '',
        emphasis: 'none',
      };
  void fetch('/api/live-activity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ activityId, event: 'end', contentState: finalState }),
  }).catch(() => {});
}
