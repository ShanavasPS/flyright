import { proLocked } from '@/services/purchases';
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
import { AppState, Platform } from 'react-native';
import Storage from 'expo-sqlite/kv-store';

import { db } from '@/db/client';
import { journeys } from '@/db/schema';
import type { FlightStatus } from '@/services/flight-lookup';
import {
  activityStartedAt,
  adoptLiveActivity,
  endTravelActivity,
  forgetActivityIfDead,
  getActivityId,
  startTravelActivity,
  updateTravelActivity,
} from '@/services/live-activity';
import { actionButtonLabel, liveUpdateLines } from '@/services/live-update-copy';
import { refreshHomeWidget } from '@/services/home-widget';
import { getPushEnabled } from '@/services/notifications';
import {
  chosenPlan,
  EMPTY_FACTS,
  liveContent,
  liveContentSchedule,
  STAGE_ORDER,
  stageRules,
  travelWindow,
  type FlightFacts,
  type LiveContent,
  type TravelJourney,
  type TravelStage,
} from '@/services/travel-day';
import { stagePlans } from '@/services/travel-day-plan';
import { homeCheck } from '@/services/home-base';
import { getHomeBase } from '@/services/home-base-store';
import { withRecord, type RecordRow } from '@/services/trip-record';
import { recordAirportFacts } from '@/services/trip-record-store';
import {
  endTravelLiveUpdate,
  postTravelLiveUpdate,
  takePendingNotificationStepMarks,
  type LiveUpdateContent,
} from '../../modules/flyright-live-update';
import {
  endOrphanLiveActivities,
  listLiveActivityIds,
  takePendingStepMarks,
} from '../../modules/flyright-live-activities';
import {
  advanceStage,
  allTravelDayRows,
  markActivity,
  mergeFlightStages,
  repairFlightStages,
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
    position: status.position ?? null,
    observedAt: new Date().toISOString(),
  };
  Storage.setItemSync(factsKey(journeyId), JSON.stringify(facts));
  await mergeFlightStages(journeyId, facts);
  // The trip keeps what the airport posted once these facts are gone.
  await recordAirportFacts(journeyId, facts);
}

/** The facts every surface draws from: the latest live facts, with the
 * trip's record filling what they lack — a gate the traveller typed, or
 * one the feed has since dropped. */
export function factsFor(row: { id: string } & RecordRow): FlightFacts {
  return withRecord(getFlightFacts(row.id), row);
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
const toLiveUpdate = (content: LiveContent): LiveUpdateContent => {
  // What leads now, in the notification's own two lines (liveLead).
  const lines = liveUpdateLines(content);
  return {
    title: content.title,
    headline: content.headline,
    subtitle: content.subtitle,
    fromCode: content.fromCode,
    toCode: content.toCode,
    flightLabel: content.flightLabel,
    progress: content.progress,
    compactLabel: content.compactLabel,
    countdownEnd: content.countdownEnd ?? 0,
    gate: content.gate,
    terminal: content.terminal,
    delayLabel: content.delayLabel,
    emphasis: content.emphasis,
    leadTitle: lines.title,
    leadText: lines.text,
    leadStrike: lines.strike,
    actionStage: content.action?.stage ?? '',
    actionLabel: content.action ? actionButtonLabel(content.action) : '',
    hasPass: content.hasPass,
    tone: content.tone,
  };
};

let reconciling: Promise<void> | null = null;

/** Serialized like reconcileNotifications — mutations can fire it blindly. */
export function reconcileTravelDay(): Promise<void> {
  const run = (reconciling ?? Promise.resolve())
    .then(doReconcile)
    .catch((error) => {
      console.warn('[travel-day-lifecycle] reconcile failed', error);
    })
    // After the surfaces, so it sees the stages they repaired; and whether
    // or not they are switched on — the next-flight card is for everyone.
    .then(refreshWidget)
    .catch((error) => {
      console.warn('[travel-day-lifecycle] widget refresh failed', error);
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

/** The journal as every travel-day surface reads it: live trips, their
 * stamps, and each leg's walk. */
async function readJournal() {
  const stateRows = await allTravelDayRows();
  const byJourney = new Map(stateRows.map((row) => [row.journeyId, row]));
  const allRows = await db.select().from(journeys).where(isNull(journeys.deletedAt));
  const journeyRows: (TravelJourney & RecordRow & { id: string })[] = allRows;
  // Each leg's walk depends on the legs around it (a connecting leg has
  // arrival steps, a direct flight none) — and so does how long its window
  // outlives the landing.
  // The home base decides the doors either side (leaving home or the hotel);
  // the steps the traveller chose in the editor win over the suggestion.
  const userId = allRows.find((j) => j.userId)?.userId ?? null;
  const suggestedOf = stagePlans(journeyRows, homeCheck(getHomeBase(userId), allRows));
  const planOf = (journeyId: string) => chosenPlan(rowToState(byJourney.get(journeyId)), suggestedOf(journeyId));
  return { stateRows, byJourney, journeyRows, planOf };
}

/** Mark a step of a trip's travel day done — the live card's button, and
 * the Lock Screen's and Dynamic Island's (MarkTravelStep) once the app
 * takes their marks. The same rules as a tap on the trip's timeline, so a
 * step that is not open yet (the gate before boarding time) is refused here
 * too. Does not reconcile; the callers do, once for a batch. */
async function recordStep(journeyId: string, stage: string): Promise<void> {
  if (!(STAGE_ORDER as readonly string[]).includes(stage)) return;
  const { byJourney, journeyRows, planOf } = await readJournal();
  const j = journeyRows.find((row) => row.id === journeyId);
  if (!j) return;
  const state = rowToState(byJourney.get(journeyId));
  const rules = stageRules(j, state, factsFor(j), new Date(), planOf(journeyId));
  await advanceStage(journeyId, stage as TravelStage, rules);
}

/** The live card's button: mark the step, then bring every surface up to it. */
export async function markTravelStep(journeyId: string, stage: TravelStage): Promise<void> {
  await recordStep(journeyId, stage);
  await reconcileTravelDay();
}

/** Record the steps marked on the Lock Screen or in the Dynamic Island (iOS,
 * FlyRightStepMarks) or from the notification's button (Android, StepMarks)
 * while the app was in the background or not yet listening. */
export async function applyPendingStepMarks(): Promise<void> {
  const marks = [...takePendingStepMarks(), ...takePendingNotificationStepMarks()].sort((a, b) => a.at - b.at);
  if (!marks.length) return;
  for (const mark of marks) await recordStep(mark.journeyId, mark.stage);
  Observe.logEvent('travel_day.step_marked_from_lock_screen', { attributes: { count: marks.length } });
  await reconcileTravelDay();
}

async function refreshWidget(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const { byJourney, journeyRows, planOf } = await readJournal();
  const rows = new Map(journeyRows.map((j) => [j.id, j]));
  refreshHomeWidget({
    rows: journeyRows,
    stateOf: (id) => rowToState(byJourney.get(id)),
    planOf,
    factsOf: (id) => {
      const row = rows.get(id);
      return row ? factsFor(row) : EMPTY_FACTS;
    },
    live: !(await proLocked()),
    now: new Date(),
  });
}

async function doReconcile(): Promise<void> {
  const { stateRows, byJourney, journeyRows, planOf } = await readJournal();

  // The Android ongoing notification needs the push permission; the iOS Live
  // Activity has its own OS consent, so only our own switch gates it there.
  const enabled =
    !(await proLocked()) && getTravelDayEnabled() && (Platform.OS === 'ios' || (await getPushEnabled()));
  if (!enabled) {
    for (const row of stateRows) {
      if (row.activityStartedAt && !row.endedAt) await teardown(row.journeyId, 'disabled');
    }
    await sweepOrphanActivities([]);
    return;
  }

  await ensureChannel();
  const now = new Date();

  // iOS ends every Live Activity eight hours after it starts, silently: the
  // id we remember then points at a dimmed leftover that swallows updates.
  // Ask the OS what is actually live and forget the rest, so the loop below
  // starts a fresh activity instead of updating a dead one all travel day.
  if (Platform.OS === 'ios') {
    const live = await listLiveActivityIds().catch(() => null);
    if (live) {
      for (const j of journeyRows) {
        if (forgetActivityIfDead(j.id, live)) {
          Storage.removeItemSync(postedKey(j.id));
          Observe.logEvent('travel_day.activity_expired');
        }
        // The server push-starts a fresh activity once ours has expired
        // (convex/liveInternal.ts startActivity); make it ours so updates
        // and the orphan sweep below treat it as the journey's own.
        if (adoptLiveActivity(j.id, live)) {
          Storage.removeItemSync(postedKey(j.id));
          Observe.logEvent('travel_day.activity_adopted');
        }
      }
    }
  }

  for (const j of journeyRows) {
    const row = byJourney.get(j.id);
    const state = await repairFlightStages(j.id, rowToState(row), j);
    const plan = planOf(j.id);
    const { phase, liveAt } = travelWindow(j, state, now, plan);

    if (phase === 'reminder' || phase === 'live') {
      // The eight-hour cap again: an activity started at T−24h is dead before
      // boarding. iOS activities start at T−4h (the live phase), or earlier
      // once the traveller has tapped a step — their travel day has begun.
      // One that already exists keeps updating through the reminder phase.
      if (Platform.OS === 'ios' && phase === 'reminder' && !state.stage && !getActivityId(j.id)) continue;
      const facts = factsFor(j);
      const content = liveContent(j, state, facts, now, plan);
      // An activity started by an early tap would run out of its eight hours
      // in the air. Swap it for a fresh one once the live phase has opened —
      // never from a background run, where ActivityKit refuses the request
      // (a launch reads 'inactive' or 'unknown' before it reads 'active').
      const startedAt = Platform.OS === 'ios' && phase === 'live' ? activityStartedAt(j.id) : null;
      if (startedAt && liveAt && startedAt < liveAt.getTime() && AppState.currentState !== 'background') {
        endTravelActivity(j.id, content);
        Observe.logEvent('travel_day.activity_renewed');
      }
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
        content.action?.stage ?? '',
        content.hasPass ? 'pass' : '',
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
        // With the cards for take-off and landing time, so the notification
        // moves on by the timetable while the app is asleep — the OS ticks
        // the countdown itself, and swaps the card when it runs out.
        postTravelLiveUpdate(
          j.id,
          toLiveUpdate(content),
          liveContentSchedule(j, state, facts, now, plan).map((item) => ({
            at: item.at,
            content: toLiveUpdate(item.content),
          })),
        );
      }
      Storage.setItemSync(postedKey(j.id), fingerprint);
      if (!row?.activityStartedAt) {
        await markActivity(j.id, { activityStartedAt: now.toISOString() });
        Observe.logEvent('travel_day.activity_started');
      }
    } else if (row && row.activityStartedAt && !row.endedAt) {
      // The final render lingers dimmed after the end — give it the real
      // last state ("Landed in LHR") instead of a generic goodbye.
      await teardown(j.id, 'ended', liveContent(j, state, factsFor(j), now, plan));
    }
  }

  if (Platform.OS === 'ios') {
    const keep = journeyRows
      .filter((j) => {
        const { phase } = travelWindow(j, rowToState(byJourney.get(j.id)), now, planOf(j.id));
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
