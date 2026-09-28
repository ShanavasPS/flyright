import { tripHome } from '../../convex/homeBaseShared';
import { getAirport } from './airports';
import { autoHome, groupingHome, type HomeBaseState, type HomePeriod } from './home-base';
import type { JourneyRow } from './journeys';
import { personHomeAt } from './person-home';
import { buildTripGroups } from './trip-groups';

function flight(id: string, from: string, to: string, departure: string, arrival: string): JourneyRow {
  return {
    id, mode: 'flight', fromCode: from, toCode: to,
    fromCountry: getAirport(from)?.country ?? '', toCountry: getAirport(to)?.country ?? '',
    scheduledDeparture: departure, scheduledArrival: arrival, bookingReference: null, deletedAt: null,
  } as JourneyRow;
}
const HEL = { city: 'Helsinki', country: 'FI' };
const LON = { city: 'London', country: 'GB' };
const period = (id: string, place: typeof HEL, from: string | null, until: string | null): HomePeriod => ({ id, ...place, from, until });
const state = (...periods: HomePeriod[]): HomeBaseState => ({ periods, dismissed: [], updatedAt: 1 });
const titles = (rows: JourneyRow[], homeAt?: Parameters<typeof buildTripGroups>[1]) =>
  buildTripGroups(rows, homeAt).map(t => t.groups.map(g => g.title));

/** What a follower's phone gets: each trip with the home the server attached. */
function asFollower(rows: JourneyRow[], s: HomeBaseState, auto: typeof HEL | null = null) {
  return personHomeAt(rows.map(r => ({ journeyId: r.id, fromCode: r.fromCode, scheduledDeparture: r.scheduledDeparture,
    ...tripHome({ periods: s.periods, auto }, r) })));
}

const journal = [
  flight('mad1', 'HEL', 'MAD', '2025-01-10T08:00', '2025-01-10T12:00'),
  flight('mad2', 'MAD', 'HEL', '2025-01-15T13:00', '2025-01-15T19:00'),
  flight('move', 'HEL', 'LHR', '2025-03-01T09:00', '2025-03-01T10:30'),
  flight('cdg1', 'LHR', 'CDG', '2025-04-02T08:00', '2025-04-02T10:20'),
  flight('cdg2', 'CDG', 'LHR', '2025-04-06T18:00', '2025-04-06T18:30'),
  // A trip whose flight out was never logged.
  flight('sna', 'SNA', 'DFW', '2025-11-09T06:00', '2025-11-09T11:10'),
  flight('lhr', 'DFW', 'LHR', '2025-11-14T17:20', '2025-11-15T08:30'),
];

describe("a friend's card groups trips the way the traveller's own Flights tab does", () => {
  it('with home periods, including the move between them', () => {
    const moved = state(period('a', HEL, null, '2025-02-28'), period('b', LON, '2025-03-01', null));
    const own = titles(journal, groupingHome(moved, journal));
    expect(own).toContainEqual(['Moved to London']);
    expect(own).toContainEqual(['Dallas-Fort Worth']);
    expect(titles(journal, asFollower(journal, moved))).toEqual(own);
  });

  it('with only the automatic home the traveller\'s phone saved', () => {
    const found = autoHome(journal)!;
    const saved = { city: found.city, country: found.country };
    const own = titles(journal, groupingHome(state(), journal));
    expect(titles(journal, asFollower(journal, state(), saved))).toEqual(own);
    // Periods, once set, win over the saved automatic home.
    const set = state(period('b', LON, null, null));
    expect(titles(journal, asFollower(journal, set, HEL))).toEqual(titles(journal, groupingHome(set, journal)));
  });

  it('years no period covers keep the rule without a home, for both', () => {
    const later = state(period('b', LON, '2025-03-01', null));
    expect(titles(journal, asFollower(journal, later))).toEqual(titles(journal, groupingHome(later, journal)));
    expect(tripHome({ periods: later.periods }, journal[0]!)).toEqual({});
  });

  it('sends nothing when the traveller has no home, and old payloads group as before', () => {
    expect(tripHome(null, journal[0]!)).toEqual({});
    expect(asFollower(journal, state())).toBeUndefined();
    expect(personHomeAt(journal.map(r => ({ journeyId: r.id, fromCode: r.fromCode, scheduledDeparture: r.scheduledDeparture })))).toBeUndefined();
  });

  it('marks only a move day with the home of the day before', () => {
    const moved = state(period('a', HEL, null, '2025-02-28'), period('b', LON, '2025-03-01', null));
    expect(tripHome(moved, journal[2]!)).toEqual({ home: LON, homeBefore: HEL });
    expect(tripHome(moved, journal[3]!)).toEqual({ home: LON });
    const starts = state(period('b', LON, '2025-03-01', null));
    expect(tripHome(starts, journal[2]!)).toEqual({ home: LON, homeBefore: null });
  });
});
