import { COUNTRY_NAMES } from '@/constants/countries';
import { airportZone, getAirport } from '@/services/airports';
import { wallClock } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';
import { airlineOf, blockMinutes, cityOf } from '@/services/timeline';

/** The lists behind the Travel stats cards — flights ranked, places grouped
 * by country, airlines ranked — and the small facts the themed cards need:
 * the local time in a city, a country's flag, how far round the Earth a
 * total is. Pure functions over the journal rows; the screens only
 * sort and draw. */

/** Mean equatorial circumference, km. */
const EARTH_KM = 40_075;

/** "1.3× around the Earth", and how far along to the next whole lap the bar
 * should sit. Under one lap the fraction is of the first. */
export function aroundEarth(totalKm: number): { laps: number; progress: number; next: number } {
  const laps = totalKm / EARTH_KM;
  const next = Math.max(1, Math.ceil(laps === Math.floor(laps) ? laps + 1 : laps));
  const from = next - 1;
  return { laps, progress: Math.min(1, Math.max(0, (laps - from) / 1)), next };
}

/** The regional-indicator pair for an ISO 3166-1 alpha-2 code; '' for
 * anything that isn't two letters. */
export function flagEmoji(country: string | null | undefined): string {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

export function localClockAt(iata: string, now: Date): string | null {
  const zone = airportZone(iata);
  return zone ? wallClock(now.toISOString(), zone) : null;
}

/** Block time in minutes for a row, or null when its clocks can't be
 * differenced — the placeholder pair, or times the airports' zones can't pin. */
export function rowMinutes(row: JourneyRow): number | null {
  return blockMinutes(
    row.scheduledDeparture,
    row.scheduledArrival,
    airportZone(row.fromCode),
    airportZone(row.toCode),
  );
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export type FlightSort = 'distance' | 'duration' | 'newest';

/** Every flight in order: by distance, by time in the air (rows without a
 * usable duration go last, in distance order), or newest first. */
export function rankFlights(rows: JourneyRow[], by: FlightSort): JourneyRow[] {
  const list = [...rows];
  if (by === 'distance') return list.sort((a, b) => b.distanceKm - a.distanceKm);
  if (by === 'newest') {
    return list.sort((a, b) => b.scheduledDeparture.localeCompare(a.scheduledDeparture));
  }
  return list.sort((a, b) => {
    const da = rowMinutes(a);
    const db = rowMinutes(b);
    if (da === null && db === null) return b.distanceKm - a.distanceKm;
    if (da === null) return 1;
    if (db === null) return -1;
    return db - da;
  });
}

export interface PlaceAirport {
  iata: string;
  city: string;
  landings: number;
  takeoffs: number;
}

export interface PlaceGroup {
  country: string;
  name: string;
  flag: string;
  cities: string[];
  airports: PlaceAirport[];
  landings: number;
  takeoffs: number;
  /** Latest departure or arrival there, ISO — for "latest" order. */
  latest: string;
}

export type PlaceSort = 'visits' | 'name' | 'latest';

/** The journal's airports grouped by country, each airport counting the
 * landings and take-offs there. A row whose airport isn't in the table
 * still counts under its stored country code. */
export function placeGroups(rows: JourneyRow[], by: PlaceSort = 'visits'): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  const airportOf = (group: PlaceGroup, iata: string): PlaceAirport => {
    let airport = group.airports.find((a) => a.iata === iata);
    if (!airport) {
      airport = { iata, city: cityOf(iata), landings: 0, takeoffs: 0 };
      group.airports.push(airport);
    }
    return airport;
  };
  const groupOf = (iata: string, fallbackCountry: string): PlaceGroup => {
    const country = getAirport(iata)?.country ?? fallbackCountry ?? '';
    let group = groups.get(country);
    if (!group) {
      group = {
        country,
        name: countryName(country),
        flag: flagEmoji(country),
        cities: [],
        airports: [],
        landings: 0,
        takeoffs: 0,
        latest: '',
      };
      groups.set(country, group);
    }
    return group;
  };
  for (const row of rows) {
    const from = groupOf(row.fromCode, row.fromCountry);
    airportOf(from, row.fromCode).takeoffs += 1;
    from.takeoffs += 1;
    if (row.scheduledDeparture > from.latest) from.latest = row.scheduledDeparture;
    const to = groupOf(row.toCode, row.toCountry);
    airportOf(to, row.toCode).landings += 1;
    to.landings += 1;
    if (row.scheduledArrival > to.latest) to.latest = row.scheduledArrival;
  }
  for (const group of groups.values()) {
    group.airports.sort((a, b) => b.landings + b.takeoffs - (a.landings + a.takeoffs));
    group.cities = [...new Set(group.airports.map((a) => a.city))];
  }
  const list = [...groups.values()];
  if (by === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
  if (by === 'latest') return list.sort((a, b) => b.latest.localeCompare(a.latest));
  return list.sort(
    (a, b) => b.landings + b.takeoffs - (a.landings + a.takeoffs) || b.landings - a.landings,
  );
}

export interface AirlineRank {
  carrier: string;
  /** A flight number flown with them, for the logo's code. */
  number: string;
  flights: number;
  km: number;
  /** Mean of the traveller's stars, null until a flight is rated. */
  rating: number | null;
  rated: number;
  latest: string;
}

export type AirlineSort = 'flights' | 'distance' | 'rating';

/** Every airline flown, ranked. Manual entries without a recognised number
 * carry no airline and are left out. */
export function airlineRanks(rows: JourneyRow[], by: AirlineSort = 'flights'): AirlineRank[] {
  const ranks = new Map<string, AirlineRank & { stars: number }>();
  for (const row of rows) {
    const carrier = airlineOf(row);
    if (!carrier) continue;
    let rank = ranks.get(carrier);
    if (!rank) {
      rank = { carrier, number: row.number, flights: 0, km: 0, rating: null, rated: 0, stars: 0, latest: '' };
      ranks.set(carrier, rank);
    }
    if (!rank.number && row.number) rank.number = row.number;
    rank.flights += 1;
    rank.km += row.distanceKm;
    if (row.rating != null) {
      rank.stars += row.rating;
      rank.rated += 1;
      rank.rating = rank.stars / rank.rated;
    }
    if (row.scheduledDeparture > rank.latest) rank.latest = row.scheduledDeparture;
  }
  const list = [...ranks.values()].map(({ stars: _stars, ...rank }) => rank);
  if (by === 'distance') return list.sort((a, b) => b.km - a.km);
  if (by === 'rating') {
    return list.sort(
      (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.rated - a.rated || b.flights - a.flights,
    );
  }
  return list.sort((a, b) => b.flights - a.flights || b.km - a.km);
}

/** Who built an aircraft, from the provider's model string: the first word,
 * with the makers that go by two ("De Havilland") kept whole. */
export function aircraftMaker(model: string): string {
  const name = model.trim();
  const two = /^(De Havilland|British Aerospace|McDonnell Douglas|Sukhoi Superjet)/i.exec(name);
  if (two) return two[1];
  return name.split(/[\s-]/)[0] || name;
}

export interface AircraftRank {
  /** The type as the provider names it — "Airbus A350-900". */
  model: string;
  maker: string;
  flights: number;
  km: number;
  /** Distinct registrations seen — how many different airframes of the type. */
  airframes: number;
  latest: string;
}

export interface MakerRank {
  maker: string;
  flights: number;
  km: number;
  models: number;
}

export type AircraftSort = 'flights' | 'distance';

/** Every aircraft type flown, ranked. Only flights found by number carry
 * one; journal entries are left out. */
export function aircraftRanks(rows: JourneyRow[], by: AircraftSort = 'flights'): AircraftRank[] {
  const ranks = new Map<string, AircraftRank & { regs: Set<string> }>();
  for (const row of rows) {
    const model = row.aircraftModel?.trim();
    if (!model) continue;
    let rank = ranks.get(model);
    if (!rank) {
      rank = { model, maker: aircraftMaker(model), flights: 0, km: 0, airframes: 0, latest: '', regs: new Set() };
      ranks.set(model, rank);
    }
    rank.flights += 1;
    rank.km += row.distanceKm;
    if (row.aircraftReg) rank.regs.add(row.aircraftReg);
    if (row.scheduledDeparture > rank.latest) rank.latest = row.scheduledDeparture;
  }
  const list = [...ranks.values()].map(({ regs, ...rank }) => ({ ...rank, airframes: regs.size }));
  if (by === 'distance') return list.sort((a, b) => b.km - a.km);
  return list.sort((a, b) => b.flights - a.flights || b.km - a.km);
}

/** The makers behind the types: Boeing 6 flights across 3 models, and so on. */
export function makerRanks(types: AircraftRank[]): MakerRank[] {
  const makers = new Map<string, MakerRank>();
  for (const type of types) {
    const maker = makers.get(type.maker) ?? { maker: type.maker, flights: 0, km: 0, models: 0 };
    maker.flights += type.flights;
    maker.km += type.km;
    maker.models += 1;
    makers.set(type.maker, maker);
  }
  return [...makers.values()].sort((a, b) => b.flights - a.flights || b.km - a.km);
}

export interface DestinationDetail {
  city: string;
  country: string;
  /** Airports in that city the traveller has landed at, most first. */
  codes: string[];
  landings: number;
}

/** What the destination card needs about a city: its country and the codes
 * landed at there. Null when the city isn't in the rows. */
export function destinationDetail(rows: JourneyRow[], city: string): DestinationDetail | null {
  const counts = new Map<string, number>();
  let country = '';
  for (const row of rows) {
    if (cityOf(row.toCode) !== city) continue;
    counts.set(row.toCode, (counts.get(row.toCode) ?? 0) + 1);
    if (!country) country = getAirport(row.toCode)?.country ?? row.toCountry;
  }
  if (!counts.size) return null;
  const codes = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);
  return { city, country, codes, landings: [...counts.values()].reduce((a, b) => a + b, 0) };
}

/** "4.5 ★" — one decimal unless whole. */
export function formatStars(rating: number): string {
  return `${Number.isInteger(rating) ? rating : rating.toFixed(1)} ★`;
}

export function plural(count: number, noun: string, nouns = `${noun}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? noun : nouns}`;
}
