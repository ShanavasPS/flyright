/** Display-only trip grouping. Recomputed from the viewer's journal: no stored
 * group IDs, migrations or writes, so later imports/edits/deletions can reshape
 * a return trip without changing any flight's identity or attached records. */
import { chainLegs } from '../../convex/itineraryShared';

import { airportZone, countryName, getAirport } from '@/services/airports';
import { connectionsInto, legInstant, type Connection } from '@/services/connections';
import { flightDay } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';
import { cityOf, groupJourneys } from '@/services/timeline';

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

export interface TripHeroGroup { group: TripGroup; dates: string; isFirstFlight: boolean }

/** The active itinerary sorts first. Its first flight expands in place;
 * a later live flight keeps a shortcut between its row and the top card. */
export function tripHeroGroup(rows: JourneyRow[], now: Date, heroId: string | null): TripHeroGroup | undefined {
  if (!heroId) return undefined;
  for (const trip of buildTripGroups(rows)) {
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

function stayBetween(a: Direction, b: Direction, international: boolean): TripStay | null {
  if (placeKey(a.to, international) !== placeKey(b.from, international)) return null;
  const from = arrival(last(a));
  const to = departure(first(b));
  const start = calendarDay(from);
  const end = calendarDay(to);
  if (!start || !end || !(at(to) > at(from))) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS);
  if (days < 0) return null;
  return { id: `${last(a).id}:${first(b).id}`, days, place: stayPlace(a.to, international), fromId: last(a).id, toId: first(b).id };
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

function flattenVisits(route: Direction[], international: boolean): TripGroup[] {
  const groups: TripGroup[] = [];
  // Bookkeeping only: the rendered groups are always flat. A return closes
  // the destination it leaves; the resumed visit starts before its stay.
  const visited: Place[] = [route[0]!.from];
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
      country: p.country, continued, start, end: start, entries: [],
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
      const stay = stayBetween(previous, direction, international);
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

export function buildTripGroups(rows: JourneyRow[]): TravelTrip[] {
  const ordered = directions(rows.filter(row => !row.deletedAt));
  const trips: TravelTrip[] = [];
  for (let i = 0; i < ordered.length;) {
    const start = ordered[i++]!;
    const international = !!start.from.country && !!start.to.country && start.from.country !== start.to.country;
    const home = placeKey(start.from, international);
    const route = [start];
    while (i < ordered.length && placeKey(route[route.length - 1]!.to, international) !== home) {
      const next = ordered[i]!;
      if (!canFollow(route[route.length - 1]!, next, international)) break;
      route.push(next);
      i++;
    }
    trips.push({ id: first(start).id, journeys: route.flatMap(d => d.legs), groups: flattenVisits(route, international) });
  }
  return trips;
}

/** Dates belong to the airports' calendars, including an overnight landing
 * home. A stay counts only arrival-to-departure at the visited destination. */
export function tripGroupDates(group: TripGroup, currentYear: number): string {
  const start = calendarDay(group.start);
  const end = calendarDay(group.end);
  if (!start) return '';
  const month = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
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

/** Classify the complete trip before highlighting its active flight row.
 * A trip remains current between its flights and through the hero's arrival
 * window. Flights stay in travel order; completed trips are newest first. */
export function tripListSections(rows: JourneyRow[], now: Date, heroId: string | null = null): TripListSection[] {
  const visible = rows.filter(r => !r.deletedAt);
  const phase = new Map(groupJourneys(visible, now).flatMap(s => s.data.map(r => [r.id, s.key] as const)));
  const connections = connectionsInto(rows.filter(r => !r.deletedAt));
  const filed = buildTripGroups(rows).map(trip => {
    const keys = trip.journeys.map(r => phase.get(r.id));
    const year = calendarDay(departure(trip.journeys[0]!))?.slice(0, 4) ?? 'undated';
    const hasHero = trip.journeys.some(r => r.id === heroId);
    const started = at(departure(trip.journeys[0]!)) <= now.getTime();
    const current = hasHero || keys.includes('live') || (started && keys.includes('upcoming'));
    const key = current ? 'current' : keys.includes('upcoming') ? 'upcoming' : year;
    return { trip, key, hasHero };
  });
  const rank = (key: string) => key === 'current' ? 0 : key === 'upcoming' ? 1 : key === 'undated' ? Infinity : 10_000 - Number(key);
  filed.sort((a, b) => rank(a.key) - rank(b.key) ||
    Number(b.hasHero) - Number(a.hasHero) ||
    (a.key === 'current' || a.key === 'upcoming' ? 1 : -1) *
    (at(departure(a.trip.journeys[0]!)) - at(departure(b.trip.journeys[0]!))));

  const sections: TripListSection[] = [];
  for (const { trip, key } of filed) {
    const items: TripListItem[] = [];
    // Travel order is what a traveller wants of a trip they are on or about to
    // take: the legs come in the order they will be flown. A finished trip is
    // read the other way, newest first, like the trips around it — so its
    // destinations are reversed and the whole past list descends by date.
    // Each destination keeps its own flight-then-stay order internally.
    const completed = key !== 'current' && key !== 'upcoming';
    for (const group of completed ? [...trip.groups].reverse() : trip.groups) {
      const entries = group.entries;
      items.push({ kind: 'header', key: `header:${group.id}`, group, dates: tripGroupDates(group, now.getFullYear()) });
      let previousId: string | undefined;
      for (const entry of entries) {
        if (entry.kind === 'stay') {
          items.push(entry);
          previousId = undefined;
        } else {
          const connection = connections.get(entry.journey.id);
          items.push({ ...entry, live: phase.get(entry.journey.id) === 'live', hero: entry.journey.id === heroId, connection: connection?.prevId === previousId ? connection : undefined });
          previousId = entry.journey.id;
        }
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
