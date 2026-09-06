/** When an imported leg departs and arrives. One rule, one home — see
 * legSchedule below for why the ticket outranks the flight lookup. */

import { airportZone } from '@/services/airports';
import { zonedTimestamp } from '@/services/dates';
import type { FlightStatus } from '@/services/flight-lookup';
import type { ImportedSegment } from '@/services/itinerary';

/** One leg's departure and arrival, used both by the card the traveler
 * reviews and by the row that gets saved, so the two can never disagree.
 *
 * **The ticket wins.** The times printed down the itinerary are the airport's
 * own clocks and they are what the traveler will be holding at the gate; the
 * provider's answer for a flight months out is a projection off a schedule
 * that may not have caught a re-time. The lookup only fills in a time the
 * document never printed.
 *
 * A printed time becomes the instant it names at its airport ("11:30" at ARN
 * on 28 November is 10:30Z), because the countdown, the travel-day window and
 * the departure reminder are all instant arithmetic — the screens read the
 * clock back out of it in the airport's own zone. For an airport the table
 * doesn't carry, the bare wall clock is kept instead: still the right thing
 * to show, just not something to count down to.
 */
export function legSchedule(
  segment: Pick<ImportedSegment, 'date' | 'arrivalDate' | 'depTime' | 'arrTime' | 'fromCode' | 'toCode'>,
  flight: Pick<FlightStatus, 'date' | 'from' | 'to' | 'scheduledDeparture' | 'scheduledArrival'> | null,
): { departure: string | null; arrival: string | null } {
  const day = segment.date ?? flight?.date ?? null;
  const printed = (clock: string | null, on: string | null, iata: string | null) => {
    if (!clock || !on) return null;
    return zonedTimestamp(on, clock, airportZone(iata)) ?? `${on}T${clock}:00`;
  };
  return {
    departure:
      printed(segment.depTime, day, flight?.from.code ?? segment.fromCode) ??
      flight?.scheduledDeparture ??
      null,
    arrival:
      printed(segment.arrTime, segment.arrivalDate ?? day, flight?.to.code ?? segment.toCode) ??
      flight?.scheduledArrival ??
      null,
  };
}
