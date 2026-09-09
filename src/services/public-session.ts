import type { PublicSession } from '../../convex/liveShared';

import {
  EMPTY_FACTS,
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
