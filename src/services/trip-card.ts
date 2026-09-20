/** The trip card on a trip's page — the one block between the map and the
 * route that says where the trip stands and everything known about it: a
 * status word, the clock that matters (the countdown to take-off or landing,
 * the landing time, the day it was flown), then the departure airport's
 * terminal, check-in desk, gate and boarding time, the ticket's seat and
 * booking, and the belt at the other end. Pure and testable.
 *
 * Unlike the Lock Screen, which leads with the one fact that matters now
 * (convex/liveShared liveLead), the page shows all of it in the same places
 * in every state. What isn't known yet keeps its box and says when it will
 * be ("On the day", "Not posted yet", "After landing"), or that it was never
 * recorded; on a trip without live updates, and for the ticket, an empty
 * box offers to be filled in. */

import { presumedFlightStage } from '../../convex/liveShared';

import type { JourneyRow } from '@/services/journeys';
import { airportZone, getAirport } from '@/services/airports';
import { flightDay, flightInstant, formatTime } from '@/services/dates';
import { formatDelay, hasRealTime } from '@/services/notification-plan';
import { shiftLabel } from '@/services/schedule-change';
import {
  flightProgress,
  hasLanded,
  heldByLiveData,
  stageIndex,
  type FlightFacts,
  type TravelDayState,
  type TravelPhase,
} from '@/services/travel-day';
import { typedFields, type TypedField } from '@/services/trip-record';

export type TripCardField = TypedField | 'seat' | 'bookingReference';

export interface TripCardCell {
  field: TripCardField;
  label: string;
  value: string | null;
  /** What an empty box says; null offers to fill it in ("Add"). */
  placeholder: string | null;
  /** Typed by the traveller rather than posted by the airport. */
  byUser: boolean;
  /** Takes the whole row (the belt, alone in its section). */
  wide?: boolean;
}

export interface TripCardSection {
  title: string;
  cells: TripCardCell[];
}

export type TripCardTone = 'neutral' | 'good' | 'info' | 'late' | 'boarding';

export type TripCardClock =
  | { kind: 'countdown'; label: string; end: number; tone: 'normal' | 'late' | 'boarding' }
  | { kind: 'static'; label: string; value: string; unit: string | null };

export interface TripCardModel {
  status: { text: string; tone: TripCardTone };
  clock: TripCardClock | null;
  /** Under the clock: the real take-off and landing of a flown trip. */
  line: string | null;
  /** In the air: the share flown and "700 of 1,840 km". */
  progress: { fraction: number; caption: string } | null;
  sections: TripCardSection[];
  footnote: string | null;
}

export interface TripCardInput {
  row: JourneyRow;
  /** The live facts with the record filling the gaps (factsFor). */
  facts: FlightFacts;
  state: TravelDayState;
  phase: TravelPhase;
  now: Date;
  /** A live status has been read for this flight — "On time" is a claim
   * only a status can make; without one the trip is just "Scheduled". */
  statusKnown: boolean;
}

/** Half an hour late is the app's one threshold for calling a flight late. */
const LATE_MINUTES = 30;

export function tripCard({ row, facts, state, phase, now, statusKnown }: TripCardInput): TripCardModel {
  const t = now.getTime();
  const tracked = row.source === 'lookup';
  const departureZone = airportZone(row.fromCode);
  const arrivalZone = airportZone(row.toCode);
  const timed = hasRealTime(row);
  const departureMs = flightInstant(facts.estimatedDeparture ?? row.scheduledDeparture, departureZone);
  const arrivalMs = flightInstant(facts.estimatedArrival ?? row.scheduledArrival, arrivalZone);
  const held = heldByLiveData(row, state, facts, now);
  const presumed = timed ? presumedFlightStage(state.stage, departureMs, arrivalMs, t, held) : null;
  const landed = hasLanded(state.stage) || presumed === 'landed';
  const airborne = !landed && (state.stage === 'departed' || presumed === 'departed');
  // Over once its travel window has closed — or, for a trip with no window
  // (a journal entry without times, a train), once its departure is past.
  const over =
    phase === 'ended' ||
    (phase === 'unsupported' && flightInstant(row.scheduledDeparture, departureZone) < t);

  const delayed = facts.delayMinutes != null && facts.delayMinutes >= LATE_MINUTES;
  const movedMinutes = row.ticketedDeparture
    ? Math.round((Date.parse(row.scheduledDeparture) - Date.parse(row.ticketedDeparture)) / 60_000)
    : 0;
  const boardingOpen =
    !!facts.boardingTime && Date.parse(facts.boardingTime) <= t && stageIndex(state.stage) < stageIndex('departed');

  // --- status word ---
  let status: TripCardModel['status'];
  if (over) {
    const landedAt = facts.actualArrival ? Date.parse(facts.actualArrival) : NaN;
    const due = flightInstant(row.ticketedArrival ?? row.scheduledArrival, arrivalZone);
    const late = Math.round((landedAt - due) / 60_000);
    status =
      late >= LATE_MINUTES
        ? { text: `Landed ${formatDelay(late)} late`, tone: 'late' }
        : { text: 'Flown', tone: 'neutral' };
  } else if (landed) {
    status = { text: 'Landed', tone: 'good' };
  } else if (delayed) {
    status = { text: `Delayed ${formatDelay(facts.delayMinutes!)}`, tone: 'late' };
  } else if (airborne) {
    status = { text: 'In the air', tone: 'info' };
  } else if (held && departureMs < t - 60_000 && state.stage !== 'boarded') {
    // Past its departure time, and the airport says it has not left.
    status = { text: 'Not yet departed', tone: 'late' };
  } else if (state.stage === 'boarded') {
    status = { text: 'On board', tone: 'info' };
  } else if (boardingOpen) {
    status = { text: 'Boarding', tone: 'boarding' };
  } else if (Math.abs(movedMinutes) >= 5) {
    status = { text: capitalize(shiftLabel(movedMinutes)), tone: movedMinutes > 0 ? 'late' : 'info' };
  } else if (!tracked) {
    status = { text: 'From your ticket', tone: 'neutral' };
  } else if (phase === 'before' || !statusKnown) {
    status = { text: 'Scheduled', tone: 'neutral' };
  } else {
    status = { text: 'On time', tone: 'good' };
  }

  // --- the clock ---
  let clock: TripCardClock | null = null;
  let line: string | null = null;
  let progress: TripCardModel['progress'] = null;
  if (over || !timed) {
    const day = flightDay(row.scheduledDeparture, departureZone);
    clock = {
      kind: 'static',
      label: over ? 'Flew on' : 'Departs on',
      value: monthDay(day),
      unit: day.slice(0, 4),
    };
    const tookOff = facts.actualDeparture ? formatTime(facts.actualDeparture, departureZone) : null;
    const touchedDown = facts.actualArrival ? formatTime(facts.actualArrival, arrivalZone) : null;
    if (over && tookOff && touchedDown) line = `Took off ${tookOff} · landed ${touchedDown}`;
    else if (over && touchedDown) line = `Landed ${touchedDown}`;
  } else if (landed) {
    const at = facts.actualArrival ?? state.stamps.landed ?? facts.estimatedArrival ?? row.scheduledArrival;
    const [value, unit] = splitClock(formatTime(at, arrivalZone));
    clock = { kind: 'static', label: 'Landed at', value, unit };
  } else if (airborne && !Number.isNaN(arrivalMs) && arrivalMs <= t) {
    // The arrival it was counting to has passed and nothing has reported a
    // landing. A countdown here renders a dead "0:00" that never moves again;
    // the live card and the Lock Screen both give up the clock and say where
    // the flight is, so this says the same.
    clock = { kind: 'static', label: 'In the air', value: 'Landing', unit: 'now' };
  } else if (airborne && !Number.isNaN(arrivalMs)) {
    clock = { kind: 'countdown', label: 'Lands in', end: arrivalMs, tone: delayed ? 'late' : 'normal' };
    const fraction = flightProgress(row, state, facts, now);
    const total = Math.round(row.distanceKm);
    progress = {
      fraction,
      caption: total > 0 ? `${Math.round(fraction * total).toLocaleString()} of ${total.toLocaleString()} km` : '',
    };
  } else if (held && departureMs < t) {
    const [value, unit] = splitClock(formatTime(facts.estimatedDeparture ?? row.scheduledDeparture, departureZone));
    clock = { kind: 'static', label: 'Due to leave at', value, unit };
  } else if (!Number.isNaN(departureMs)) {
    clock = {
      kind: 'countdown',
      label: 'Departs in',
      end: departureMs,
      tone: delayed ? 'late' : boardingOpen ? 'boarding' : 'normal',
    };
  }

  // --- the facts ---
  const typed = typedFields(row);
  const departed = airborne || landed;
  // What an empty box says. Null offers to fill it in: the ticket always,
  // and every box on a trip with no feed to post them.
  const pending = (arrival: boolean): string | null => {
    if (over) return 'Not recorded';
    if (!tracked || phase === 'unsupported') return null;
    if (phase === 'before') return arrival ? 'After landing' : 'On the day';
    if (arrival) return landed ? 'Not posted yet' : 'After landing';
    return departed ? 'Not recorded' : 'Not posted yet';
  };
  const cell = (field: TypedField, label: string, value: string | null, arrival = false): TripCardCell => ({
    field,
    label,
    value,
    placeholder: value ? null : pending(arrival),
    byUser: !!value && typed.has(field),
  });
  const ticket: TripCardSection = {
    title: 'Your ticket',
    cells: [
      { field: 'seat', label: 'Seat', value: row.seat, placeholder: null, byUser: false },
      { field: 'bookingReference', label: 'Booking', value: row.bookingReference, placeholder: null, byUser: false },
    ],
  };
  const airportKnown = !!(
    facts.terminal ||
    facts.checkInDesk ||
    facts.gate ||
    facts.boardingTime ||
    facts.baggageBelt
  );
  // A flown trip with nothing recorded (flown before the record existed)
  // shows its ticket alone rather than a wall of "Not recorded".
  const sections: TripCardSection[] =
    row.mode !== 'flight' || (over && !airportKnown)
      ? [ticket]
      : [
          {
            title: `From ${placeName(row.fromCode)} · ${row.fromCode}`,
            cells: [
              cell('terminal', 'Terminal', facts.terminal),
              cell('checkInDesk', 'Check-in', facts.checkInDesk),
              cell('gate', 'Gate', facts.gate),
              cell('boardingTime', 'Boarding', facts.boardingTime ? formatTime(facts.boardingTime, departureZone) : null),
            ],
          },
          ticket,
          {
            title: `Into ${placeName(row.toCode)} · ${row.toCode}`,
            cells: [{ ...cell('baggageBelt', 'Baggage', facts.baggageBelt ? `Belt ${facts.baggageBelt}` : null, true), wide: true }],
          },
        ];

  let footnote: string | null = null;
  if (!over && !tracked) {
    footnote = timed
      ? 'Times are from your ticket. Tap a box to add what you know.'
      : 'Tap a box to add what you know.';
  } else if (!over && typed.size) {
    footnote = "Where the airport posts something different, the airport's wins.";
  }

  return { status, clock, line, progress, sections, footnote };
}

/** "Helsinki" for HEL — without the dataset's "(Vantaa)", which a section
 * heading has no room for — and the code itself for an airport it lacks. */
function placeName(code: string): string {
  return getAirport(code)?.city.replace(/\s*\(.*\)$/, '') ?? code;
}

/** "2026-09-19" → "Sep 19", read on its own calendar page. */
function monthDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "5:08 PM" → ["5:08", "PM"]; a 24-hour "17:08" has no unit. */
export function splitClock(text: string): [string, string | null] {
  const match = text.match(/^(.*?)\s*([AaPp]\.?\s?[Mm]\.?)$/);
  return match ? [match[1], match[2]] : [text, null];
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
