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

import { Platform } from 'react-native';
import { OneSignal } from 'react-native-onesignal';
import Storage from 'expo-sqlite/kv-store';

import { ONESIGNAL_APP_ID } from '@/constants/config';
import type { LiveContent, TravelJourney } from '@/services/travel-day';

const activityKey = (journeyId: string) => `travel-activity-id-${journeyId}`;

const supported = () => Platform.OS === 'ios' && !!ONESIGNAL_APP_ID;

export function initLiveActivities(): void {
  if (!supported()) return;
  OneSignal.LiveActivities.setupDefault({
    enablePushToStart: true,
    enablePushToUpdate: true,
  });
}

export function getActivityId(journeyId: string): string | null {
  return Storage.getItemSync(activityKey(journeyId));
}

/** The mutable half the widget renders — must stay JSON-serializable. */
function contentState(content: LiveContent) {
  return {
    subtitle: content.subtitle,
    progress: content.progress,
    stageLabel: content.stageLabel ?? '',
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
  Storage.setItemSync(activityKey(journey.id), activityId);
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
  if (!supported()) return;
  const finalState = content
    ? contentState(content)
    : {
        subtitle: 'Travel day complete',
        progress: 1,
        stageLabel: '',
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
