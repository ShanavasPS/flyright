/** Persistence for the traveler's own travel-day state. One row per journey
 * in `travel_day`; the pure model (travel-day.ts) decides every transition,
 * this module just reads/writes rows and pokes the surface reconciler.
 *
 * Deliberately outside the journeys LWW sync: the traveler's device is the
 * only writer, so rows push (never pull) to the Convex live session — the
 * dirty marker is the same syncedAt convention journeys use.
 *
 * Writers here don't fire reconcileTravelDay themselves (that would make the
 * store and the lifecycle import each other) — callers reconcile after
 * mutating, the same way screens already fire reconcileNotifications. */

import { and, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Observe } from 'expo-observe';

import { db } from '@/db/client';
import { travelDay } from '@/db/schema';
import {
  EMPTY_TRAVEL_DAY,
  advance,
  applyFlightFacts,
  rewindTo,
  undoLast,
  type FlightFacts,
  type TravelDayState,
  type TravelStage,
} from '@/services/travel-day';

export type TravelDayRow = typeof travelDay.$inferSelect;

export function rowToState(row: TravelDayRow | undefined): TravelDayState {
  if (!row) return EMPTY_TRAVEL_DAY;
  let stamps: TravelDayState['stamps'] = {};
  try {
    stamps = JSON.parse(row.stamps);
  } catch {
    // A corrupt stamps blob loses timestamps, not the stage itself.
  }
  return { stage: (row.stage as TravelStage | null) ?? null, stamps };
}

/** The traveler's stage state for one journey, live. */
export function useTravelDay(journeyId: string): TravelDayState {
  const { data } = useLiveQuery(
    db.select().from(travelDay).where(eq(travelDay.journeyId, journeyId)),
    [journeyId],
  );
  return rowToState(data?.[0]);
}

/** Stage state for every journey, live, as a lookup — for surfaces that pick
 * between journeys (the My travels hero) and must judge each trip's window
 * with its real stamps, not the empty default. Unstamped trips resolve to
 * EMPTY_TRAVEL_DAY, same as useTravelDay. */
export function useTravelDayStates(): (journeyId: string) => TravelDayState {
  const { data } = useLiveQuery(db.select().from(travelDay), []);
  const byId = new Map((data ?? []).map((row) => [row.journeyId, rowToState(row)]));
  return (journeyId) => byId.get(journeyId) ?? EMPTY_TRAVEL_DAY;
}

async function readState(journeyId: string): Promise<TravelDayState> {
  const rows = await db.select().from(travelDay).where(eq(travelDay.journeyId, journeyId));
  return rowToState(rows[0]);
}

async function writeState(journeyId: string, state: TravelDayState): Promise<void> {
  const now = new Date().toISOString();
  const values = {
    journeyId,
    stage: state.stage,
    stamps: JSON.stringify(state.stamps),
    updatedAt: now,
  };
  await db
    .insert(travelDay)
    .values(values)
    .onConflictDoUpdate({ target: travelDay.journeyId, set: values });
}

export async function advanceStage(
  journeyId: string,
  target: TravelStage,
  manualTrip = false,
): Promise<void> {
  const state = await readState(journeyId);
  const next = advance(state, target, new Date(), manualTrip);
  if (next === state) return;
  await writeState(journeyId, next);
  Observe.logEvent('travel_day.stage_advanced', { attributes: { stage: target } });
}

export async function undoStage(journeyId: string, manualTrip = false): Promise<void> {
  const state = await readState(journeyId);
  const next = undoLast(state, manualTrip);
  if (next === state) return;
  await writeState(journeyId, next);
  Observe.logEvent('travel_day.stage_undone');
}

export async function rewindStage(
  journeyId: string,
  target: TravelStage,
  manualTrip = false,
): Promise<void> {
  const state = await readState(journeyId);
  const next = rewindTo(state, target, manualTrip);
  if (next === state) return;
  await writeState(journeyId, next);
  Observe.logEvent('travel_day.stage_rewound', { attributes: { stage: target } });
}

/** Merge observed flight facts (actual departure/arrival) into the stage
 * state — called by the lifecycle after status lookups, so a landed flight
 * closes the timeline even if the traveler never taps again. */
export async function mergeFlightStages(journeyId: string, facts: FlightFacts): Promise<void> {
  const state = await readState(journeyId);
  const next = applyFlightFacts(state, facts);
  if (next === state) return;
  await writeState(journeyId, next);
}

/** Lifecycle bookkeeping: when a live surface first appeared / was torn down. */
export async function markActivity(
  journeyId: string,
  fields: Partial<Pick<TravelDayRow, 'activityStartedAt' | 'endedAt'>>,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(travelDay)
    .values({ journeyId, stamps: '{}', updatedAt: now, ...fields })
    .onConflictDoUpdate({ target: travelDay.journeyId, set: fields });
}

/** All travel-day rows — the lifecycle reconciler joins them to journeys. */
export async function allTravelDayRows(): Promise<TravelDayRow[]> {
  return db.select().from(travelDay);
}

export const isDirty = (row: TravelDayRow): boolean =>
  row.syncedAt === null || row.updatedAt > row.syncedAt;

/** Same guard as markJourneysSynced: an edit that landed mid-push keeps the
 * row dirty for the next pass. */
export async function markTravelDaySynced(row: TravelDayRow): Promise<void> {
  await db
    .update(travelDay)
    .set({ syncedAt: row.updatedAt })
    .where(and(eq(travelDay.journeyId, row.journeyId), eq(travelDay.updatedAt, row.updatedAt)));
}
