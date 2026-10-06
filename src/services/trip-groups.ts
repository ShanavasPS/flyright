/** Display-only trip grouping. Recomputed from the viewer's journal: no stored
 * group IDs, migrations or writes, so later imports/edits/deletions can reshape
 * a return trip without changing any flight's identity or attached records. */
import { chainLegs } from '../../convex/itineraryShared';

import { airportZone, countryName, getAirport } from '@/services/airports';
import { connectionsInto, legInstant, type Connection } from '@/services/connections';
import { flightDay } from '@/services/dates';
import type { HomePlace } from '@/services/home-base';
import type { JourneyRow } from '@/services/journeys';
import { cityOf, groupJourneys } from '@/services/timeline';

/** The home a flight counts from (services/home-base), or null for
 * Automatic, where a trip runs from its first departure back to it. */
export type HomeAt = (row: JourneyRow) => HomePlace | null;

const DAY_MS = 86_400_000;
/** Avoid joining unrelated one-way flights months apart without a shared
 * booking. This limits inference, never hides a flight. */
const MAX_INFERRED_STAY_MS = 180 * DAY_MS;

interface Place { code: string; country: string; city: string }
interface Moment { iso: string; code: string }
interface Direction { legs: JourneyRow[]; from: Place; to: Place }

export interface TripStay {
  id: string;
  days: number;
  place: string;
  fromId: string;
  toId: string;
}

export type TripGroupEntry =
  | { kind: 'flight'; key: string; journey: JourneyRow }
  | { kind: 'stay'; key: string; stay: TripStay };

export interface TripGroup {
  id: string;
  title: string;
  /** The airport code of the place the group is named after — the visit's
   * final destination, not where its first flight happens to land (a
   * connection), nor where it leaves from (a resumed visit, a return). */
  code: string;
  country: string;
  continued: boolean;
  start: Moment;
  end: Moment;
  entries: TripGroupEntry[];
}

export interface TravelTrip {
  id: string;
  journeys: JourneyRow[];
  groups: TripGroup[];
}

export type TripListItem =
  | { kind: 'header'; key: string; group: TripGroup; dates: string }
  | { kind: 'separator'; key: string }
  | { kind: 'flight'; key: string; journey: JourneyRow; live: boolean; hero: boolean; connection?: Connection }
  | Extract<TripGroupEntry, { kind: 'stay' }>;

export interface TripListSection { key: string; title: string; data: TripListItem[] }

/** How the Flights list orders its trips, picked from the chips on the
 * Upcoming and past headings. Next up / Latest are the defaults. */
export interface TripSort {
  /** Soonest departure first, or the trips saved most recently first. */
  upcoming: 'next' | 'added';
  /** Newest first, read back from the flight home; or the first trip first,
   * each in the order it was flown. */
  past: 'latest' | 'oldest';
}

export const DEFAULT_TRIP_SORT: TripSort = { upcoming: 'next', past: 'latest' };

export interface TripHeroGroup { group: TripGroup; dates: string; isFirstFlight: boolean }

/** The active itinerary sorts first. Its first flight expands in place;
 * a later live flight keeps a shortcut between its row and the top card. */
export function tripHeroGroup(rows: JourneyRow[], now: Date, heroId: string | null, homeAt?: HomeAt): TripHeroGroup | undefined {
  if (!heroId) return undefined;
  for (const trip of buildTripGroups(rows, homeAt)) {
    const group = trip.groups.find(g => g.entries.some(e => e.kind === 'flight' && e.journey.id === heroId));
    if (group) return { group, dates: tripGroupDates(group, now.getFullYear()), isFirstFlight: trip.journeys[0]!.id === heroId };
  }
  return undefined;
}

function place(row: JourneyRow, side: 'from' | 'to'): Place {
  const code = row[`${side}Code`].trim().toUpperCase();
  const airport = row.mode === 'flight' ? getAirport(code) : undefined;
  const country = (airport?.country ?? row[`${side}Country`]).trim().toUpperCase();
  return { code, country: /^[A-Z]{2}$/.test(country) ? country : '', city: airport ? cityOf(code) : code };
}

function departure(row: JourneyRow): Moment { return { iso: row.scheduledDeparture, code: row.fromCode }; }
function arrival(row: JourneyRow): Moment { return { iso: row.scheduledArrival, code: row.toCode }; }
function first(d: Direction) { return d.legs[0]!; }
function last(d: Direction) { return d.legs[d.legs.length - 1]!; }
function at(m: Moment) { return legInstant(m.iso, m.code); }

function placeKey(p: Place, international: boolean): string {
  return international && p.country ? `country:${p.country}` : `city:${p.country}:${p.city}`;
}

function destinationName(p: Place, international: boolean): string {
  if (!international || !p.country) return p.city || p.code || 'Destination';
  return p.country === 'US' ? 'US' : p.country === 'GB' ? 'UK' : countryName(p.country);
}

function stayPlace(p: Place, international: boolean): string {
  const name = destinationName(p, international);
  return international && ['US', 'GB', 'NL', 'PH', 'AE'].includes(p.country) ? `the ${name}` : name;
}

function calendarDay(m: Moment): string | null {
  if (!Number.isFinite(at(m))) return null;
  const day = flightDay(m.iso, airportZone(m.code));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === day ? day : null;
}

/** A stay that lands in a city and leaves from it again is named after that
 * city, at home or abroad ("13 days in Dallas-Fort Worth" for a London home —
 * travellers asked for the city over "the US"). Only a stay that leaves from
 * another city (in at JFK, out at BOS) is named after its country, and only
 * when that country is abroad from the home the traveller had when they
 * landed; at home it keeps the arrival city ("3 days in Manchester"). */
function stayBetween(a: Direction, b: Direction, international: boolean, homeThen?: HomePlace | null): TripStay | null {
  if (placeKey(a.to, international) !== placeKey(b.from, international)) return null;
  const from = arrival(last(a));
  const to = departure(first(b));
  const start = calendarDay(from);
  const end = calendarDay(to);
  if (!start || !end || !(at(to) > at(from))) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS);
  if (days < 0) return null;
  const oneCity = placeKey(a.to, false) === placeKey(b.from, false);
  const abroad = !oneCity && (homeThen
    ? !!a.to.country && !!homeThen.country && a.to.country !== homeThen.country
    : international);
  return { id: `${last(a).id}:${first(b).id}`, days, place: stayPlace(a.to, abroad), fromId: last(a).id, toId: first(b).id };
}

/** Where a direction leaves the traveller in time. A hand-typed flight often
 * carries one placeholder for both of its times, and a row whose arrival is
 * missing or not after its departure used to break the chain on both sides of
 * itself, shattering one trip into several and taking every stay around it
 * with it. Which airport follows which is readable from the codes and the
 * departure times alone, so such a row is anchored by its own departure.
 * Measuring a stay still needs a real arrival, and stayBetween goes on
 * declining to invent one. */
function chainAnchor(d: Direction): number {
  const leg = last(d);
  const arrived = at(arrival(leg));
  return Number.isFinite(arrived) && arrived > at(departure(leg)) ? arrived : at(departure(leg));
}

function canFollow(a: Direction, b: Direction, international: boolean): boolean {
  if (first(a).mode !== 'flight' || first(b).mode !== 'flight') return false;
  if (placeKey(a.to, international) !== placeKey(b.from, international)) return false;
  const leaves = chainAnchor(a);
  const arrives = at(departure(first(b)));
  if (!Number.isFinite(leaves) || !Number.isFinite(arrives)) return false;
  const gap = arrives - leaves;
  if (gap <= 0) return false;
  const booking = last(a).bookingReference?.trim().toUpperCase();
  return gap <= MAX_INFERRED_STAY_MS || (!!booking && booking === first(b).bookingReference?.trim().toUpperCase());
}

/** A direct same-day return also fits the shared <24h connection rule. Split
 * explicit airport backtracking for this display only: it is a visit/stay,
 * not a layover at the destination. Ordinary connecting chains stay intact. */
function splitBacktracking(chain: JourneyRow[]): JourneyRow[][] {
  const parts: JourneyRow[][] = [];
  let start = 0;
  const cities = new Set([cityOf(chain[0]!.fromCode)]);
  for (let i = 0; i < chain.length; i++) {
    const leg = chain[i]!;
    const destination = cityOf(leg.toCode);
    if (i > start && cities.has(destination)) {
      parts.push(chain.slice(start, i));
      start = i;
      cities.clear();
      cities.add(cityOf(leg.fromCode));
    }
    cities.add(destination);
  }
  parts.push(chain.slice(start));
  return parts;
}

/** Reuse existing connection detection. Non-flight transport stays independent
 * and an unusable schedule cannot bridge other trips. */
function directions(rows: JourneyRow[]): Direction[] {
  const chains = chainLegs(rows.filter(r => r.mode === 'flight'), legInstant).flatMap(splitBacktracking);
  chains.push(...rows.filter(r => r.mode !== 'flight').map(r => [r]));
  return chains.map(legs => ({ legs, from: place(legs[0]!, 'from'), to: place(legs[legs.length - 1]!, 'to') }))
    .sort((a, b) => {
      const ta = at(departure(first(a)));
      const tb = at(departure(first(b)));
      return (Number.isFinite(ta) ? ta : Infinity) - (Number.isFinite(tb) ? tb : Infinity) || first(a).id.localeCompare(first(b).id);
    });
}

function flattenVisits(route: Direction[], international: boolean, home?: HomePlace | null, homeAt?: HomeAt): TripGroup[] {
  const groups: TripGroup[] = [];
  // Bookkeeping only: the rendered groups are always flat. A return closes
  // the destination it leaves; the resumed visit starts before its stay.
  // A trip whose flight out was never logged still left from home: with a
  // home known, the flight back to it ends the visit it leaves instead of
  // opening a heading of its own.
  const origin = route[0]!.from;
  const visited: Place[] = home && !isHome(origin, home, false)
    ? [{ code: '', country: home.country, city: home.city }, origin]
    : [origin];
  const seen = new Set<string>();
  let current: TripGroup | null = null;
  const makeGroup = (p: Place, start: Moment, id: string) => {
    const key = placeKey(p, false);
    const continued = seen.has(key);
    const group: TripGroup = {
      // The heading is the city alone. `continued` still records that this is a
      // repeat visit within one trip, which the dates already make plain and
      // which read oddly above the visit it continued once finished trips were
      // reversed.
      id, title: destinationName(p, false),
      code: p.code, country: p.country, continued, start, end: start, entries: [],
    };
    seen.add(key);
    groups.push(group);
    return group;
  };

  for (const [i, direction] of route.entries()) {
    const previous = route[i - 1];
    if (previous) {
      // The previous direction may have returned to an earlier city.
      // Only create the resumed group if there is a later flight to show.
      current ??= makeGroup(direction.from, arrival(last(previous)), `continued:${first(direction).id}`);
      const stay = stayBetween(previous, direction, international, homeAt ? homeOnArrival(previous, homeAt) : null);
      if (stay) {
        current.entries.push({ kind: 'stay', key: `stay:${stay.id}`, stay });
        current.end = departure(first(direction));
      }
    }
    // Visits follow cities even within one country. A return to a different
    // airport/city back home still closes the existing international trip.
    const destination = placeKey(direction.to, false);
    const returnTo = visited.findIndex((p, index) => placeKey(p, false) === destination
      || (index === 0 && international && p.country === direction.to.country));
    const samePlace = destination === placeKey(direction.from, false);
    if (!current || (returnTo === -1 && !samePlace)) {
      current = makeGroup(direction.to, departure(first(direction)), `visit:${first(direction).id}`);
    }
    for (const journey of direction.legs) current.entries.push({ kind: 'flight', key: `flight:${journey.id}`, journey });
    current.end = arrival(last(direction));
    if (returnTo >= 0 && !samePlace) {
      visited.splice(returnTo + 1);
      current = null;
    } else if (!samePlace) {
      visited.push(direction.to);
    }
  }
  return groups;
}

/** Whether a place is the home: its city, or for an international trip its
 * country — landing in Boston ends a trip that left from JFK. */
function isHome(p: HomePlace, home: HomePlace, international: boolean): boolean {
  if (p.city === home.city && (!p.country || !home.country || p.country === home.country)) return true;
  return international && !!p.country && p.country === home.country;
}

/** The home in force when a direction lands, read on its arrival day. */
function homeOnArrival(d: Direction, homeAt: HomeAt): HomePlace | null {
  const leg = last(d);
  return homeAt({ ...leg, scheduledDeparture: leg.scheduledArrival || leg.scheduledDeparture, fromCode: leg.toCode });
}

function homeTheDayBefore(d: Direction, homeAt: HomeAt): HomePlace | null {
  const leg = first(d);
  const day = Date.parse(`${leg.scheduledDeparture.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day)) return null;
  const before = new Date(day - DAY_MS).toISOString().slice(0, 10);
  return homeAt({ ...leg, scheduledDeparture: `${before}${leg.scheduledDeparture.slice(10)}` });
}

/** One flight on its own: a move, or a return whose outbound was never logged. */
function singleGroupTrip(d: Direction, id: string, title: string, place: Place): TravelTrip {
  const group: TripGroup = {
    id, title, code: place.code, country: place.country, continued: false,
    start: departure(first(d)), end: arrival(last(d)),
    entries: d.legs.map(journey => ({ kind: 'flight' as const, key: `flight:${journey.id}`, journey })),
  };
  return { id: first(d).id, journeys: d.legs, groups: [group] };
}

export function buildTripGroups(rows: JourneyRow[], homeAt?: HomeAt): TravelTrip[] {
  const ordered = directions(rows.filter(row => !row.deletedAt));
  const trips: TravelTrip[] = [];
  for (let i = 0; i < ordered.length;) {
    const start = ordered[i++]!;
    const international = !!start.from.country && !!start.to.country && start.from.country !== start.to.country;
    const known = homeAt && first(start).mode === 'flight' ? homeAt(first(start)) : null;
    if (known && homeAt) {
      const fromHome = isHome(start.from, known, false);
      const next = homeOnArrival(start, homeAt);
      // The move day already belongs to the new home, so the old one is read
      // the day before: leaving it for the new one is a move, not a trip.
      const before = homeTheDayBefore(start, homeAt);
      if (before && next && isHome(start.from, before, false) && !isHome(next, before, false) && isHome(start.to, next, false)) {
        trips.push(singleGroupTrip(start, `move:${first(start).id}`, `Moved to ${destinationName(start.to, false)}`, start.to));
        continue;
      }
      // Flying home with no outbound logged: it belongs to where it came from.
      if (!fromHome && isHome(start.to, known, international)) {
        trips.push(singleGroupTrip(start, `return:${first(start).id}`, destinationName(start.from, false), start.from));
        continue;
      }
    }
    const home = placeKey(start.from, international);
    const returned = (d: Direction) => {
      if (known && homeAt) {
        const then = homeOnArrival(d, homeAt) ?? known;
        return isHome(d.to, then, international);
      }
      return placeKey(d.to, international) === home;
    };
    const route = [start];
    while (i < ordered.length && !returned(route[route.length - 1]!)) {
      const next = ordered[i]!;
      if (!canFollow(route[route.length - 1]!, next, international)) break;
      route.push(next);
      i++;
    }
    trips.push({ id: first(start).id, journeys: route.flatMap(d => d.legs), groups: flattenVisits(route, international, known, homeAt) });
  }
  return trips;
}

/** "Oct" for 10, as this engine's en-GB spells it ("Sept" on Android's ICU),
 * worked out once per month: every trip heading asks for one or two. */
const monthNames = new Map<number, string>();
function shortMonth(month: number): string {
  let name = monthNames.get(month);
  if (name === undefined) {
    name = new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    monthNames.set(month, name);
  }
  return name;
}

/** Dates belong to the airports' calendars, including an overnight landing
 * home. A stay counts only arrival-to-departure at the visited destination. */
export function tripGroupDates(group: TripGroup, currentYear: number): string {
  const start = calendarDay(group.start);
  const end = calendarDay(group.end);
  if (!start) return '';
  const month = (day: string) => shortMonth(Number(day.slice(5, 7)));
  const day = (value: string) => Number(value.slice(8));
  const single = (value: string, year: boolean) => `${day(value)} ${month(value)}${year ? ` ${value.slice(0, 4)}` : ''}`;
  const withYear = Number(start.slice(0, 4)) !== currentYear;
  if (!end || end < start || end === start) return single(start, withYear);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${single(start, true)} – ${single(end, true)}`;
  const suffix = withYear ? ` ${end.slice(0, 4)}` : '';
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${day(start)}–${day(end)} ${month(end)}${suffix}`
    : `${single(start, false)} – ${single(end, false)}${suffix}`;
}

/** One destination's rows as Flights draws them: its flights, with the
 * connection drawn above a leg that continues the one before, and the stays
 * between. Read back (a finished trip, newest first) the rows run the other
 * way. The destination page draws its trips with the same rows. */
export type TripGroupRow =
  | { kind: 'flight'; key: string; journey: JourneyRow; connection?: Connection }
  | Extract<TripGroupEntry, { kind: 'stay' }>;

export function tripGroupRows(group: TripGroup, connections: Map<string, Connection>, readBack: boolean): TripGroupRow[] {
  const rows: TripGroupRow[] = [];
  let previousId: string | undefined;
  for (const entry of readBack ? [...group.entries].reverse() : group.entries) {
    if (entry.kind === 'stay') {
      rows.push(entry);
      previousId = undefined;
      continue;
    }
    // The joint is drawn above a row, between it and the one before: in
    // travel order that is the connection into this leg; read back, the row
    // above is the later leg, so it is the connection out.
    const into = readBack ? connections.get(previousId ?? '') : connections.get(entry.journey.id);
    const joins = readBack ? into?.prevId === entry.journey.id : !!into && into.prevId === previousId;
    rows.push({ ...entry, connection: joins ? into : undefined });
    previousId = entry.journey.id;
  }
  return rows;
}

/** Destinations in the order Flights keeps its trips: those still to be
 * flown (or under way) first, soonest first or most recently saved first;
 * then the finished ones, by when they got home, newest first, or the
 * first one first. `readBack` says whether the finished ones are drawn
 * newest leg first, as Flights draws them. */
export function orderTripGroups(groups: TripGroup[], now: Date, sort: TripSort = DEFAULT_TRIP_SORT): {
  upcoming: TripGroup[];
  past: TripGroup[];
  readBack: boolean;
} {
  const flights = (g: TripGroup) => g.entries.flatMap(e => e.kind === 'flight' ? [e.journey] : []);
  const added = (g: TripGroup) => Math.max(0, ...flights(g).map(r => Date.parse(r.createdAt) || 0));
  // Still to come while any of its flights has yet to land.
  const ahead = (g: TripGroup) => {
    const legs = flights(g);
    return legs.length ? legs.some(r => at(arrival(r)) > now.getTime()) : at(g.end) > now.getTime();
  };
  const upcoming = groups.filter(ahead)
    .sort((a, b) => (sort.upcoming === 'added' ? added(b) - added(a) : 0) || at(a.start) - at(b.start));
  const oldest = sort.past === 'oldest';
  const past = groups.filter(g => !ahead(g))
    .sort((a, b) => oldest ? at(a.start) - at(b.start) : at(b.end) - at(a.end));
  return { upcoming, past, readBack: !oldest };
}

/** Classify the complete trip before highlighting its active flight row.
 * A trip remains current between its flights and through the hero's arrival
 * window — but only the destination being travelled is shown as current:
 * the ones already flown are filed with the past, later ones under Upcoming. Flights stay in travel order; completed trips are newest first
 * unless `sort` asks for Upcoming by save date or the past oldest first. */
export function tripListSections(
  rows: JourneyRow[],
  now: Date,
  heroId: string | null = null,
  homeAt?: HomeAt,
  sort: TripSort = DEFAULT_TRIP_SORT,
): TripListSection[] {
  const visible = rows.filter(r => !r.deletedAt);
  const phase = new Map(groupJourneys(visible, now).flatMap(s => s.data.map(r => [r.id, s.key] as const)));
  const connections = connectionsInto(rows.filter(r => !r.deletedAt));
  const yearOf = (journeys: JourneyRow[]) => calendarDay(departure(journeys[0]!))?.slice(0, 4) ?? 'undated';
  const part = (trip: TravelTrip, groups: TripGroup[], suffix: string): TravelTrip => ({
    id: `${trip.id}${suffix}`,
    groups,
    journeys: groups.flatMap(g => g.entries.flatMap(e => e.kind === 'flight' ? [e.journey] : [])),
  });
  // A destination is done once every flight in it has landed. The hero keeps
  // its own through the arrival window, and a flight still in the air is not
  // done whatever its timetable says.
  const landed = (group: TripGroup) => group.entries.every(e => e.kind !== 'flight' ||
    (e.journey.id !== heroId && phase.get(e.journey.id) !== 'live' && at(arrival(e.journey)) <= now.getTime()));
  const filed = buildTripGroups(rows, homeAt).flatMap(trip => {
    const keys = trip.journeys.map(r => phase.get(r.id));
    const hasHero = trip.journeys.some(r => r.id === heroId);
    const started = at(departure(trip.journeys[0]!)) <= now.getTime();
    const current = hasHero || keys.includes('live') || (started && keys.includes('upcoming'));
    if (!current) return [{ trip, key: keys.includes('upcoming') ? 'upcoming' : yearOf(trip.journeys), hasHero }];
    // A trip under way is where the traveller is in it: the destinations
    // already flown are filed with the past, the one still being travelled is
    // the current trip, and whatever comes after it waits under Upcoming.
    const flights = (g: TripGroup) => g.entries.some(e => e.kind === 'flight');
    if (!trip.groups.every(flights)) return [{ trip, key: 'current', hasHero }];
    const open = trip.groups.findIndex(g => !landed(g));
    const done = open < 0 ? trip.groups : trip.groups.slice(0, open);
    const ongoing = open < 0 ? [] : [trip.groups[open]!];
    const next = open < 0 ? [] : trip.groups.slice(open + 1);
    const parts: { trip: TravelTrip; key: string; hasHero: boolean }[] = [];
    if (done.length) {
      const flown = part(trip, done, ':flown');
      parts.push({ trip: flown, key: yearOf(flown.journeys), hasHero: false });
    }
    if (ongoing.length) {
      const here = part(trip, ongoing, '');
      parts.push({ trip: here, key: 'current', hasHero: here.journeys.some(r => r.id === heroId) });
    }
    if (next.length) parts.push({ trip: part(trip, next, ':next'), key: 'upcoming', hasHero: false });
    return parts;
  });
  // One place at a time: should two trips both be under way, the one with
  // the live flight (else the one that left first) is current, the other waits.
  const currents = filed.filter(f => f.key === 'current')
    .sort((a, b) => Number(b.hasHero) - Number(a.hasHero) || at(departure(a.trip.journeys[0]!)) - at(departure(b.trip.journeys[0]!)));
  for (const extra of currents.slice(1)) extra.key = 'upcoming';
  const oldest = sort.past === 'oldest';
  const rank = (key: string) => key === 'current' ? 0 : key === 'upcoming' ? 1 : key === 'undated' ? Infinity
    : oldest ? Number(key) : 10_000 - Number(key);
  const leaving = (trip: TravelTrip) => at(departure(trip.journeys[0]!));
  // Finished trips newest first go by when they got home, so a trip that came
  // back last sits on top even if another left after it.
  const homecoming = (trip: TravelTrip) => at(arrival(trip.journeys[trip.journeys.length - 1]!));
  // A trip was saved when its newest leg was.
  const added = (trip: TravelTrip) => Math.max(...trip.journeys.map(r => Date.parse(r.createdAt) || 0));
  const within = (a: TravelTrip, b: TravelTrip, key: string) => {
    if (key === 'current') return leaving(a) - leaving(b);
    if (key === 'upcoming') return (sort.upcoming === 'added' ? added(b) - added(a) : 0) || leaving(a) - leaving(b);
    return oldest ? leaving(a) - leaving(b) : homecoming(b) - homecoming(a);
  };
  filed.sort((a, b) => rank(a.key) - rank(b.key) ||
    Number(b.hasHero) - Number(a.hasHero) ||
    within(a.trip, b.trip, a.key));

  const sections: TripListSection[] = [];
  for (const { trip, key } of filed) {
    const items: TripListItem[] = [];
    // Travel order is what a traveller wants of a trip they are on or about to
    // take: the legs come in the order they will be flown. A finished trip is
    // read the other way, newest first, like the trips around it — its
    // destinations and the legs and stays inside each one are reversed, so
    // the whole past list descends by date, the flight home on top. Sorted
    // oldest first, the past list climbs instead, and so does each trip.
    const readBack = key !== 'current' && key !== 'upcoming' && !oldest;
    for (const group of readBack ? [...trip.groups].reverse() : trip.groups) {
      items.push({ kind: 'header', key: `header:${group.id}`, group, dates: tripGroupDates(group, now.getFullYear()) });
      for (const row of tripGroupRows(group, connections, readBack)) {
        items.push(row.kind === 'stay' ? row : { ...row, live: phase.get(row.journey.id) === 'live', hero: row.journey.id === heroId });
      }
    }
    if (!items.length) continue;
    let section = sections[sections.length - 1];
    if (section?.key !== key) {
      section = { key, title: key === 'current' ? 'Current trip' : key === 'upcoming' ? 'Upcoming' : key === 'undated' ? 'Other flights' : key, data: [] };
      sections.push(section);
    } else {
      section.data.push({ kind: 'separator', key: `separator:${trip.id}` });
    }
    section.data.push(...items);
  }
  return sections;
}
