/** Keeps the travel-day OS surfaces in lockstep with the journal — the iOS
 * Live Activity and the Android Live Update (promoted ongoing notification on
 * 16+, classic progress notification below). Reconcile is idempotent and
 * serialized like its sibling reconcileNotifications: read the DB, compute
 * each flight's travel window, present/update surfaces for in-window trips,
 * tear down the rest.
 *
 * Re-posting rule: a notification is only (re)posted when its rendered
 * content changes, so a user who swipes it away isn't nagged — the next
 * stage tap or flight fact brings it back, nothing else does. */

import { isNull } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { Observe } from 'expo-observe';
import { Platform } from 'react-native';
import Storage from 'expo-sqlite/kv-store';

import { db } from '@/db/client';
import { journeys } from '@/db/schema';
import type { FlightStatus } from '@/services/flight-lookup';
import {
  endTravelActivity,
  getActivityId,
  startTravelActivity,
  updateTravelActivity,
} from '@/services/live-activity';
import { getPushEnabled } from '@/services/notifications';
import {
  EMPTY_FACTS,
  liveContent,
  travelWindow,
  type FlightFacts,
  type LiveContent,
  type TravelJourney,
} from '@/services/travel-day';
import {
  endTravelLiveUpdate,
  postTravelLiveUpdate,
  type LiveUpdateContent,
} from '../../modules/flyright-live-update';
import { endOrphanLiveActivities } from '../../modules/flyright-live-activities';
import {
  allTravelDayRows,
  markActivity,
  mergeFlightStages,
  rowToState,
} from '@/services/travel-day-store';

const ENABLED_KEY = 'travel-day-enabled';
const CHANNEL_ID = 'travel-day';
const notificationId = (journeyId: string) => `travel-day-${journeyId}`;
const postedKey = (journeyId: string) => `travel-day-posted-${journeyId}`;
const factsKey = (journeyId: string) => `travel-facts-${journeyId}`;

/** Settings switch for the live travel-day surfaces, default on. Separate
 * from the push toggle: it controls presented surfaces, not scheduled
 * reminders. */
export function getTravelDayEnabled(): boolean {
  return Storage.getItemSync(ENABLED_KEY) !== 'off';
}

export function setTravelDayEnabled(enabled: boolean): void {
  Storage.setItemSync(ENABLED_KEY, enabled ? 'on' : 'off');
  void reconcileTravelDay();
}

/** Latest live facts observed for a journey, cached so the notification and
 * timeline can render between lookups. Also folds actual departure/arrival
 * into the stage state, so a landed flight closes its own timeline. */
export async function noteFlightFacts(journeyId: string, status: FlightStatus): Promise<void> {
  const facts: FlightFacts = {
    delayMinutes: status.delayMinutes,
    gate: status.gate ?? null,
    terminal: status.terminal ?? null,
    checkInDesk: status.checkInDesk ?? null,
    baggageBelt: status.baggageBelt ?? null,
    boardingTime: status.boardingTime ?? null,
    estimatedDeparture: status.estimatedDeparture ?? null,
    actualDeparture: status.actualDeparture ?? null,
    estimatedArrival: status.estimatedArrival ?? null,
    actualArrival: status.actualArrival ?? null,
  };
  Storage.setItemSync(factsKey(journeyId), JSON.stringify(facts));
  await mergeFlightStages(journeyId, facts);
}

export function getFlightFacts(journeyId: string): FlightFacts {
  const raw = Storage.getItemSync(factsKey(journeyId));
  if (!raw) return EMPTY_FACTS;
  try {
    return { ...EMPTY_FACTS, ...JSON.parse(raw) };
  } catch {
    return EMPTY_FACTS;
  }
}

/** Silent channel: every update replaces in place without a sound or buzz —
 * the trip reminder already alerted, this surface is for glancing. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Travel day',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
    vibrationPattern: undefined,
  });
}

/** The subset of LiveContent the Android native module renders. */
const toLiveUpdate = (content: LiveContent): LiveUpdateContent => ({
  title: content.title,
  headline: content.headline,
  subtitle: content.subtitle,
  fromCode: content.fromCode,
  toCode: content.toCode,
  flightLabel: content.flightLabel,
  progress: content.progress,
  compactLabel: content.compactLabel,
  gate: content.gate,
  terminal: content.terminal,
  delayLabel: content.delayLabel,
  emphasis: content.emphasis,
});

let reconciling: Promise<void> | null = null;

/** Serialized like reconcileNotifications — mutations can fire it blindly. */
export function reconcileTravelDay(): Promise<void> {
  const run = (reconciling ?? Promise.resolve()).then(doReconcile).catch((error) => {
    console.warn('[travel-day-lifecycle] reconcile failed', error);
  });
  reconciling = run;
  return run;
}

async function teardown(
  journeyId: string,
  reason: 'ended' | 'disabled',
  finalContent?: Parameters<typeof endTravelActivity>[1],
): Promise<void> {
  await Notifications.dismissNotificationAsync(notificationId(journeyId));
  endTravelActivity(journeyId, finalContent);
  // Android: a final card lingers dismissible when the window closed
  // naturally; a disable removes the surface outright.
  endTravelLiveUpdate(journeyId, finalContent && toLiveUpdate(finalContent));
  Storage.removeItemSync(postedKey(journeyId));
  if (reason === 'ended') {
    await markActivity(journeyId, { endedAt: new Date().toISOString() });
    Storage.removeItemSync(factsKey(journeyId));
    Observe.logEvent('travel_day.activity_ended', { attributes: { reason } });
  }
}

async function doReconcile(): Promise<void> {
  const stateRows = await allTravelDayRows();
  const byJourney = new Map(stateRows.map((row) => [row.journeyId, row]));

  // The Android ongoing notification needs the push permission; the iOS Live
  // Activity has its own OS consent, so only our own switch gates it there.
  const enabled =
    getTravelDayEnabled() && (Platform.OS === 'ios' || (await getPushEnabled()));
  if (!enabled) {
    for (const row of stateRows) {
      if (row.activityStartedAt && !row.endedAt) await teardown(row.journeyId, 'disabled');
    }
    await sweepOrphanActivities([]);
    return;
  }

  await ensureChannel();
  const now = new Date();
  const journeyRows: TravelJourney[] = await db
    .select()
    .from(journeys)
    .where(isNull(journeys.deletedAt));

  for (const j of journeyRows) {
    const row = byJourney.get(j.id);
    const state = rowToState(row);
    const { phase } = travelWindow(j, state, now);

    if (phase === 'reminder' || phase === 'live') {
      const facts = getFlightFacts(j.id);
      const content = liveContent(j, state, facts, now);
      // Progress is bucketed to 2% so the in-flight plane creeps along on
      // each reconcile without re-posting for sub-pixel changes.
      const fingerprint = [
        content.title,
        content.headline,
        content.subtitle,
        content.gate ?? '',
        content.depTime ?? '',
        content.arrTime ?? '',
        Math.round(content.progress * 50),
      ].join('|');
      // Unchanged content only skips work when the surface actually exists —
      // on iOS a stale fingerprint (app update mid-window) must not block the
      // first Live Activity start.
      const surfaceExists = Platform.OS !== 'ios' || !!getActivityId(j.id);
      if (surfaceExists && Storage.getItemSync(postedKey(j.id)) === fingerprint) continue;

      if (Platform.OS === 'ios') {
        // Lock-screen Live Activity: started locally once, refreshed through
        // the OneSignal REST proxy afterwards.
        if (getActivityId(j.id)) updateTravelActivity(j.id, content);
        else startTravelActivity(j, content);
      } else {
        // Native Live Update: promoted ProgressStyle card on Android 16+,
        // ongoing progress notification below. The dismiss clears the legacy
        // expo-notifications sticky that pre-module builds posted under this
        // id — a no-op everywhere else.
        void Notifications.dismissNotificationAsync(notificationId(j.id)).catch(() => {});
        postTravelLiveUpdate(j.id, toLiveUpdate(content));
      }
      Storage.setItemSync(postedKey(j.id), fingerprint);
      if (!row?.activityStartedAt) {
        await markActivity(j.id, { activityStartedAt: now.toISOString() });
        Observe.logEvent('travel_day.activity_started');
      }
    } else if (row && row.activityStartedAt && !row.endedAt) {
      // The final render lingers dimmed after the end — give it the real
      // last state ("Landed in LHR") instead of a generic goodbye.
      await teardown(j.id, 'ended', liveContent(j, state, getFlightFacts(j.id), now));
    }
  }

  if (Platform.OS === 'ios') {
    const keep = journeyRows
      .filter((j) => {
        const { phase } = travelWindow(j, rowToState(byJourney.get(j.id)), now);
        return phase === 'reminder' || phase === 'live';
      })
      .map((j) => getActivityId(j.id))
      .filter((id): id is string => !!id);
    await sweepOrphanActivities(keep);
  }
}

/** The OS is the source of truth for what's on the lock screen; the store
 * above only remembers one id per journey. Anything ActivityKit still holds
 * that isn't a remembered, in-window activity — a journey deleted around the
 * lifecycle, a start whose id was lost, a card carried across an update —
 * gets ended here so it can't sit next to the real one for hours. */
async function sweepOrphanActivities(keep: string[]): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const ended = await endOrphanLiveActivities(keep);
    if (ended > 0) Observe.logEvent('travel_day.orphan_activities_ended', { attributes: { count: ended } });
  } catch (error) {
    console.warn('[travel-day-lifecycle] orphan sweep failed', error);
  }
}
