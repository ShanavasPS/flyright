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
import { getRandomValues } from 'expo-crypto';
import { Platform } from 'react-native';
import { OneSignal } from 'react-native-onesignal';
import Storage from 'expo-sqlite/kv-store';

import { ONESIGNAL_APP_ID } from '@/constants/config';
import type { LiveContent, TravelJourney } from '@/services/travel-day';

const activityKey = (journeyId: string) => `travel-activity-id-${journeyId}`;
const startedKey = (journeyId: string) => `travel-activity-started-${journeyId}`;

/** ActivityKit reports a just-requested activity a moment after the call
 * returns; a liveness sweep inside this grace period must not mistake it
 * for gone and start a twin. */
const START_GRACE_MS = 2 * 60_000;

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
    headline: content.headline,
    subtitle: content.subtitle,
    progress: content.progress,
    stageLabel: content.stageLabel ?? '',
    compactLabel: content.compactLabel,
    // Instants travel as ms (0 = unknown); the widget turns them into a
    // countdown that ticks on its own between pushes.
    departsAt: content.departsAt ?? 0,
    arrivesAt: content.arrivesAt ?? 0,
    countdownEnd: content.countdownEnd ?? 0,
    countdownKind: content.countdownKind ?? '',
    gate: content.gate ?? '',
    terminal: content.terminal ?? '',
    delayLabel: content.delayLabel ?? '',
    emphasis: content.emphasis,
    depTime: content.depTime ?? '',
    arrTime: content.arrTime ?? '',
  };
}

/** 128 bits from the platform CSPRNG, base36. The id is the only credential
 * the update proxy (/api/live-activity) sees, so it must not be predictable
 * — Hermes's Math.random is a plain xorshift. A dev client built before
 * expo-crypto was linked falls back rather than losing the lock screen. */
function randomSuffix(): string {
  try {
    const bytes = getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
  } catch {
    return `${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Start (or no-op if already started) the journey's Live Activity. */
export function startTravelActivity(journey: TravelJourney, content: LiveContent): void {
  if (!supported() || getActivityId(journey.id)) return;
  const activityId = `${journey.id}~${randomSuffix()}`;
  OneSignal.LiveActivities.startDefault(
    activityId,
    // Route and flight designator are immutable for the activity's lifetime,
    // so they ride in the attributes — updates and the dimmed post-end state
    // can never blank them. `title` stays as the pre-joined fallback for
    // widgets from builds that predate the route layout.
    {
      journeyId: journey.id,
      title: content.title,
      fromCode: content.fromCode,
      toCode: content.toCode,
      flightLabel: content.flightLabel,
    },
    contentState(content),
  );
  Storage.setItemSync(activityKey(journey.id), `${buildStamp()}|${activityId}`);
  Storage.setItemSync(startedKey(journey.id), String(Date.now()));
}

/** Ids this process has asked the server to end — an activity being torn
 * down must not be re-adopted from a listing taken a moment earlier. */
const recentlyEnded = new Set<string>();

/** Take over an activity the OS shows for this journey that we don't
 * remember — one the server push-started (ids `<journeyId>~srv…`), or a
 * start whose id was lost. From then on it's updated like our own. Returns
 * true when something was adopted. */
export function adoptLiveActivity(journeyId: string, liveIds: readonly string[]): boolean {
  if (!supported() || getActivityId(journeyId)) return false;
  const id = liveIds.find((x) => x.startsWith(`${journeyId}~`) && !recentlyEnded.has(x));
  if (!id) return false;
  Storage.setItemSync(activityKey(journeyId), `${buildStamp()}|${id}`);
  Storage.setItemSync(startedKey(journeyId), String(Date.now()));
  return true;
}

/** Drop the remembered id of an activity the OS no longer shows — iOS ends
 * every Live Activity eight hours after it starts, whatever the app does,
 * and the JS SDK never hears about it. Only ids outside the start grace
 * period are dropped; the next reconcile then starts a fresh activity (the
 * caller decides whether the window still warrants one). Returns true when
 * something was forgotten. */
export function forgetActivityIfDead(journeyId: string, liveIds: readonly string[]): boolean {
  const id = getActivityId(journeyId);
  if (!id || liveIds.includes(id)) return false;
  const started = Number(Storage.getItemSync(startedKey(journeyId)) ?? 0);
  if (started && Date.now() - started < START_GRACE_MS) return false;
  Storage.removeItemSync(activityKey(journeyId));
  Storage.removeItemSync(startedKey(journeyId));
  return true;
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
  Storage.removeItemSync(startedKey(journeyId));
  endById(activityId, content);
}

/** Fire-and-forget REST end for an activity id whose storage entry is
 * already gone (or about to be). */
function endById(activityId: string, content?: LiveContent): void {
  if (!supported()) return;
  recentlyEnded.add(activityId);
  const finalState = content
    ? contentState(content)
    : {
        headline: 'Trip complete',
        subtitle: 'Travel day complete',
        progress: 1,
        stageLabel: '',
        compactLabel: 'Done',
        departsAt: 0,
        arrivesAt: 0,
        countdownEnd: 0,
        countdownKind: '',
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
