import type { PublicSession } from '../../convex/liveShared';

import { airportZone } from '@/services/airports';
import { formatTime } from '@/services/dates';
import {
  EMPTY_FACTS,
  STAGE_LABELS,
  flightProgress,
  type FlightFacts,
  type TravelDayState,
  type TravelJourney,
  type TravelStage,
} from '@/services/travel-day';

/** Adapt the whitelisted Convex session into the shapes the shared timeline
 * renders — one source of truth for stage visuals on every surface that
 * shows somebody else's trip (the public /t/ page and the follower's own
 * trip screen). Nothing here reads a field a follower may not see. */
export function adaptPublicSession(s: PublicSession): {
  journey: TravelJourney;
  state: TravelDayState;
  facts: FlightFacts;
} {
  return {
    journey: {
      id: '',
      mode: 'flight',
      source: 'lookup',
      number: s.number,
      carrier: s.carrier,
      fromCode: s.fromCode,
      toCode: s.toCode,
      scheduledDeparture: s.scheduledDeparture,
      scheduledArrival: s.scheduledArrival,
    },
    state: {
      stage: (s.currentStage as TravelStage | null) ?? null,
      stamps: s.stageTimes as TravelDayState['stamps'],
    },
    facts: {
      ...EMPTY_FACTS,
      delayMinutes: s.delayMinutes,
      gate: s.gate,
      terminal: s.terminal,
      baggageBelt: s.baggageBelt,
      estimatedDeparture: s.estimatedDeparture,
      actualDeparture: s.actualDeparture,
      estimatedArrival: s.estimatedArrival,
      actualArrival: s.actualArrival,
    },
  };
}

/** The clocks a follower should be reading on a live trip: what the airline
 * now says (actual, then estimated), falling back to the timetable. A live
 * card that printed the scheduled 08:00 beside "45 min late" made the reader
 * do the sum; the row should just say 08:45. */
export function liveTimes(s: {
  scheduledDeparture: string;
  scheduledArrival: string;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
}): { departure: string; arrival: string } {
  return {
    departure: s.actualDeparture ?? s.estimatedDeparture ?? s.scheduledDeparture,
    arrival: s.actualArrival ?? s.estimatedArrival ?? s.scheduledArrival,
  };
}

/** Under a moved clock, the timetable's — struck through, the way the
 * traveller sees their ticket's time once the airline shifts the flight.
 * Only once the move is worth reading (five minutes or more): a two-minute
 * estimate drift is noise, not news. */
export function movedClocks(s: Parameters<typeof liveTimes>[0]): {
  ticketedDeparture: string | null;
  ticketedArrival: string | null;
} {
  const live = liveTimes(s);
  const moved = (was: string, now: string) =>
    Math.abs(Date.parse(now) - Date.parse(was)) >= 5 * 60_000 ? was : null;
  return {
    ticketedDeparture: moved(s.scheduledDeparture, live.departure),
    ticketedArrival: moved(s.scheduledArrival, live.arrival),
  };
}

/** Where the flight is, 0–1, for the plane on a follower's route line — the
 * traveller's own progress function over the public session's facts, so
 * both phones draw the plane at the same spot. */
export function sessionProgress(s: PublicSession, now: Date): number {
  const { journey, state, facts } = adaptPublicSession(s);
  return flightProgress(journey, state, facts, now);
}

/** What a follower is told about a live trip, in two parts: the headline is
 * the one time fact they are waiting on — "Departs in 2h 15m", then "Lands
 * in 45m", then "Landed 8:55" — and the detail is what is happening around
 * it, written for someone waiting rather than someone walking through the
 * airport: the stage reached and the gate before departure, "In the air" and
 * any delay while flying, the baggage belt or terminal after landing. The
 * detail is null when there is nothing worth a line; the headline always
 * says something. `delayed` (half an hour or more, the app's one threshold)
 * lets a surface colour the headline amber the way the traveller's card
 * does — the late fact IS the landing time, so that is what turns. */
export function followerStatus(
  s: Pick<
    PublicSession,
    | 'fromCode'
    | 'toCode'
    | 'currentStage'
    | 'delayMinutes'
    | 'gate'
    | 'terminal'
    | 'baggageBelt'
    | 'scheduledDeparture'
    | 'scheduledArrival'
    | 'estimatedDeparture'
    | 'actualDeparture'
    | 'estimatedArrival'
    | 'actualArrival'
  >,
  now: Date,
): { headline: string; detail: string | null; delayed: boolean } {
  const stage = (s.currentStage as TravelStage | null) ?? null;
  const times = liveTimes(s);
  const delayed = s.delayMinutes != null && s.delayMinutes >= 30;
  const late = delayed ? `${s.delayMinutes} min late` : null;
  const join = (parts: (string | null)[]) => parts.filter(Boolean).join(' · ') || null;

  if (stage === 'landed') {
    const at = s.actualArrival ?? times.arrival;
    return {
      delayed: false,
      headline: `Landed ${formatTime(at, airportZone(s.toCode))}`,
      detail: s.baggageBelt
        ? `Bags at belt ${s.baggageBelt}`
        : s.terminal
          ? `Terminal ${s.terminal}`
          : null,
    };
  }

  if (stage === 'departed') {
    const left = Date.parse(times.arrival) - now.getTime();
    const headline = Number.isNaN(left)
      ? 'In the air'
      : left <= 60_000
        ? 'Landing now'
        : `Lands in ${spanLabel(left)}`;
    return { headline, detail: join(['In the air', late]), delayed };
  }

  const left = Date.parse(times.departure) - now.getTime();
  const headline = Number.isNaN(left)
    ? `Departs ${formatTime(times.departure, airportZone(s.fromCode))}`
    : left <= 60_000
      ? 'Departing now'
      : `Departs in ${spanLabel(left)}`;
  return {
    headline,
    detail: join([stage ? STAGE_LABELS[stage] : null, late ?? (s.gate ? `Gate ${s.gate}` : null)]),
    delayed,
  };
}

/** "45m" / "2h 15m" / "3h" / "3d" — a positive span, rounded to the minute
 * below a day (the follower is refreshing) and to the day above it. */
export function spanLabel(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(ms / 86_400_000)}d`;
}
