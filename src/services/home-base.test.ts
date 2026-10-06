import { getAirport } from './airports';
import {
  airportPlace,
  autoHome,
  currentHome,
  EMPTY_HOME_BASE,
  homeLookup,
  homeOn,
  markMove,
  moveCandidate,
  nudgeFor,
  periodLabel,
  sanitize,
  setCurrentHome,
  suggestPeriods,
  upsertPeriod,
  type HomeBaseState,
  type HomePeriod,
} from './home-base';
import type { JourneyRow } from './journeys';
import { destinationOf } from './destination';
import { buildTripGroups } from './trip-groups';
import { travelRecap } from './timeline';

function flight(id: string, from: string, to: string, departure: string, arrival: string, extra: Partial<JourneyRow> = {}): JourneyRow {
  return {
    id, mode: 'flight', fromCode: from, toCode: to,
    fromCountry: getAirport(from)?.country ?? '', toCountry: getAirport(to)?.country ?? '',
    scheduledDeparture: departure, scheduledArrival: arrival,
    bookingReference: null, deletedAt: null, carrier: 'Finnair', number: 'AY1', distanceKm: 1000, rating: null, ...extra,
  } as JourneyRow;
}
const HEL = { city: 'Helsinki', country: 'FI' };
const LON = { city: 'London', country: 'GB' };
const TYO = { city: 'Tokyo', country: 'JP' };
const period = (id: string, place: typeof HEL, from: string | null, until: string | null): HomePeriod => ({ id, ...place, from, until });
const state = (...periods: HomePeriod[]): HomeBaseState => ({ periods, dismissed: [], updatedAt: 1 });

describe('home periods', () => {
  const s = state(period('a', HEL, null, '2025-02-28'), period('b', LON, '2025-03-01', null));

  it('finds the period covering a day, boundaries inclusive', () => {
    expect(homeOn(s, '2018-01-01')?.id).toBe('a');
    expect(homeOn(s, '2025-02-28')?.id).toBe('a');
    expect(homeOn(s, '2025-03-01')?.id).toBe('b');
    expect(homeOn(s, '2030-01-01')?.id).toBe('b');
    expect(homeOn(state(period('x', HEL, '2020-01-01', '2020-12-31')), '2021-06-01')).toBeNull();
  });

  it('labels periods by month', () => {
    expect(periodLabel({ from: null, until: null })).toBe('All the time');
    expect(periodLabel({ from: '2025-03-01', until: null })).toBe('March 2025 – now');
    expect(periodLabel({ from: '2018-01-01', until: '2025-02-28' })).toBe('January 2018 – February 2025');
    expect(periodLabel({ from: null, until: '2025-02-28' })).toBe('Until February 2025');
  });
});

describe('automatic home', () => {
  it('folds a city’s airports: LHR and LGW together beat a single airport', () => {
    const rows = [
      flight('1', 'HEL', 'LHR', '2025-01-01T10:00', '2025-01-01T11:00'),
      flight('2', 'HEL', 'LHR', '2025-01-05T10:00', '2025-01-05T11:00'),
      flight('3', 'LHR', 'HEL', '2025-01-09T10:00', '2025-01-09T15:00'),
      flight('4', 'LGW', 'HEL', '2025-01-12T10:00', '2025-01-12T15:00'),
      flight('5', 'LCY', 'HEL', '2025-01-15T10:00', '2025-01-15T15:00'),
    ];
    expect(autoHome(rows)).toMatchObject({ ...LON, departures: 3, total: 5 });
  });

  it('never makes a connection hub the home', () => {
    // Production 1.1.5 (70): Kochi–Helsinki trips via Doha made Doha the
    // automatic home, since every connection took off from it.
    const trip = (n: number, day: string, back: string) => [
      flight(`${n}a`, 'COK', 'DOH', `${day}T04:15`, `${day}T06:05`),
      flight(`${n}b`, 'DOH', 'HEL', `${day}T08:25`, `${day}T14:30`),
      flight(`${n}c`, 'HEL', 'DOH', `${back}T17:30`, `${back}T23:40`),
      flight(`${n}d`, 'DOH', 'COK', `${addDay(back)}T02:40`, `${addDay(back)}T09:45`),
    ];
    const addDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const rows = [...trip(1, '2025-01-10', '2025-01-20'), ...trip(2, '2025-03-10', '2025-03-20'), flight('x', 'HEL', 'TLL', '2025-03-15T10:00', '2025-03-15T10:30')];
    // Home is where the time between trips goes: ~48 days in Kochi between
    // the two Helsinki visits (10 days each) — never the hub.
    expect(autoHome(rows)).toMatchObject({ city: 'Kochi', total: 5 });
    expect(currentHome(EMPTY_HOME_BASE, rows, '2026-01-01')).toMatchObject({ city: 'Kochi', source: 'auto' });
    expect(autoHome(rows)?.city).not.toBe('Doha');
  });

  it('counts days on the ground, not take-offs: a transit city is not home', () => {
    // A London traveller whose US trips all end in Dallas (1.1.6, a real
    // journal): seven take-offs from DFW against six from LHR made Dallas home.
    const rows = [
      flight('1', 'LHR', 'CLT', '2026-02-08T11:45', '2026-02-08T21:05'),
      flight('2', 'CLT', 'DFW', '2026-02-11T23:14', '2026-02-12T01:05'),
      flight('3', 'DFW', 'LHR', '2026-02-15T02:30', '2026-02-15T11:40'),
      flight('4', 'LHR', 'DFW', '2026-05-01T13:45', '2026-05-02T00:10'),
      flight('5', 'DFW', 'MKE', '2026-05-04T01:33', '2026-05-04T03:57'),
      flight('6', 'MKE', 'DFW', '2026-05-06T10:00', '2026-05-06T12:30'),
      flight('7', 'DFW', 'LHR', '2026-05-08T02:40', '2026-05-08T11:50'),
      flight('8', 'LHR', 'DFW', '2026-08-15T15:25', '2026-08-16T01:39'),
      flight('9', 'DFW', 'LHR', '2026-08-23T02:40', '2026-08-23T11:50'),
    ];
    const home = autoHome(rows);
    expect(home).toMatchObject({ ...LON });
    expect(home!.departures).toBeLessThan(rows.filter((r) => r.fromCode === 'DFW').length);
    expect(home!.days).toBeGreaterThan(150);
  });

  it('never counts a stay that has not happened yet', () => {
    // 18 days so far at home in Helsinki (to "today", 28 Sep); a planned month
    // in Dallas from 1 Oct would outweigh it if future time counted.
    const rows = [
      flight('1', 'HEL', 'LHR', '2026-09-01T10:00', '2026-09-01T11:00'),
      flight('2', 'LHR', 'HEL', '2026-09-10T10:00', '2026-09-10T15:00'),
      flight('3', 'HEL', 'DFW', '2026-10-01T10:00', '2026-10-01T20:00'),
      flight('4', 'DFW', 'HEL', '2026-10-31T10:00', '2026-11-01T08:00'),
    ];
    expect(autoHome(rows, Date.parse('2026-09-28T00:00:00Z'))).toMatchObject({ ...HEL });
    // Once that month has been spent, Dallas is where the time went.
    expect(autoHome(rows, Date.parse('2026-12-01T00:00:00Z'))?.city).toBe('Dallas-Fort Worth');
  });

  it('keeps a home whose flights back were never logged', () => {
    // Only outbound flights from Helsinki: no time there can be read, and one
    // week in Los Angeles between two onward flights must not win.
    const rows = [
      ...['01', '02', '03', '04', '05', '06'].map((m, i) => flight(`h${i}`, 'HEL', 'CDG', `2026-${m}-10T10:00`, `2026-${m}-10T12:00`)),
      flight('a', 'DXB', 'LAX', '2025-11-02T10:00', '2025-11-02T20:00'),
      flight('b', 'LAX', 'NRT', '2025-11-10T10:00', '2025-11-11T10:00'),
    ];
    expect(autoHome(rows, Date.parse('2026-09-28T00:00:00Z'))).toMatchObject({ ...HEL });
  });

  it('falls back to take-offs when no time on the ground can be read', () => {
    // Every next flight leaves from another city: no gap says where time went.
    const rows = [
      flight('1', 'HEL', 'LHR', '2025-01-01T10:00', '2025-01-01T11:00'),
      flight('2', 'HEL', 'CDG', '2025-02-01T10:00', '2025-02-01T12:00'),
      flight('3', 'ARN', 'HEL', '2025-03-01T10:00', '2025-03-01T11:00'),
    ];
    expect(autoHome(rows)).toMatchObject({ ...HEL, departures: 2, days: 0 });
  });

  it('keeps the first city on a tie and has nothing without flights', () => {
    expect(autoHome([flight('1', 'HEL', 'LHR', '2025-01-01T10:00', '2025-01-01T11:00'), flight('2', 'LHR', 'HEL', '2025-01-02T10:00', '2025-01-02T15:00')])).toMatchObject(HEL);
    expect(autoHome([])).toBeNull();
  });

  it('reads a set period before the automatic city', () => {
    const rows = [flight('1', 'HEL', 'LHR', '2025-01-01T10:00', '2025-01-01T11:00')];
    expect(currentHome(EMPTY_HOME_BASE, rows, '2026-01-01')).toMatchObject({ ...HEL, source: 'auto' });
    expect(currentHome(state(period('b', LON, null, null)), rows, '2026-01-01')).toMatchObject({ ...LON, source: 'set', departures: 0 });
  });

  it('maps an airport to its home city', () => {
    expect(airportPlace('LGW')).toEqual(LON);
    expect(airportPlace('ZZZ', 'fi')).toEqual({ city: 'ZZZ', country: 'FI' });
  });
});

describe('editing periods never overlaps', () => {
  const base = state(period('a', HEL, null, '2025-02-28'), period('b', LON, '2025-03-01', null));

  it('trims a neighbour on either side', () => {
    const r = upsertPeriod(base, period('c', TYO, '2024-06-01', '2025-05-31'));
    expect(r.periods.map(p => [p.id, p.from, p.until])).toEqual([
      ['a', null, '2024-05-31'], ['c', '2024-06-01', '2025-05-31'], ['b', '2025-06-01', null],
    ]);
    expect(r.changes.map(c => c.change)).toEqual(['trimmed', 'trimmed']);
  });

  it('removes a neighbour it covers and splits one it sits inside', () => {
    const inside = upsertPeriod(base, period('c', TYO, '2020-01-01', '2020-12-31'));
    expect(inside.periods.map(p => [p.city, p.from, p.until])).toEqual([
      ['Helsinki', null, '2019-12-31'], ['Tokyo', '2020-01-01', '2020-12-31'], ['Helsinki', '2021-01-01', '2025-02-28'], ['London', '2025-03-01', null],
    ]);
    const all = upsertPeriod(base, period('c', TYO, null, null));
    expect(all.periods.map(p => p.id)).toEqual(['c']);
    expect(all.changes.map(c => c.change)).toEqual(['removed', 'removed']);
  });

  it('keeps adjacent periods untouched and refuses an end before the start', () => {
    expect(upsertPeriod(base, { ...base.periods[1]!, city: 'Oxford' }).changes).toEqual([]);
    expect(() => upsertPeriod(base, period('c', TYO, '2025-01-01', '2024-01-01'))).toThrow();
  });
});

describe('changing today’s home and moving', () => {
  it('turns Automatic into one all-time period', () => {
    const periods = setCurrentHome(EMPTY_HOME_BASE, LON, '2026-09-27');
    expect(periods).toEqual([expect.objectContaining({ ...LON, from: null, until: null })]);
  });

  it('changes the city of today’s period, or appends after the last one', () => {
    const s = state(period('a', HEL, null, '2025-02-28'), period('b', LON, '2025-03-01', null));
    expect(setCurrentHome(s, TYO, '2026-09-27').map(p => p.city)).toEqual(['Helsinki', 'Tokyo']);
    const ended = state(period('a', HEL, null, '2025-02-28'));
    expect(setCurrentHome(ended, LON, '2026-09-27').map(p => [p.city, p.from, p.until])).toEqual([
      ['Helsinki', null, '2025-02-28'], ['London', '2025-03-01', null],
    ]);
  });

  it('splits at the move day and writes the automatic home for the time before', () => {
    const periods = markMove(EMPTY_HOME_BASE, LON, '2025-03-02', HEL);
    expect(periods.map(p => [p.city, p.from, p.until])).toEqual([['Helsinki', null, '2025-03-01'], ['London', '2025-03-02', null]]);
    const again = markMove({ ...EMPTY_HOME_BASE, periods }, LON, '2025-03-02', HEL);
    expect(again.map(p => [p.city, p.from, p.until])).toEqual([['Helsinki', null, '2025-03-01'], ['London', '2025-03-02', null]]);
  });

  it('moves within existing periods', () => {
    const s = state(period('a', HEL, null, null));
    expect(markMove(s, LON, '2025-03-02', null).map(p => [p.city, p.from, p.until])).toEqual([['Helsinki', null, '2025-03-01'], ['London', '2025-03-02', null]]);
  });
});

describe('storage and the server are never trusted blindly', () => {
  it('drops malformed periods and restores order', () => {
    const clean = sanitize({
      periods: [
        period('b', LON, '2025-03-01', null),
        { id: 'bad', city: '', country: 'FI', from: null, until: null },
        { id: 'bad2', city: 'X', country: 'FI', from: '2025-13-01', until: null },
        { id: 'bad3', city: 'X', country: 'FI', from: '2025-05-01', until: '2025-01-01' },
        period('a', HEL, null, '2025-02-28'),
      ],
      dismissed: ['nudge:GB:London', 7],
      updatedAt: 'x',
    });
    expect(clean.periods.map(p => p.id)).toEqual(['a', 'b']);
    expect(clean.dismissed).toEqual(['nudge:GB:London']);
    expect(clean.updatedAt).toBe(0);
    expect(sanitize(null)).toEqual(EMPTY_HOME_BASE);
  });
});

// Helsinki until March 2025, then London.
const history = [
  flight('h1', 'HEL', 'HND', '2024-10-03T17:00', '2024-10-04T08:00'),
  flight('h2', 'HND', 'HEL', '2024-10-17T10:00', '2024-10-17T15:00'),
  flight('h3', 'HEL', 'MAD', '2024-11-01T09:00', '2024-11-01T13:00'),
  flight('h4', 'MAD', 'HEL', '2024-11-05T14:00', '2024-11-05T20:00'),
  flight('h5', 'HEL', 'CDG', '2024-12-01T09:00', '2024-12-01T11:00'),
  flight('h6', 'CDG', 'HEL', '2024-12-04T12:00', '2024-12-04T16:00'),
  flight('move', 'HEL', 'LHR', '2025-03-02T07:40', '2025-03-02T08:55'),
  flight('l1', 'LGW', 'MAD', '2025-08-11T08:00', '2025-08-11T11:30'),
  flight('l2', 'MAD', 'LGW', '2025-08-15T12:00', '2025-08-15T13:40'),
  flight('l3', 'LHR', 'HEL', '2025-12-18T10:00', '2025-12-18T15:00'),
  flight('l4', 'HEL', 'LHR', '2025-12-24T09:00', '2025-12-24T10:15'),
  flight('l5', 'LHR', 'FRA', '2026-02-01T08:00', '2026-02-01T10:30'),
  flight('l6', 'FRA', 'LHR', '2026-02-03T18:00', '2026-02-03T18:50'),
  flight('l7', 'LCY', 'CDG', '2026-04-01T08:00', '2026-04-01T10:15'),
  flight('l8', 'CDG', 'LCY', '2026-04-03T18:00', '2026-04-03T18:20'),
];
const NOW = new Date('2026-09-27T12:00:00Z');
const moved = state(period('a', HEL, null, '2025-03-01'), period('b', LON, '2025-03-02', null));

describe('prompts', () => {
  it('nudges when another city leads the last 8 take-offs and home has at most 1, once', () => {
    const helsinki = state(period('a', HEL, null, null));
    const nudge = nudgeFor(helsinki, history, NOW);
    expect(nudge).toMatchObject({ ...LON, recent: 4, of: 8, fromHome: 1, home: HEL, since: '2025-03-02' });
    expect(nudgeFor({ ...helsinki, dismissed: [`nudge:GB:London`] }, history, NOW)).toBeNull();
    expect(nudgeFor(moved, history, NOW)).toBeNull();
    expect(nudgeFor(helsinki, history.slice(0, 6), NOW)).toBeNull();
    // Still flying from Helsinki half the time: no nudge.
    expect(nudgeFor(helsinki, history.slice(0, 11), NOW)).toBeNull();
  });

  it('offers the one-way flight as a move, and only that flight', () => {
    const auto = EMPTY_HOME_BASE;
    const move = history.find(r => r.id === 'move')!;
    expect(moveCandidate(auto, history, move, NOW)).toEqual(LON);
    expect(moveCandidate({ ...auto, dismissed: ['move:move'] }, history, move, NOW)).toBeNull();
    expect(moveCandidate(moved, history, move, NOW)).toBeNull();
    expect(moveCandidate(auto, history, history.find(r => r.id === 'h1')!, NOW)).toBeNull();
    expect(moveCandidate(auto, history, history.find(r => r.id === 'l4')!, NOW)).toBeNull();
  });

  it('suggests the homes it can see in the take-offs', () => {
    const suggested = suggestPeriods(history, NOW);
    expect(suggested.map(p => p.city)).toEqual(['Helsinki', 'London']);
    expect(suggested[0]).toMatchObject({ from: null });
    expect(suggested[1]!.from).toBe(suggested[0]!.until ? new Date(Date.parse(`${suggested[0]!.until}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : null);
    expect(suggestPeriods(history.slice(0, 6), NOW)).toEqual([]);
  });
});

describe('trips count from the home you had then', () => {
  const groups = (s: HomeBaseState) => buildTripGroups(history, homeLookup(s)).map(t => t.groups.map(g => g.title).join(' + '));

  it('without a home base, grouping is unchanged', () => {
    expect(homeLookup(EMPTY_HOME_BASE)).toBeUndefined();
    expect(buildTripGroups(history, homeLookup(EMPTY_HOME_BASE))).toEqual(buildTripGroups(history));
  });

  it('the move is its own item and London trips no longer chain onto it', () => {
    const titles = groups(moved);
    expect(titles).toContain('Moved to London');
    expect(titles).toEqual(['Tokyo', 'Madrid', 'Paris', 'Moved to London', 'Madrid', 'Helsinki', 'Frankfurt am Main', 'Paris']);
  });

  it('a visit to the former home is a destination with its stay', () => {
    const trip = buildTripGroups(history, homeLookup(moved)).find(t => t.groups[0]!.title === 'Helsinki')!;
    expect(trip.journeys.map(j => j.id)).toEqual(['l3', 'l4']);
    expect(trip.groups[0]!.entries.some(e => e.kind === 'stay' && e.stay.days === 6)).toBe(true);
  });

  it('a lone flight home groups under where it came from', () => {
    const lone = [flight('r', 'HND', 'HEL', '2024-10-17T10:00', '2024-10-17T15:00')];
    expect(buildTripGroups(lone, homeLookup(state(period('a', HEL, null, null)))).map(t => t.groups[0]!.title)).toEqual(['Tokyo']);
    expect(buildTripGroups(lone).map(t => t.groups[0]!.title)).toEqual(['Helsinki']);
  });

  it('a trip with no flight out logged ends at home, under the city it came from', () => {
    // Siraj, November 2025: the flight out from London is missing, so the
    // trip's first flight is inside the US. The flight home closes Dallas.
    const rows = [
      flight('sna', 'SNA', 'DFW', '2025-11-09T06:00', '2025-11-09T11:10'),
      flight('lhr', 'DFW', 'LHR', '2025-11-14T17:20', '2025-11-15T08:30'),
    ];
    const london = buildTripGroups(rows, homeLookup(state(period('a', LON, null, null))));
    expect(london.map(t => t.groups.map(g => g.title))).toEqual([['Dallas-Fort Worth']]);
    expect(london[0]!.groups[0]!.entries.map(e => (e.kind === 'flight' ? e.journey.id : e.stay.place))).toEqual(['sna', 'Dallas-Fort Worth', 'lhr']);
    // Without a home there is nothing to end at: today's headings stay.
    expect(buildTripGroups(rows).flatMap(t => t.groups.map(g => g.title))).toEqual(['Dallas-Fort Worth', 'London']);
  });

  it('names a one-city stay by its city at home and abroad, an open jaw abroad by its country', () => {
    const DALLAS = { city: 'Dallas-Fort Worth', country: 'US' };
    const rows = [
      // 2022, living in Dallas: Los Angeles at home, London abroad.
      flight('a1', 'DFW', 'LAX', '2022-03-01T08:00', '2022-03-01T09:30'),
      flight('a2', 'LAX', 'DFW', '2022-03-05T10:00', '2022-03-05T15:00'),
      flight('b1', 'DFW', 'LHR', '2022-06-01T17:00', '2022-06-02T08:00'),
      flight('b2', 'LHR', 'DFW', '2022-06-10T10:00', '2022-06-10T14:00'),
      // 2025, living in London: Dallas abroad, Manchester at home.
      flight('c1', 'LHR', 'DFW', '2025-10-04T14:45', '2025-10-04T19:10'),
      flight('c2', 'DFW', 'LHR', '2025-10-17T20:35', '2025-10-18T11:50'),
      flight('d1', 'LHR', 'MAN', '2025-11-01T08:00', '2025-11-01T09:00'),
      flight('d2', 'MAN', 'LHR', '2025-11-04T18:00', '2025-11-04T19:00'),
      // In at JFK, out of BOS: no one city fits, so the country.
      flight('e1', 'LHR', 'JFK', '2025-12-01T10:00', '2025-12-01T13:00'),
      flight('e2', 'BOS', 'LHR', '2025-12-08T19:00', '2025-12-09T07:00'),
    ];
    const moved = state(period('us', DALLAS, null, '2024-12-31'), period('uk', LON, '2025-01-01', null));
    const places = buildTripGroups(rows, homeLookup(moved)).flatMap(t => t.groups.flatMap(g => g.entries.flatMap(e => (e.kind === 'stay' ? [e.stay.place] : []))));
    expect(places).toEqual(['Los Angeles', 'London', 'Dallas-Fort Worth', 'Manchester, Greater Manchester', 'the US']);
  });

  it('stats count from the home you had then', () => {
    const lookup = homeLookup(moved)!;
    const recap = travelRecap(history, { current: { city: 'London', departures: 6 }, at: lookup });
    expect(recap.homeCity).toEqual({ city: 'London', departures: 6 });
    // Helsinki landings before the move are home, after it a destination.
    const auto = travelRecap(history);
    expect(auto.homeCity?.city).toBe('Helsinki');
    expect(recap.topDestination?.city).not.toBe('London');
  });
});

describe('a destination page (services/destination)', () => {
  const trips = buildTripGroups(history, homeLookup(moved));
  const PAR = { city: 'Paris', country: 'FR' };

  it('collects every trip to a city, newest first, with totals', () => {
    const paris = destinationOf(trips, PAR);
    expect(paris.trips).toHaveLength(2);
    expect(paris.trips[0]!.start.iso > paris.trips[1]!.start.iso).toBe(true);
    expect(paris.totals.trips).toBe(2);
    expect(paris.totals.flights).toBe(4);
    expect(paris.totals.days).toBeGreaterThan(0);
    expect(paris.totals.first).toBe(paris.trips[1]!.start.iso);
    expect(paris.moves).toEqual([]);
  });

  it('a home city has the move into it and the trips from it', () => {
    const london = destinationOf(trips, LON);
    expect(london.moves.map(g => g.title)).toEqual(['Moved to London']);
    expect(london.trips).toEqual([]);
    expect(london.from.map(g => g.title)).toEqual(['Paris', 'Frankfurt am Main', 'Helsinki', 'Madrid']);
  });

  it('a former home shows the visit back and the trips it started', () => {
    const helsinki = destinationOf(trips, HEL);
    expect(helsinki.trips.map(g => g.title)).toEqual(['Helsinki']);
    expect(helsinki.from.length).toBeGreaterThan(0);
    expect(destinationOf(trips, TYO).totals.trips).toBe(1);
  });
});
