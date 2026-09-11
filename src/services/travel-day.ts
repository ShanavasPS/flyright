/** Pure travel-day stage model — no DB, no notifications, no platform APIs.
 * One state shape drives every renderer of the live trip: the journey-detail
 * timeline, the My travels banner, the Android ongoing notification, and the
 * iOS Live Activity. The store/lifecycle services own persistence and OS
 * surfaces; everything here is unit-testable.
 *
 * Stage keys are a cross-layer contract: the same strings appear in the
 * Convex live session and the Swift widget's content-state dict. Rename only
 * with a migration on all three sides. */

import { landedOrLater, presumedFlightStage } from '../../convex/liveShared';

import { airportZone } from '@/services/airports';
import { formatDelay, hasRealTime } from '@/services/notification-plan';
import { flightInstant, formatTime } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';

/** The departure-airport walk, in order. Skipping is normal — not every
 * trip has a bag drop or an immigration desk. */
export const AIRPORT_STAGES = [
  'at_airport',
  'checked_in',
  'bag_dropped',
  'security',
  'immigration',
  'boarded',
] as const;

/** Stages only flight data may set. Taps can never reach these. */
export const FLIGHT_STAGES = ['departed', 'landed'] as const;

/** What can follow a landing: passport control on arrival, the belt, and
 * the bag re-drop a first point of entry demands before flying on. A leg
 * carries only the ones its place in the itinerary calls for (stagePlan);
 * a direct flight carries none and ends at 'landed' as it always has. */
export const ARRIVAL_STAGES = ['arrival_immigration', 'bags_collected', 'bags_rechecked'] as const;

/** Every stage, in the one order every plan is a subset of. Stage indexes
 * compare across plans because of this: a connecting leg's walk is this
 * list with rows removed, never reordered. */
export const STAGE_ORDER = [...AIRPORT_STAGES, ...FLIGHT_STAGES, ...ARRIVAL_STAGES] as const;

/** Stages the traveler advances by tapping. */
export const TRAVELER_STAGES = [...AIRPORT_STAGES, ...ARRIVAL_STAGES] as const;

export type TravelStage = (typeof STAGE_ORDER)[number];

/** The stages one leg's walk shows, in STAGE_ORDER order. */
export type StagePlan = readonly TravelStage[];

/** A flight on its own: the airport walk, the flight, done at the gate. */
export const DEFAULT_PLAN: StagePlan = [...AIRPORT_STAGES, ...FLIGHT_STAGES];

/** Where a leg sits in its itinerary — everything stagePlan needs to know.
 * Worked out by legPlace (travel-day-plan.ts) from the journal; kept as
 * plain facts here so the model stays free of airport data. */
export interface LegPlace {
  /** The traveler lands at this leg's origin on an earlier leg: already
   * checked in, bags through, airside — the airport walk is just transit
   * security and the gate. */
  connecting: boolean;
  /** Another leg leaves after this one lands. */
  onward: boolean;
  /** Passport control comes after THIS landing: the leg crosses a border
   * and this airport is where the trip enters — the last stop, the first
   * airport of a country the next leg stays inside, or any US airport. */
  entersHere: boolean;
  /** Checked bags come off the belt after this landing: the last stop, or
   * a point of entry that sends arrivals through customs with their bags
   * before they fly on (the US, an international→domestic connection). */
  bagsHere: boolean;
}

/** The walk a leg gets from its place in the itinerary. A connecting leg
 * drops "at the airport", check-in and bag drop (all done at the first
 * airport) and moves passport control to after the landing; the last leg
 * ends with the bags; a US-style entry collects them and drops them again
 * before the onward flight. */
export function stagePlan(place: LegPlace): StagePlan {
  const before: TravelStage[] = place.connecting ? ['security', 'boarded'] : [...AIRPORT_STAGES];
  const after: TravelStage[] = [];
  if (place.entersHere) after.push('arrival_immigration');
  if (place.bagsHere) after.push('bags_collected');
  if (place.bagsHere && place.onward) after.push('bags_rechecked');
  return [...before, ...FLIGHT_STAGES, ...after];
}

/** Stages of the plan that come after the landing. */
export const arrivalStepsOf = (plan: StagePlan): TravelStage[] =>
  plan.filter((s) => stageIndex(s) > stageIndex('landed'));

export const STAGE_LABELS: Record<TravelStage, string> = {
  at_airport: 'At the airport',
  checked_in: 'Checked in',
  bag_dropped: 'Bags dropped',
  security: 'Through security',
  immigration: 'Through immigration',
  boarded: 'On board',
  departed: 'Departed',
  landed: 'Landed',
  arrival_immigration: 'Through immigration',
  bags_collected: 'Bags collected',
  bags_rechecked: 'Bags re-checked',
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
  arrival_immigration: 'Passport',
  bags_collected: 'Bags',
  bags_rechecked: 'Bags',
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
  arrival_immigration: "I'm through immigration",
  bags_collected: 'I have my bags',
  bags_rechecked: 'Bags are re-checked',
};

/** What the traveler should do NEXT, keyed by the stage that tap will
 * reach. The traveler's own surfaces (Live Activity, Android Live Update,
 * home banner) speak in these — a lock screen that says "Through security"
 * tells you nothing you don't know, "Passport control" tells you where to
 * walk. Followers keep the completed-stage vocabulary (STAGE_LABELS and the
 * server's push copy); that's news to them. The gate step is composed in
 * nextStepLabel because it folds in the gate and boarding time. */
export const NEXT_STEP_LABELS: Record<TravelStage, string> = {
  at_airport: 'Head to the airport',
  checked_in: 'Check in',
  bag_dropped: 'Drop your bags',
  security: 'Head to security',
  immigration: 'Passport control',
  boarded: 'Go to your gate',
  departed: 'Ready for take-off',
  landed: 'Landing',
  arrival_immigration: 'Passport control',
  bags_collected: 'Collect your bags',
  bags_rechecked: 'Re-check your bags',
};

/** One-word form of the next step for the Dynamic Island / status-bar chip. */
export const NEXT_STEP_COMPACT: Record<TravelStage, string> = {
  at_airport: 'Airport',
  checked_in: 'Check in',
  bag_dropped: 'Bag drop',
  security: 'Security',
  immigration: 'Passport',
  boarded: 'Gate',
  departed: 'Take-off',
  landed: 'Landing',
  arrival_immigration: 'Passport',
  bags_collected: 'Bags',
  bags_rechecked: 'Bag drop',
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

export const isTravelerStage = (stage: TravelStage): stage is (typeof TRAVELER_STAGES)[number] =>
  (TRAVELER_STAGES as readonly string[]).includes(stage);

/** On the ground at the destination: 'landed' or any arrival step after it.
 * Every "has this flight landed" question asks this, not `=== 'landed'`. */
export const hasLanded = (stage: TravelStage | null): boolean => landedOrLater(stage);

const isArrivalStage = (stage: TravelStage): boolean =>
  stageIndex(stage) > stageIndex('landed');

/** What the traveler may do to a trip's stages: manual journal trips have
 * no status feed, so the flight stages are theirs to stamp too (tracked
 * flights keep them data-only); the plan is the leg's walk (stagePlan) —
 * a stage outside it is never offered, tapped or reached. */
export interface StageRules {
  manualTrip?: boolean;
  plan?: StagePlan;
}

const travelerMaySet = (stage: TravelStage, manualTrip: boolean): boolean =>
  manualTrip || isTravelerStage(stage);

/** Taps move forward only and may skip stages within their side of the
 * flight. On tracked flights they can never set a flight-driven stage;
 * manual trips may tap through 'landed'. Nobody taps an arrival step before
 * the landing is recorded: "through immigration" while the plane is in the
 * air is a mis-tap, not a skip. */
export function canAdvanceTo(
  state: TravelDayState,
  target: TravelStage,
  rules: StageRules = {},
): boolean {
  const { manualTrip = false, plan = DEFAULT_PLAN } = rules;
  if (!plan.includes(target)) return false;
  if (!travelerMaySet(target, manualTrip)) return false;
  if (isArrivalStage(target) && !hasLanded(state.stage)) return false;
  return stageIndex(target) > stageIndex(state.stage);
}

export function advance(
  state: TravelDayState,
  target: TravelStage,
  now: Date,
  rules: StageRules = {},
): TravelDayState {
  if (!canAdvanceTo(state, target, rules)) return state;
  return { stage: target, stamps: { ...state.stamps, [target]: now.toISOString() } };
}

/** The step the traveler takes next: the first stage of the plan they're
 * still allowed to advance to. Stamps are forward-only, so this is simply
 * the stage after the current one, bounded by what the traveler may set —
 * 'boarded' on tracked flights until the landing is in, then the arrival
 * steps; 'landed' itself on manual trips. Null once nothing is left. The
 * timeline highlights this same stage as its action row, so the lock screen
 * and the in-app stepper always point at the same thing. */
export function nextStage(state: TravelDayState, rules: StageRules = {}): TravelStage | null {
  const plan = rules.plan ?? DEFAULT_PLAN;
  return plan.find((s) => canAdvanceTo(state, s, rules)) ?? null;
}

/** Undo the most recent stamp only — one level, and on tracked flights never
 * a flight-driven stage (those aren't the traveler's to take back; on manual
 * trips every stamp is theirs). An arrival step undoes back to 'landed'. */
export function undoLast(state: TravelDayState, rules: StageRules = {}): TravelDayState {
  const { manualTrip = false } = rules;
  if (state.stage === null || !travelerMaySet(state.stage, manualTrip)) return state;
  const stamps = { ...state.stamps };
  delete stamps[state.stage];
  const remaining = STAGE_ORDER.filter((s) => stamps[s] !== undefined);
  return { stage: remaining[remaining.length - 1] ?? null, stamps };
}

/** Sliding the timeline back: any earlier *stamped* stage the traveler owns
 * is a valid landing spot, and — like undo — tracked flights lock the slider
 * once the flight has departed: the arrival steps slide among themselves,
 * never back across the flight. */
export function canRewindTo(
  state: TravelDayState,
  target: TravelStage,
  rules: StageRules = {},
): boolean {
  const { manualTrip = false } = rules;
  if (state.stage === null || !travelerMaySet(state.stage, manualTrip)) return false;
  if (!travelerMaySet(target, manualTrip)) return false;
  if (!manualTrip && isArrivalStage(state.stage) !== isArrivalStage(target)) return false;
  return state.stamps[target] !== undefined && stageIndex(target) < stageIndex(state.stage);
}

/** Rewind to an earlier stamped stage, dropping every stamp after it. */
export function rewindTo(
  state: TravelDayState,
  target: TravelStage,
  rules: StageRules = {},
): TravelDayState {
  if (!canRewindTo(state, target, rules)) return state;
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

/** How long the live surfaces stay up after the landing while arrival
 * steps are still to tap: an immigration queue and a belt can take most
 * of this. Half an hour once the walk is done, as for a direct flight. */
const ARRIVAL_WALK_MS = 2 * HOUR_MS;
const AFTER_LANDING_MS = 30 * 60_000;

/** Where the trip sits in its travel-day arc. Non-flights and manual rows
 * with fabricated noon times never get a live surface. The plan decides
 * how long the window outlives the landing: a leg with arrival steps keeps
 * its surfaces up until they're tapped (or two hours), one without closes
 * half an hour after touchdown. */
export function travelWindow(
  j: TravelJourney,
  state: TravelDayState,
  now: Date,
  plan: StagePlan = DEFAULT_PLAN,
): TravelWindow {
  if (j.mode !== 'flight' || !hasRealTime(j)) return { phase: 'unsupported' };
  // Manual rows carry bare wall clocks: pin them to their airports before
  // any instant arithmetic, or the window drifts by the traveller's zone.
  const departure = flightInstant(j.scheduledDeparture, airportZone(j.fromCode));
  if (Number.isNaN(departure)) return { phase: 'unsupported' };

  const startsAt = new Date(departure - REMINDER_LEAD_MS);

  const landed = state.stamps.landed ? Date.parse(state.stamps.landed) : NaN;
  const arrival = flightInstant(j.scheduledArrival, airportZone(j.toCode));
  let end: number;
  if (Number.isNaN(landed)) {
    end = (Number.isNaN(arrival) ? departure : arrival) + 6 * HOUR_MS;
  } else {
    const steps = arrivalStepsOf(plan);
    const lastStep = steps[steps.length - 1];
    const walkDone = !lastStep || stageIndex(state.stage) >= stageIndex(lastStep);
    if (!walkDone) {
      end = landed + ARRIVAL_WALK_MS;
    } else {
      const lastStamp = state.stage ? Date.parse(state.stamps[state.stage] ?? '') : NaN;
      end = Math.max(landed, Number.isNaN(lastStamp) ? landed : lastStamp) + AFTER_LANDING_MS;
    }
  }
  end = Math.min(end, departure + MAX_AFTER_DEPARTURE_MS);
  const endsAt = new Date(end);

  const t = now.getTime();
  if (t < startsAt.getTime()) return { phase: 'before', startsAt, endsAt };
  if (t >= end) return { phase: 'ended', startsAt, endsAt };
  if (t < departure - LIVE_LEAD_MS) return { phase: 'reminder', startsAt, endsAt };
  return { phase: 'live', startsAt, endsAt };
}

/** The journey the My travels banner should surface: the flight whose window
 * is in reminder/live phase, soonest departure first. Pass `stateOf` so each
 * window is judged with the trip's real stamps — with the empty default, a
 * morning flight whose landed stamp already closed its window still wins on
 * departure time and shadows a genuinely live later trip. */
export function activeJourney<T extends TravelJourney>(
  rows: T[],
  now: Date,
  stateOf: (journeyId: string) => TravelDayState = () => EMPTY_TRAVEL_DAY,
  planOf: (journeyId: string) => StagePlan = () => DEFAULT_PLAN,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    const { phase } = travelWindow(row, stateOf(row.id), now, planOf(row.id));
    if (phase !== 'reminder' && phase !== 'live') continue;
    if (
      !best ||
      flightInstant(row.scheduledDeparture, airportZone(row.fromCode)) <
        flightInstant(best.scheduledDeparture, airportZone(best.fromCode))
    ) {
      best = row;
    }
  }
  return best;
}

/** The one render model every live surface draws from — keeping the lock
 * screen, the notification, the banner, and the timeline in agreement. */
export interface LiveContent {
  title: string;
  /** The time-anchored status that heads every surface: "Flight in 3h",
   * "Departing now", "Lands in 40 min", "Landed". Counts to the estimated
   * departure when the airline has posted one, so a delay reads honestly. */
  headline: string;
  /** What to do next — never repeats the headline's countdown. */
  subtitle: string;
  /** Route endpoints, rendered as the big boarding-pass style codes. */
  fromCode: string;
  toCode: string;
  /** "LH873" (or the carrier name for manual rows without a number). */
  flightLabel: string;
  /** Estimated-over-scheduled clock times under each route code. */
  depTime: string | null;
  arrTime: string | null;
  /** Flight progress, 0..1: exactly 0 until the flight departs, then the
   * share of the departure→arrival span elapsed (clamped just inside both
   * ends so the plane visibly leaves and hasn't yet landed), 1 once landed.
   * The airport walk never moves it — that's what the stepper is for. */
  progress: number;
  stageIndex: number;
  stageLabel: string | null;
  /** The Dynamic Island's compact trailing slot: one word. The departure
   * clock before the first tap; then the NEXT step ("Security", "Passport",
   * the gate code once the gate is the destination); from boarding on, the
   * stage word; the baggage belt after landing. */
  compactLabel: string;
  /** The (estimated) departure and arrival as instants — ms since epoch,
   * null when the stored time can't be placed. The widget anchors its
   * self-ticking countdown to these, so a delay that moves the estimate
   * moves the countdown on the next push and the seconds keep running
   * offline in between. */
  departsAt: number | null;
  arrivesAt: number | null;
  /** What the countdown runs to right now: the departure until the wheels
   * leave, the arrival in the air, nothing once landed (see liveCountdown). */
  countdownEnd: number | null;
  countdownKind: 'departure' | 'arrival' | null;
  gate: string | null;
  terminal: string | null;
  boardingTime: string | null;
  delayLabel: string | null;
  emphasis: 'none' | 'delay' | 'gate';
}

/** Which instant the live surfaces' self-ticking countdown runs to. The
 * (estimated) departure before take-off, the (estimated) arrival in the air,
 * nothing once landed. Mirrored by liveCountdown in convex/liveShared.ts. */
export function liveCountdown(
  stage: TravelStage | null,
  departureMs: number,
  arrivalMs: number,
): { end: number; kind: 'departure' | 'arrival' } | null {
  if (stage === 'landed') return null;
  if (stage === 'departed') {
    return Number.isNaN(arrivalMs) ? null : { end: arrivalMs, kind: 'arrival' };
  }
  return Number.isNaN(departureMs) ? null : { end: departureMs, kind: 'departure' };
}

const routeLabel = (j: TravelJourney) => `${j.fromCode} → ${j.toCode}`;

function countdownLabel(departure: number, now: Date): string {
  const mins = Math.max(0, Math.round((departure - now.getTime()) / 60_000));
  if (mins >= 90) return `in ${Math.round(mins / 60)}h`;
  return mins > 0 ? `in ${mins} min` : 'now';
}

/** How much of the flight has been flown — the plane's position on every
 * route line. Zero until the flight has departed (taps never move it),
 * then time-based between the real/estimated departure and the estimated
 * arrival, held just inside both ends until the landing stamp closes it.
 * Mirrored by flightProgress in convex/liveShared.ts. */
export function flightProgress(
  j: TravelJourney,
  state: TravelDayState,
  facts: FlightFacts,
  now: Date,
): number {
  const departed = flightInstant(
    facts.actualDeparture ??
      state.stamps.departed ??
      facts.estimatedDeparture ??
      j.scheduledDeparture,
    airportZone(j.fromCode),
  );
  const arrives = flightInstant(facts.estimatedArrival ?? j.scheduledArrival, airportZone(j.toCode));
  // With nothing recorded past the airport, the plane still moves by the
  // timetable once the departure is gone — a line with the plane parked at
  // the origin under "Due to land in 2h" contradicts itself.
  const stage = presumedFlightStage(state.stage, departed, arrives, now.getTime());
  if (stageIndex(stage) < stageIndex('departed')) return 0;
  if (stage === 'landed') return 1;
  if (Number.isNaN(departed) || Number.isNaN(arrives) || arrives <= departed) return 0.5;
  const fraction = (now.getTime() - departed) / (arrives - departed);
  return Math.min(0.97, Math.max(0.03, fraction));
}

export function liveContent(
  j: TravelJourney,
  state: TravelDayState,
  facts: FlightFacts,
  now: Date,
  plan: StagePlan = DEFAULT_PLAN,
): LiveContent {
  const flight = j.number || j.carrier;
  const delayed = facts.delayMinutes != null && facts.delayMinutes >= 30;
  const delayLabel = delayed ? `${formatDelay(facts.delayMinutes!)} late` : null;

  const index = stageIndex(state.stage);
  const stageLabel = state.stage ? STAGE_LABELS[state.stage] : null;
  const manualTrip = j.source === 'manual';
  const next = nextStage(state, { manualTrip, plan });
  const landed = hasLanded(state.stage);
  const boardingOpen = !!facts.boardingTime && Date.parse(facts.boardingTime) <= now.getTime();
  const gateWord = facts.gate ? `gate ${facts.gate}` : 'your gate';

  // The headline is the one time fact that matters right now: the countdown
  // to (estimated) departure until the wheels leave, the countdown to
  // landing in the air, then "Landed". The clock times themselves sit under
  // the route codes, so nothing here repeats them.
  const effectiveDeparture = facts.estimatedDeparture ?? j.scheduledDeparture;
  const departureMs = flightInstant(effectiveDeparture, airportZone(j.fromCode));
  // Travel day is the one screen read while crossing zones, so every clock
  // on it names the airport it happens at: gate times in the departure
  // airport's, the landing time in the destination's. The countdowns are
  // durations and stay zone-free.
  const departureZone = airportZone(j.fromCode);
  const arrivalZone = airportZone(j.toCode);
  const arrivalMs = flightInstant(facts.estimatedArrival ?? j.scheduledArrival, arrivalZone);
  // Past the departure with nothing recorded (a manual trip's untapped
  // "Departed", or airline data that hasn't caught up): read the timetable
  // and say so, rather than hold "Departing now" through the flight.
  const presumed = presumedFlightStage(state.stage, departureMs, arrivalMs, now.getTime());
  // A presumption only ever stands in for a flight stage nobody recorded.
  const presumedOnly = presumed !== null && index < stageIndex('departed');
  let headline: string;
  if (landed) {
    headline = 'Landed';
  } else if (state.stage === 'departed') {
    const toLanding = Number.isNaN(arrivalMs) ? null : countdownLabel(arrivalMs, now);
    headline = toLanding === null ? 'In the air' : toLanding === 'now' ? 'Landing now' : `Lands ${toLanding}`;
  } else if (presumed === 'landed') {
    headline = 'Flown';
  } else if (presumed === 'departed') {
    const toLanding = countdownLabel(arrivalMs, now);
    headline = toLanding === 'now' ? 'Due to land about now' : `Due to land ${toLanding}`;
  } else if (Number.isNaN(departureMs)) {
    headline = `Departs ${formatTime(effectiveDeparture, departureZone)}`;
  } else {
    const toDeparture = countdownLabel(departureMs, now);
    headline = toDeparture === 'now' ? 'Departing now' : `Flight ${toDeparture}`;
  }

  // The traveler's line reads as the NEXT thing to do, not the last thing
  // done (followers get the done-stage feed via the server's push copy) —
  // and never the countdown, which the headline already carries.
  let subtitle: string;
  if (landed) {
    // On the ground: the arrival steps the plan still has, in order —
    // passport control, the belt (by number when the airport posted one),
    // the bag re-drop — then the welcome once the walk is done.
    if (next === 'bags_collected') {
      subtitle = facts.baggageBelt ? `Collect your bags · belt ${facts.baggageBelt}` : NEXT_STEP_LABELS.bags_collected;
    } else if (next) {
      subtitle = NEXT_STEP_LABELS[next];
    } else if (state.stage === 'landed' && facts.baggageBelt) {
      subtitle = `Bags at belt ${facts.baggageBelt}`;
    } else {
      subtitle = `Welcome to ${j.toCode}`;
    }
  } else if (state.stage === 'departed') {
    subtitle = facts.baggageBelt ? `In the air · Bags at belt ${facts.baggageBelt}` : 'In the air';
  } else if (presumed === 'landed') {
    // A manual trip keeps its own "Landed" tap; a tracked one lands when
    // the airline says so. Either way the line says what this reading is.
    subtitle = `Due to land ${formatTime(facts.estimatedArrival ?? j.scheduledArrival, arrivalZone)} · going by the timetable`;
  } else if (presumed === 'departed') {
    subtitle = 'Going by the timetable';
  } else if (state.stage === 'boarded') {
    subtitle = 'On board · ready for pushback';
  } else if (boardingOpen) {
    // Boarding has opened: wherever the walk stands, the gate is the task.
    subtitle = facts.gate ? `Boarding now · Gate ${facts.gate}` : 'Boarding now';
  } else if (state.stage === null || next === null) {
    // Before the first tap: the first step of the walk once the live window
    // opens (T−4h) — the airport, or security for a connecting leg —
    // honesty before that: a lock screen saying "head to the airport" the
    // evening before helps nobody.
    subtitle =
      !Number.isNaN(departureMs) && now.getTime() >= departureMs - LIVE_LEAD_MS
        ? NEXT_STEP_LABELS[next ?? plan[0] ?? 'at_airport']
        : 'Nothing to do yet';
  } else if (next === 'boarded') {
    // The gate step carries the boarding time when the airline posts one.
    subtitle = facts.boardingTime
      ? `Go to ${gateWord} · boards ${formatTime(facts.boardingTime, departureZone)}`
      : `Go to ${gateWord}`;
  } else if (next === 'checked_in' && facts.checkInDesk) {
    subtitle = `Check in at desk ${facts.checkInDesk}`;
  } else {
    subtitle = NEXT_STEP_LABELS[next];
  }
  if (delayLabel) subtitle = `${delayLabel} · ${subtitle}`;

  // Compact slot: departure clock until the first tap; then the next step
  // (the gate code once the gate is the destination); from boarding on, the
  // stage word — and the baggage belt after landing, the last thing to find.
  let compactLabel: string;
  if (presumedOnly) {
    compactLabel = presumed === 'landed' ? 'Flown' : 'Timetable';
  } else if (state.stage === null) {
    compactLabel = formatTime(effectiveDeparture, departureZone);
  } else if (landed && next) {
    compactLabel =
      next === 'bags_collected' && facts.baggageBelt ? `Belt ${facts.baggageBelt}` : NEXT_STEP_COMPACT[next];
  } else if (state.stage === 'landed' && facts.baggageBelt) {
    compactLabel = `Belt ${facts.baggageBelt}`;
  } else if (index >= stageIndex('boarded') || next === null) {
    compactLabel = STAGE_COMPACT[state.stage];
  } else if (next === 'boarded') {
    compactLabel = facts.gate ? `G${facts.gate}` : NEXT_STEP_COMPACT.boarded;
  } else {
    compactLabel = NEXT_STEP_COMPACT[next];
  }

  const timeOf = (iso: string | null, zone: string | null) =>
    iso && !Number.isNaN(Date.parse(iso)) ? formatTime(iso, zone) : null;
  const countdown = liveCountdown(presumed, departureMs, arrivalMs);

  return {
    title: `${flight} · ${routeLabel(j)}`,
    headline,
    subtitle,
    fromCode: j.fromCode,
    toCode: j.toCode,
    flightLabel: flight,
    depTime: timeOf(facts.estimatedDeparture ?? j.scheduledDeparture, departureZone),
    arrTime: timeOf(facts.estimatedArrival ?? j.scheduledArrival, arrivalZone),
    progress: flightProgress(j, state, facts, now),
    stageIndex: index,
    stageLabel,
    compactLabel,
    departsAt: Number.isNaN(departureMs) ? null : departureMs,
    arrivesAt: Number.isNaN(arrivalMs) ? null : arrivalMs,
    countdownEnd: countdown?.end ?? null,
    countdownKind: countdown?.kind ?? null,
    gate: facts.gate,
    terminal: facts.terminal,
    boardingTime: facts.boardingTime,
    delayLabel,
    emphasis: delayed ? 'delay' : facts.gate ? 'gate' : 'none',
  };
}
