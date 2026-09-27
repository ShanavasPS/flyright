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
