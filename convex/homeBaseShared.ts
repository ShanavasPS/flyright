/** The traveller's home as a follower's copy of their trips carries it
 * (docs/home-base.md): per trip, never the periods themselves, so a follower
 * learns nothing about trips they cannot see or about where someone used to
 * live beyond what those trips already show. */
import { flightDay } from './airportZones';

export interface HomePlace {
  city: string;
  country: string;
}

interface Period extends HomePlace {
  from: string | null;
  until: string | null;
}

export interface TripHome {
  /** The home on the trip's local departure day. */
  home?: HomePlace;
  /** The home the day before, sent only when it differs (a move day); null
   * when the day before had none. Absent = the same as `home`. */
  homeBefore?: HomePlace | null;
}

const DAY_MS = 86_400_000;

function on(periods: Period[], day: string): HomePlace | null {
  const p = periods.find((x) => (x.from === null || x.from <= day) && (x.until === null || day <= x.until));
  return p ? { city: p.city, country: p.country } : null;
}

/** Mirrors the app's groupingHome: set periods rule (a day none covers has
 * no home), and only with no periods at all does the automatic home stand. */
export function tripHome(
  base: { periods: Period[]; auto?: HomePlace | null } | null,
  trip: { scheduledDeparture: string; fromCode: string },
): TripHome {
  if (!base) return {};
  if (!base.periods.length) return base.auto ? { home: { city: base.auto.city, country: base.auto.country } } : {};
  const day = flightDay(trip.scheduledDeparture, trip.fromCode).slice(0, 10);
  const time = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(time)) return {};
  const home = on(base.periods, day);
  const before = on(base.periods, new Date(time - DAY_MS).toISOString().slice(0, 10));
  const same = home && before ? home.city === before.city && home.country === before.country : home === before;
  return { ...(home ? { home } : {}), ...(same ? {} : { homeBefore: before }) };
}
