/** A friend's home as their trips carry it (convex/homeBaseShared.tripHome),
 * turned back into the lookup trip grouping reads, so their card groups a
 * trip the way their own phone does. */
import { departureDay, type HomePlace } from '@/services/home-base';
import type { HomeAt } from '@/services/trip-groups';

export interface TripWithHome {
  journeyId: string;
  fromCode: string;
  scheduledDeparture: string;
  home?: HomePlace;
  homeBefore?: HomePlace | null;
}

/** Grouping asks about a flight's own day, its landing and the day before
 * it; only the day before can have another home (a move). Undefined when no
 * trip carries a home: an older server, or a traveller with none. */
export function personHomeAt(list: TripWithHome[]): HomeAt | undefined {
  if (!list.some((t) => t.home || t.homeBefore)) return undefined;
  const byId = new Map(list.map((t) => [t.journeyId, t]));
  return (row) => {
    const trip = byId.get(row.id);
    if (!trip) return null;
    const earlier = departureDay(row) < departureDay(trip);
    return (earlier && trip.homeBefore !== undefined ? trip.homeBefore : trip.home) ?? null;
  };
}
