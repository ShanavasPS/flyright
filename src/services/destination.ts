/** A destination's page (docs/trip-covers.md): every trip to a city, all
 * time, its totals, and for a home city the move into it and the trips from
 * it. Pure, over the same trip groups Flights shows. */
import { airportPlace, samePlace, type HomePlace } from '@/services/home-base';
import type { JourneyRow } from '@/services/journeys';
import type { TravelTrip, TripGroup } from '@/services/trip-groups';

export const isMoveGroup = (group: TripGroup) => group.id.startsWith('move:');

export const groupFlights = (group: TripGroup): JourneyRow[] =>
  group.entries.flatMap((e) => (e.kind === 'flight' ? [e.journey] : []));

/** Where a trip went: the place the group is named after; a move's new home.
 * Never its first flight's arrival, which is a layover when that flight
 * connects (HEL via DOH read as Qatar) and the next stop for a resumed
 * visit. `from` is where the first flight left. */
export function tripDestination(group: TripGroup): { place: HomePlace; from: HomePlace | null } {
  const first = groupFlights(group)[0];
  return {
    place: group.code ? airportPlace(group.code, group.country) : { city: group.title, country: group.country },
    from: first ? airportPlace(first.fromCode, first.fromCountry) : null,
  };
}

export interface DestinationTotals {
  trips: number;
  /** Nights away there, from the trips' stays. */
  days: number;
  flights: number;
  /** ISO of the first trip's departure, or null. */
  first: string | null;
}

export interface Destination {
  /** Trips whose destination is the city, newest first. Moves excluded. */
  trips: TripGroup[];
  totals: DestinationTotals;
  /** The flight(s) the traveller moved here on, newest first. */
  moves: TripGroup[];
  /** Trips that started here (it was home), newest first. */
  from: TripGroup[];
}

const newestFirst = (a: TripGroup, b: TripGroup) => b.start.iso.localeCompare(a.start.iso);

export function destinationOf(trips: TravelTrip[], place: HomePlace): Destination {
  const groups = trips.flatMap((t) => t.groups);
  const to = groups.filter((g) => !isMoveGroup(g) && samePlace(tripDestination(g).place, place)).sort(newestFirst);
  const moves = groups.filter((g) => isMoveGroup(g) && samePlace(tripDestination(g).place, place)).sort(newestFirst);
  const from = groups.filter((g) => {
    if (isMoveGroup(g)) return false;
    const origin = tripDestination(g).from;
    return !!origin && samePlace(origin, place);
  }).sort(newestFirst);
  const days = to.reduce((sum, g) => sum + g.entries.reduce((s, e) => s + (e.kind === 'stay' ? e.stay.days : 0), 0), 0);
  const flights = to.reduce((sum, g) => sum + groupFlights(g).length, 0);
  const first = to.length ? to[to.length - 1]!.start.iso : null;
  return { trips: to, totals: { trips: to.length, days, flights, first }, moves, from };
}
