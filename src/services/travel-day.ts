/** Pure travel-day stage model — no DB, no notifications, no platform APIs.
 * One state shape drives every renderer of the live trip: the journey-detail
 * timeline, the My travels banner, the Android ongoing notification, and the
 * iOS Live Activity. The store/lifecycle services own persistence and OS
 * surfaces; everything here is unit-testable.
 *
 * Stage keys are a cross-layer contract: the same strings appear in the
 * Convex live session and the Swift widget's content-state dict. Rename only
 * with a migration on all three sides. */

import { formatDelay, hasRealTime } from '@/services/notification-plan';
import { formatTime } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';

/** Stages the traveler advances by tapping, in order. Skipping is normal —
 * not every trip has a bag drop or an immigration desk. */
export const TRAVELER_STAGES = [
  'at_airport',
  'checked_in',
  'bag_dropped',
  'security',
  'immigration',
  'boarded',
] as const;

/** Stages only flight data may set. Taps can never reach these. */
export const FLIGHT_STAGES = ['departed', 'landed'] as const;

export const STAGE_ORDER = [...TRAVELER_STAGES, ...FLIGHT_STAGES] as const;

export type TravelStage = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<TravelStage, string> = {
  at_airport: 'At the airport',
  checked_in: 'Checked in',
  bag_dropped: 'Bags dropped',
  security: 'Through security',
  immigration: 'Through immigration',
  boarded: 'On board',
  departed: 'Departed',
  landed: 'Landed',
};

/** One-word stage labels for the tightest surfaces (the Dynamic Island's
 * compact trailing slot) — status at a glance, not a sentence. */
export const STAGE_COMPACT: Record<TravelStage, string> = {
  at_airport: 'Airport',
  checked_in: 'Checked in',
  bag_dropped: 'Bags',
  security: 'Security',
  immigration: 'Passport',
  boarded: 'Boarded',
  departed: 'In air',
  landed: 'Landed',
};

/** Imperative labels for the tap targets ("Tap when you're…"). The flight
 * stages' prompts only ever surface on manual journal trips, where the
 * traveler stamps them too (no status feed to do it). */
export const STAGE_PROMPTS: Record<TravelStage, string> = {
  at_airport: "I'm at the airport",
  checked_in: "I've checked in",
  bag_dropped: 'Bags are dropped',
  security: "I'm through security",
  immigration: "I'm through immigration",
  boarded: "I'm on board",
  departed: "We've taken off",
  landed: "We've landed",
};

export interface TravelDayState {
  /** Furthest stage reached; null before the first tap. */
  stage: TravelStage | null;
  /** ISO timestamp per reached stage. Skipped stages are simply absent. */
  stamps: Partial<Record<TravelStage, string>>;
}

export const EMPTY_TRAVEL_DAY: TravelDayState = { stage: null, stamps: {} };

/** Live facts about the flight itself, from the status API (all optional —
 * the model treats missing fields as "no change", never as a regression). */
export interface FlightFacts {
  delayMinutes: number | null;
  gate: string | null;
  terminal: string | null;
  checkInDesk: string | null;
  baggageBelt: string | null;
  boardingTime: string | null;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
}

export const EMPTY_FACTS: FlightFacts = {
  delayMinutes: null,
  gate: null,
  terminal: null,
  checkInDesk: null,
  baggageBelt: null,
  boardingTime: null,
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
};

export const stageIndex = (stage: TravelStage | null): number =>
  stage === null ? -1 : STAGE_ORDER.indexOf(stage);

const isTravelerStage = (stage: TravelStage): stage is (typeof TRAVELER_STAGES)[number] =>
  (TRAVELER_STAGES as readonly string[]).includes(stage);

/** Manual journal trips have no status feed, so the flight stages are the
 * traveler's to stamp too; tracked flights keep them data-only. */
const travelerMaySet = (stage: TravelStage, manualTrip: boolean): boolean =>
  manualTrip || isTravelerStage(stage);

/** Taps move forward only and may skip stages. On tracked flights they can
 * never pass 'boarded' or override a flight-driven stage; manual trips may
 * tap all the way to 'landed'. */
export function canAdvanceTo(
  state: TravelDayState,
  target: TravelStage,
  manualTrip = false,
): boolean {
  if (!travelerMaySet(target, manualTrip)) return false;
  return stageIndex(target) > stageIndex(state.stage);
}

export function advance(
  state: TravelDayState,
  target: TravelStage,
  now: Date,
  manualTrip = false,
): TravelDayState {
  if (!canAdvanceTo(state, target, manualTrip)) return state;
  return { stage: target, stamps: { ...state.stamps, [target]: now.toISOString() } };
}

/** Undo the most recent stamp only — one level, and on tracked flights never
 * once the flight has departed (those stages aren't the traveler's to take
 * back; on manual trips every stamp is theirs). */
export function undoLast(state: TravelDayState, manualTrip = false): TravelDayState {
  if (state.stage === null || !travelerMaySet(state.stage, manualTrip)) return state;
  const stamps = { ...state.stamps };
  delete stamps[state.stage];
  const remaining = STAGE_ORDER.filter((s) => stamps[s] !== undefined);
  return { stage: remaining[remaining.length - 1] ?? null, stamps };
}

/** Sliding the timeline back: any earlier *stamped* stage the traveler owns
 * is a valid landing spot, and — like undo — tracked flights lock the slider
 * once the flight has departed. */
export function canRewindTo(
  state: TravelDayState,
  target: TravelStage,
  manualTrip = false,
): boolean {
  if (state.stage === null || !travelerMaySet(state.stage, manualTrip)) return false;
  if (!travelerMaySet(target, manualTrip)) return false;
  return state.stamps[target] !== undefined && stageIndex(target) < stageIndex(state.stage);
}

/** Rewind to an earlier stamped stage, dropping every stamp after it. */
export function rewindTo(
  state: TravelDayState,
  target: TravelStage,
  manualTrip = false,
): TravelDayState {
  if (!canRewindTo(state, target, manualTrip)) return state;
  const stamps: TravelDayState['stamps'] = {};
  for (const s of STAGE_ORDER) {
    const stamp = state.stamps[s];
    if (stamp !== undefined && stageIndex(s) <= stageIndex(target)) stamps[s] = stamp;
  }
  return { stage: target, stamps };
}

/** Flight data outranks taps: an actual departure/arrival promotes the state
 * regardless of where the traveler's own timeline sits. */
export function applyFlightFacts(state: TravelDayState, facts: FlightFacts): TravelDayState {
  let next = state;
  if (facts.actualDeparture && stageIndex(next.stage) < stageIndex('departed')) {
    next = { stage: 'departed', stamps: { ...next.stamps, departed: facts.actualDeparture } };
  }
  if (facts.actualArrival && stageIndex(next.stage) < stageIndex('landed')) {
    next = { stage: 'landed', stamps: { ...next.stamps, landed: facts.actualArrival } };
  }
  return next;
}

export type TravelJourney = Pick<
  JourneyRow,
  | 'id'
  | 'mode'
  | 'source'
  | 'number'
  | 'carrier'
  | 'fromCode'
  | 'toCode'
  | 'scheduledDeparture'
  | 'scheduledArrival'
>;

export type TravelPhase = 'unsupported' | 'before' | 'reminder' | 'live' | 'ended';

export interface TravelWindow {
  phase: TravelPhase;
  /** Start of the live-surface window (T−24h). Absent when unsupported. */
  startsAt?: Date;
  /** When every live surface must be gone. Absent when unsupported. */
  endsAt?: Date;
}

const HOUR_MS = 3_600_000;
const REMINDER_LEAD_MS = 24 * HOUR_MS;
const LIVE_LEAD_MS = 4 * HOUR_MS;
/** Hard cap mirrors flight-watch's post-departure horizon. */
const MAX_AFTER_DEPARTURE_MS = 36 * HOUR_MS;

/** Where the trip sits in its travel-day arc. Non-flights and manual rows
 * with fabricated noon times never get a live surface. */
export function travelWindow(
  j: TravelJourney,
  state: TravelDayState,
  now: Date,
): TravelWindow {
  if (j.mode !== 'flight' || !hasRealTime(j)) return { phase: 'unsupported' };
  const departure = Date.parse(j.scheduledDeparture);
  if (Number.isNaN(departure)) return { phase: 'unsupported' };

  const startsAt = new Date(departure - REMINDER_LEAD_MS);

  const landed = state.stamps.landed ? Date.parse(state.stamps.landed) : NaN;
  const arrival = Date.parse(j.scheduledArrival);
  let end = Number.isNaN(landed)
    ? (Number.isNaN(arrival) ? departure : arrival) + 6 * HOUR_MS
    : landed + 30 * 60_000;
  end = Math.min(end, departure + MAX_AFTER_DEPARTURE_MS);
  const endsAt = new Date(end);

  const t = now.getTime();
  if (t < startsAt.getTime()) return { phase: 'before', startsAt, endsAt };
  if (t >= end) return { phase: 'ended', startsAt, endsAt };
  if (t < departure - LIVE_LEAD_MS) return { phase: 'reminder', startsAt, endsAt };
  return { phase: 'live', startsAt, endsAt };
}

/** The journey the My travels banner should surface: the flight whose window
 * is in reminder/live phase, soonest departure first. Checked without stage
 * state (renderers re-check with the real state and drop ended trips). */
export function activeJourney<T extends TravelJourney>(rows: T[], now: Date): T | null {
  let best: T | null = null;
  for (const row of rows) {
    const { phase } = travelWindow(row, EMPTY_TRAVEL_DAY, now);
    if (phase !== 'reminder' && phase !== 'live') continue;
    if (!best || Date.parse(row.scheduledDeparture) < Date.parse(best.scheduledDeparture)) {
      best = row;
    }
  }
  return best;
}

/** The one render model every live surface draws from — keeping the lock
 * screen, the notification, the banner, and the timeline in agreement. */
export interface LiveContent {
  title: string;
  subtitle: string;
  /** Route endpoints, rendered as the big boarding-pass style codes. */
  fromCode: string;
  toCode: string;
  /** "LH873" (or the carrier name for manual rows without a number). */
  flightLabel: string;
  /** Estimated-over-scheduled clock times under each route code. */
  depTime: string | null;
  arrTime: string | null;
  /** 0..1 across STAGE_ORDER; 0 before the first stamp. */
  progress: number;
  stageIndex: number;
  stageLabel: string | null;
  /** The Dynamic Island's compact trailing slot: one word of status.
   * Gate wins until boarding (it's the walk's destination); after that the
   * stage word; before any stage, the departure clock. */
  compactLabel: string;
  gate: string | null;
  terminal: string | null;
  boardingTime: string | null;
  delayLabel: string | null;
  emphasis: 'none' | 'delay' | 'gate';
}

const routeLabel = (j: TravelJourney) => `${j.fromCode} → ${j.toCode}`;

function countdownLabel(departure: number, now: Date): string {
  const mins = Math.max(0, Math.round((departure - now.getTime()) / 60_000));
  if (mins >= 90) return `in ${Math.round(mins / 60)}h`;
  return mins > 0 ? `in ${mins} min` : 'now';
}

export function liveContent(
  j: TravelJourney,
  state: TravelDayState,
  facts: FlightFacts,
  now: Date,
): LiveContent {
  const flight = j.number || j.carrier;
  const delayed = facts.delayMinutes != null && facts.delayMinutes >= 30;
  const delayLabel = delayed ? `${formatDelay(facts.delayMinutes!)} late` : null;

  const index = stageIndex(state.stage);
  const stageLabel = state.stage ? STAGE_LABELS[state.stage] : null;

  let subtitle: string;
  if (state.stage === 'landed') {
    subtitle = `Landed in ${j.toCode}`;
  } else if (state.stage === 'departed') {
    subtitle = facts.estimatedArrival
      ? `In the air · lands ${formatTime(facts.estimatedArrival)}`
      : 'In the air';
  } else if (state.stage === 'boarded' || (facts.boardingTime && Date.parse(facts.boardingTime) <= now.getTime())) {
    subtitle = state.stage === 'boarded' ? 'On board · ready for pushback' : 'Boarding';
  } else {
    // The clock time already sits under the route code on every surface —
    // the subtitle only counts down ("Departs in 75 min", "Departs now").
    const effective = facts.estimatedDeparture ?? j.scheduledDeparture;
    const effectiveMs = Date.parse(effective);
    subtitle = Number.isNaN(effectiveMs)
      ? `Departs ${formatTime(effective)}`
      : `Departs ${countdownLabel(effectiveMs, now)}`;
    if (stageLabel) subtitle = `${stageLabel} · ${subtitle}`;
  }
  if (delayLabel) subtitle = `${delayLabel} · ${subtitle}`;

  const compactLabel =
    state.stage && index >= stageIndex('boarded')
      ? STAGE_COMPACT[state.stage]
      : facts.gate
        ? `G${facts.gate}`
        : state.stage
          ? STAGE_COMPACT[state.stage]
          : formatTime(facts.estimatedDeparture ?? j.scheduledDeparture);

  const timeOf = (iso: string | null) =>
    iso && !Number.isNaN(Date.parse(iso)) ? formatTime(iso) : null;

  return {
    title: `${flight} · ${routeLabel(j)}`,
    subtitle,
    fromCode: j.fromCode,
    toCode: j.toCode,
    flightLabel: flight,
    depTime: timeOf(facts.estimatedDeparture ?? j.scheduledDeparture),
    arrTime: timeOf(facts.estimatedArrival ?? j.scheduledArrival),
    progress: (index + 1) / STAGE_ORDER.length,
    stageIndex: index,
    stageLabel,
    compactLabel,
    gate: facts.gate,
    terminal: facts.terminal,
    boardingTime: facts.boardingTime,
    delayLabel,
    emphasis: delayed ? 'delay' : facts.gate ? 'gate' : 'none',
  };
}
