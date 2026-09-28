/** Where the traveller lives, and since when — see docs/home-base.md.
 *
 * Pure logic, no React: periods of home, the automatic fallback, editing
 * without overlaps, moves, and the prompts that offer them. A day here is
 * always the departure airport's local calendar day (the day the Flights
 * list prints), as YYYY-MM-DD, so string comparison orders it. */
import { chainLegs } from '../../convex/itineraryShared';

import { airportZone, getAirport } from '@/services/airports';
import { legInstant } from '@/services/connections';
import { flightDay } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';
import { cityOf } from '@/services/timeline';

export interface HomePlace {
  /** cityOf() name: "London" folds LHR, LGW, STN and LCY. */
  city: string;
  /** ISO 3166-1 alpha-2, upper case; '' when unknown. */
  country: string;
}

export interface HomePeriod extends HomePlace {
  id: string;
  /** Inclusive; null = since the first flight. */
  from: string | null;
  /** Inclusive; null = still home. */
  until: string | null;
}

export interface HomeBaseState {
  periods: HomePeriod[];
  /** Answered prompts: `nudge:<country>:<city>`, `move:<journeyId>`. */
  dismissed: string[];
  /** Last local change in ms; 0 = never set (Automatic). */
  updatedAt: number;
}

export const EMPTY_HOME_BASE: HomeBaseState = { periods: [], dismissed: [], updatedAt: 0 };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function samePlace(a: HomePlace | null | undefined, b: HomePlace | null | undefined): boolean {
  return !!a && !!b && a.city === b.city && a.country === b.country;
}

export function placeKey(p: HomePlace): string {
  return `${p.country}:${p.city}`;
}

/** The home city an airport belongs to. Unknown codes stand for themselves. */
export function airportPlace(code: string, fallbackCountry = ''): HomePlace {
  const iata = code.trim().toUpperCase();
  const airport = getAirport(iata);
  const country = (airport?.country ?? fallbackCountry).trim().toUpperCase();
  return { city: airport ? cityOf(iata) : iata, country: /^[A-Z]{2}$/.test(country) ? country : '' };
}

/** Whether the airport is in the home city. */
export function atHome(code: string, home: HomePlace | null | undefined, fallbackCountry = ''): boolean {
  return samePlace(airportPlace(code, fallbackCountry), home);
}

/** The local day a row departs. */
export function departureDay(row: Pick<JourneyRow, 'scheduledDeparture' | 'fromCode'>): string {
  return flightDay(row.scheduledDeparture, airportZone(row.fromCode)).slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function validDay(day: unknown): day is string {
  if (typeof day !== 'string' || !DAY.test(day)) return false;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
}

function byStart(a: HomePeriod, b: HomePeriod): number {
  return (a.from ?? '') < (b.from ?? '') ? -1 : (a.from ?? '') > (b.from ?? '') ? 1 : 0;
}

/** Drops anything malformed (storage, another app version, the server) and
 * restores the order and non-overlap every other function relies on. */
export function sanitize(input: unknown): HomeBaseState {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof HomeBaseState, unknown>>;
  const periods: HomePeriod[] = [];
  for (const p of Array.isArray(raw.periods) ? raw.periods : []) {
    if (!p || typeof p !== 'object') continue;
    const { id, city, country, from, until } = p as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof city !== 'string' || !city.trim()) continue;
    if (from !== null && !validDay(from)) continue;
    if (until !== null && !validDay(until)) continue;
    if (from && until && from > until) continue;
    periods.push({ id, city: city.trim(), country: typeof country === 'string' ? country.toUpperCase() : '', from: from ?? null, until: until ?? null });
  }
  let state: HomeBaseState = { periods: [], dismissed: [], updatedAt: 0 };
  for (const p of periods.sort(byStart)) state = { ...state, periods: upsertPeriod(state, p).periods };
  const dismissed = Array.isArray(raw.dismissed) ? raw.dismissed.filter((d): d is string => typeof d === 'string').slice(-200) : [];
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
  return { periods: state.periods, dismissed, updatedAt };
}

/** The period covering a day, if any. */
export function homeOn(state: HomeBaseState, day: string): HomePeriod | null {
  return state.periods.find((p) => (p.from === null || p.from <= day) && (p.until === null || day <= p.until)) ?? null;
}

/** The journal's flights door to door: a connection's legs as one flight
 * from its first take-off to its last landing, under the first leg's id. A
 * layover is not a take-off from home — counting it made Doha the home of
 * anyone who connects there. */
export function doorToDoor(rows: JourneyRow[]): JourneyRow[] {
  const flights = rows.filter((r) => !r.deletedAt && r.mode === 'flight');
  return chainLegs(flights, legInstant).map((legs) => {
    const last = legs[legs.length - 1]!;
    return legs.length === 1 ? legs[0]! : { ...legs[0]!, toCode: last.toCode, toCountry: last.toCountry, scheduledArrival: last.scheduledArrival };
  });
}

/** The automatic home: the city the traveller leaves from and lives in. Each
 * city scores its take-offs plus the days spent on the ground there between
 * trips — landing and next taking off from the same city — a week counting
 * as much as one take-off. Take-offs alone made a hub home: a London
 * traveller whose US trips all ended in Dallas had seven departures from DFW
 * against six from Heathrow, though the months between trips were spent in
 * London. Days alone fail the other way: a journal of outbound flights only
 * (the flights home never logged) shows no time at home at all, and one
 * readable week in Los Angeles would win. A gap whose next flight leaves
 * from another city (a road trip, a flight not logged) says nothing about
 * where the time went and is not counted, and neither is time still to come.
 */
const DAYS_PER_TAKE_OFF = 7;

export function autoHome(rows: JourneyRow[], now = Date.now()): (HomePlace & { departures: number; total: number; days: number }) | null {
  const flights = doorToDoor(rows)
    .slice()
    .sort((a, b) => Date.parse(a.scheduledDeparture) - Date.parse(b.scheduledDeparture));
  const counts = new Map<string, { place: HomePlace; count: number; days: number }>();
  const entry = (place: HomePlace) => {
    const key = placeKey(place);
    const found = counts.get(key) ?? { place, count: 0, days: 0 };
    counts.set(key, found);
    return found;
  };
  flights.forEach((row, i) => {
    entry(airportPlace(row.fromCode, row.fromCountry)).count += 1;
    const next = flights[i + 1];
    if (!next) return;
    const landed = airportPlace(row.toCode, row.toCountry);
    if (placeKey(landed) !== placeKey(airportPlace(next.fromCode, next.fromCountry))) return;
    // Only time already spent: a planned stay abroad next month is not home yet.
    const ground = (Math.min(Date.parse(next.scheduledDeparture), now) - Date.parse(row.scheduledArrival || row.scheduledDeparture)) / DAY_MS;
    if (Number.isFinite(ground) && ground > 0) entry(landed).days += ground;
  });
  const score = (e: { count: number; days: number }) => e.count + e.days / DAYS_PER_TAKE_OFF;
  let best: { place: HomePlace; count: number; days: number } | null = null;
  for (const e of counts.values()) if (!best || score(e) > score(best)) best = e;
  return best ? { ...best.place, departures: best.count, total: flights.length, days: Math.round(best.days) } : null;
}

export interface CurrentHome extends HomePlace {
  source: 'set' | 'auto';
  period: HomePeriod | null;
  /** Take-offs from this city in the whole journal. */
  departures: number;
  total: number;
  /** Automatic only: days spent here between trips (0 when none could be read). */
  days?: number;
}

/** Today's home: the period covering today, else the automatic one. */
export function currentHome(state: HomeBaseState, rows: JourneyRow[], today: string): CurrentHome | null {
  const flights = doorToDoor(rows);
  const period = homeOn(state, today);
  if (period) {
    const departures = flights.filter((r) => atHome(r.fromCode, period, r.fromCountry)).length;
    return { city: period.city, country: period.country, source: 'set', period, departures, total: flights.length };
  }
  const auto = autoHome(flights);
  return auto ? { city: auto.city, country: auto.country, source: 'auto', period: null, departures: auto.departures, total: auto.total, days: auto.days } : null;
}

/** The home a flight counts from, as a lookup by instant (ms) for trip
 * grouping: a period covering the local day, else null (Automatic). */
export function homeLookup(state: HomeBaseState): ((row: JourneyRow) => HomePlace | null) | undefined {
  if (!state.periods.length) return undefined;
  return (row) => homeOn(state, departureDay(row));
}

/** The home trips are grouped from. Set periods rule, and a day none of them
 * covers has no home (Automatic's own rule), because one guessed city for the
 * whole journal would be wrong for the years before a move. With no periods
 * at all, the automatic home stands for every flight. */
export function groupingHome(state: HomeBaseState, rows: JourneyRow[], now = Date.now()): ((row: JourneyRow) => HomePlace | null) | undefined {
  const set = homeLookup(state);
  if (set) return set;
  const auto = autoHome(rows, now);
  if (!auto) return undefined;
  const home: HomePlace = { city: auto.city, country: auto.country };
  return () => home;
}

/** The home on a calendar day, for day counts (services/country-days): the
 * same rule as groupingHome — set periods, with no home on a day none of
 * them covers, else the automatic home for every day. */
export function homeByDay(state: HomeBaseState, rows: JourneyRow[], now = Date.now()): (day: string) => HomePlace | null {
  if (state.periods.length) {
    return (day) => {
      const p = homeOn(state, day);
      return p ? { city: p.city, country: p.country } : null;
    };
  }
  const auto = autoHome(rows, now);
  const home = auto ? { city: auto.city, country: auto.country } : null;
  return () => home;
}

export interface UpsertResult {
  periods: HomePeriod[];
  /** What happened to neighbours, for the editor to say before saving. */
  changes: { id: string; city: string; change: 'trimmed' | 'removed'; from: string | null; until: string | null }[];
}

/** Adds or replaces a period and trims whatever it overlaps. */
export function upsertPeriod(state: HomeBaseState, period: HomePeriod): UpsertResult {
  if (period.from && period.until && period.from > period.until) throw new Error('A period cannot end before it starts.');
  const lo = period.from ?? '';
  const hi = period.until ?? '9999-12-31';
  const changes: UpsertResult['changes'] = [];
  const kept: HomePeriod[] = [];
  for (const other of state.periods) {
    if (other.id === period.id) continue;
    const oLo = other.from ?? '';
    const oHi = other.until ?? '9999-12-31';
    if (oHi < lo || oLo > hi) { kept.push(other); continue; }
    const before = oLo < lo ? { ...other, until: addDays(lo, -1) } : null;
    const after = oHi > hi && period.until ? { ...other, from: addDays(period.until, 1) } : null;
    if (before && after) {
      // A period inside another splits it in two.
      kept.push(before, { ...after, id: `${other.id}~${period.until}` });
      changes.push({ id: other.id, city: other.city, change: 'trimmed', from: before.from, until: before.until });
    } else if (before) {
      kept.push(before);
      changes.push({ id: other.id, city: other.city, change: 'trimmed', from: before.from, until: before.until });
    } else if (after) {
      kept.push(after);
      changes.push({ id: other.id, city: other.city, change: 'trimmed', from: after.from, until: after.until });
    } else {
      changes.push({ id: other.id, city: other.city, change: 'removed', from: other.from, until: other.until });
    }
  }
  kept.push(period);
  return { periods: kept.sort(byStart), changes };
}

export function removePeriod(state: HomeBaseState, id: string): HomePeriod[] {
  return state.periods.filter((p) => p.id !== id);
}

let counter = 0;
export function newPeriodId(): string {
  counter += 1;
  return `home-${Date.now().toString(36)}-${counter}`;
}

/** The picker's "Make London home": today's home becomes the place. */
export function setCurrentHome(state: HomeBaseState, place: HomePlace, today: string): HomePeriod[] {
  if (!state.periods.length) return [{ id: newPeriodId(), ...place, from: null, until: null }];
  const covering = homeOn(state, today);
  if (covering) return state.periods.map((p) => (p.id === covering.id ? { ...p, ...place } : p));
  const last = [...state.periods].sort(byStart).pop()!;
  const from = last.until && last.until < today ? addDays(last.until, 1) : today;
  return upsertPeriod(state, { id: newPeriodId(), ...place, from, until: null }).periods;
}

/** A move on `day`: the old home ends the day before, the new one starts.
 * `previous` is the home to write for the time before when no period covers
 * it (the automatic one), so past trips keep counting from it. */
export function markMove(state: HomeBaseState, to: HomePlace, day: string, previous: HomePlace | null): HomePeriod[] {
  let periods = state.periods;
  const before = homeOn(state, addDays(day, -1));
  if (!before && previous && !samePlace(previous, to)) {
    const earlier = [...periods].filter((p) => p.until !== null && p.until < day).sort(byStart).pop();
    periods = upsertPeriod({ ...state, periods }, { id: newPeriodId(), ...previous, from: earlier?.until ? addDays(earlier.until, 1) : null, until: addDays(day, -1) }).periods;
  }
  const existing = homeOn({ ...state, periods }, day);
  if (existing && samePlace(existing, to) && existing.from === day) return periods;
  return upsertPeriod({ ...state, periods }, { id: newPeriodId(), ...to, from: day, until: null }).periods;
}

function pastFlights(rows: JourneyRow[], now: number): JourneyRow[] {
  return doorToDoor(rows)
    .filter((r) => legInstant(r.scheduledDeparture, r.fromCode) <= now)
    .sort((a, b) => legInstant(a.scheduledDeparture, a.fromCode) - legInstant(b.scheduledDeparture, b.fromCode));
}

export interface Nudge extends HomePlace {
  /** Take-offs from this city among the last `of`. */
  recent: number;
  of: number;
  /** Take-offs from today's home among the same flights. */
  fromHome: number;
  home: HomePlace | null;
  /** The first of those take-offs: where a move would start. */
  since: string;
}

const NUDGE_WINDOW = 8;

/** Round trips leave from home about half the time, so the sign of a move is
 * another city with at least 3 of the last 8 take-offs while today's home
 * has at most 1 — asked once per city. */
export function nudgeFor(state: HomeBaseState, rows: JourneyRow[], now: Date): Nudge | null {
  const past = pastFlights(rows, now.getTime());
  if (past.length < NUDGE_WINDOW) return null;
  const recent = past.slice(-NUDGE_WINDOW);
  const today = departureDay({ scheduledDeparture: now.toISOString(), fromCode: '' });
  const home = currentHome(state, rows, today);
  const counts = new Map<string, { place: HomePlace; rows: JourneyRow[] }>();
  for (const row of recent) {
    const place = airportPlace(row.fromCode, row.fromCountry);
    const entry = counts.get(placeKey(place)) ?? { place, rows: [] };
    entry.rows.push(row);
    counts.set(placeKey(place), entry);
  }
  const top = [...counts.values()].filter((e) => !samePlace(e.place, home)).sort((a, b) => b.rows.length - a.rows.length)[0];
  if (!top || top.rows.length < 3) return null;
  const fromHome = home ? recent.filter((r) => atHome(r.fromCode, home, r.fromCountry)).length : 0;
  if (fromHome > 1) return null;
  if (state.dismissed.includes(`nudge:${placeKey(top.place)}`)) return null;
  // The move itself: the last flight into the new city before its first take-off there.
  const firstIndex = past.indexOf(top.rows[0]!);
  const arrival = [...past.slice(0, firstIndex)].reverse().find((r) => atHome(r.toCode, top.place, r.toCountry));
  const since = arrival && home && atHome(arrival.fromCode, home, arrival.fromCountry) ? departureDay(arrival) : departureDay(top.rows[0]!);
  return { ...top.place, recent: top.rows.length, of: recent.length, fromHome, home: home ? { city: home.city, country: home.country } : null, since };
}

/** A past one-way flight from the home of its day to another city, not
 * followed by a return within 30 days, with at least 2 of the next 3
 * departures from the new city. */
export function moveCandidate(state: HomeBaseState, rows: JourneyRow[], journey: JourneyRow, now: Date): HomePlace | null {
  if (journey.mode !== 'flight' || journey.deletedAt) return null;
  if (state.dismissed.includes(`move:${journey.id}`)) return null;
  const past = pastFlights(rows, now.getTime());
  const index = past.findIndex((r) => r.id === journey.id);
  if (index < 0) return null;
  const day = departureDay(journey);
  const home = homeOn(state, day) ?? autoHome(past.slice(0, index + 1));
  if (!home || !atHome(journey.fromCode, home, journey.fromCountry)) return null;
  const to = airportPlace(journey.toCode, journey.toCountry);
  if (samePlace(to, home)) return null;
  if (samePlace(homeOn(state, day), to)) return null;
  const departed = legInstant(journey.scheduledDeparture, journey.fromCode);
  // Flying back from a visit that started in the destination is a return.
  const previous = past[index - 1];
  if (previous && atHome(previous.fromCode, to, previous.fromCountry) && atHome(previous.toCode, home, previous.toCountry)
    && departed - legInstant(previous.scheduledDeparture, previous.fromCode) <= 30 * DAY_MS) return null;
  const next = past.slice(index + 1);
  if (next.some((r) => atHome(r.toCode, home, r.toCountry) && legInstant(r.scheduledDeparture, r.fromCode) - departed <= 30 * DAY_MS)) return null;
  const following = next.slice(0, 3);
  if (following.length < 2 || following.filter((r) => atHome(r.fromCode, to, r.fromCountry)).length < 2) return null;
  return to;
}

export interface SuggestedPeriod extends HomePlace { from: string | null; until: string | null; departures: number; flights: number }

/** Homes the journal can show: each flight takes the city most departed
 * from in the 7 flights around it (round trips leave from home about half
 * the time), and consecutive flights of the same city form one home. A new
 * home starts with the first flight into it that is followed by a take-off
 * from it — the move. Two or more homes make a suggestion. */
export function suggestPeriods(rows: JourneyRow[], now: Date): SuggestedPeriod[] {
  const past = pastFlights(rows, now.getTime());
  const places = past.map((r) => airportPlace(r.fromCode, r.fromCountry));
  const labels: (HomePlace | null)[] = past.map((_, i) => {
    const window = places.slice(Math.max(0, i - 3), i + 4);
    const counts = new Map<string, { place: HomePlace; count: number }>();
    for (const place of window) {
      const entry = counts.get(placeKey(place)) ?? { place, count: 0 };
      entry.count += 1;
      counts.set(placeKey(place), entry);
    }
    const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
    const best = ranked[0]!;
    const needed = Math.max(2, Math.ceil(window.length / 3));
    return best.count >= needed && best.count > (ranked[1]?.count ?? 0) ? best.place : null;
  });
  const segments: { place: HomePlace; start: number; end: number }[] = [];
  labels.forEach((label, i) => {
    const last = segments[segments.length - 1];
    if (!label || (last && samePlace(last.place, label))) {
      if (last) last.end = i;
      return;
    }
    segments.push({ place: label, start: i, end: i });
  });
  const homes = segments.filter((seg) => places.slice(seg.start, seg.end + 1).filter((p) => samePlace(p, seg.place)).length >= 3);
  // Neighbouring segments of the same city (a gap between them) join up.
  const merged: typeof homes = [];
  for (const seg of homes) {
    const prev = merged[merged.length - 1];
    if (prev && samePlace(prev.place, seg.place)) prev.end = seg.end;
    else merged.push({ ...seg });
  }
  if (merged.length < 2) return [];
  const starts = merged.map((seg, k) => {
    if (k === 0) return null;
    const previous = merged[k - 1]!.place;
    for (let i = 0; i < past.length; i++) {
      const r = past[i]!;
      if (!atHome(r.fromCode, previous, r.fromCountry) || !atHome(r.toCode, seg.place, r.toCountry)) continue;
      if (i < merged[k - 1]!.start) continue;
      const after = past[i + 1];
      if (after && atHome(after.fromCode, seg.place, after.fromCountry)) return departureDay(r);
    }
    const first = past.slice(seg.start).find((r) => atHome(r.fromCode, seg.place, r.fromCountry));
    return first ? departureDay(first) : departureDay(past[seg.start]!);
  });
  return merged.map((seg, k) => {
    const from = starts[k]!;
    const until = k + 1 < merged.length ? addDays(starts[k + 1]!, -1) : null;
    const inside = past.filter((r) => {
      const d = departureDay(r);
      return (from === null || d >= from) && (until === null || d <= until);
    });
    return { ...seg.place, from, until, departures: inside.filter((r) => atHome(r.fromCode, seg.place, r.fromCountry)).length, flights: inside.length };
  });
}

/** Month labels for the period editor: "March 2025". */
export function monthLabel(day: string | null, open: 'start' | 'end'): string {
  if (!day) return open === 'start' ? 'Since your first flight' : 'Now';
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "January 2018 – February 2025", "March 2025 – now", "All the time". */
export function periodLabel(p: Pick<HomePeriod, 'from' | 'until'>): string {
  if (!p.from && !p.until) return 'All the time';
  if (!p.from) return `Until ${monthLabel(p.until, 'end')}`;
  return `${monthLabel(p.from, 'start')} – ${p.until ? monthLabel(p.until, 'end') : 'now'}`;
}

/** First and last day of the month holding `day`, shifted by `months`. */
export function monthStart(day: string, months = 0): string {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
export function monthEnd(day: string, months = 0): string {
  return addDays(monthStart(day, months + 1), -1);
}
