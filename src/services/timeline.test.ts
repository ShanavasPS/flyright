import type { JourneyRow } from './journeys';
import { cityOf, groupJourneys, travelRecap, travelStats } from './timeline';

const NOW = new Date('2026-08-17T12:00:00Z');

let seq = 0;
function row(overrides: Partial<JourneyRow>): JourneyRow {
  return {
    id: `row-${seq++}`,
    userId: null,
    mode: 'flight',
    carrier: 'Finnair',
    carrierCountry: 'FI',
    number: 'AY123',
    fromCode: 'HEL',
    fromCountry: 'FI',
    toCode: 'FRA',
    toCountry: 'DE',
    distanceKm: 1539,
    scheduledDeparture: '2026-08-20T08:00:00Z',
    scheduledArrival: '2026-08-20T10:35:00Z',
    ticketPriceAmount: null,
    ticketPriceCurrency: null,
    source: 'lookup',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    deletedAt: null,
    syncedAt: null,
    ...overrides,
  };
}

describe('groupJourneys', () => {
  it('returns no sections for an empty list', () => {
    expect(groupJourneys([], NOW)).toEqual([]);
  });

  it('puts future trips in Upcoming, soonest first', () => {
    const later = row({ scheduledDeparture: '2026-12-24T08:00:00Z' });
    const sooner = row({ scheduledDeparture: '2026-08-20T08:00:00Z' });
    const sections = groupJourneys([later, sooner], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBe('Upcoming');
    expect(sections[0]!.data.map((r) => r.id)).toEqual([sooner.id, later.id]);
  });

  it('groups past trips by year, newest first, and omits an empty Upcoming', () => {
    const lastWeek = row({ scheduledDeparture: '2026-08-10T08:00:00Z' });
    const lastYear = row({ scheduledDeparture: '2025-03-01T08:00:00Z' });
    const decadeAgo = row({ scheduledDeparture: '2016-06-15T08:00:00Z' });
    const sections = groupJourneys([decadeAgo, lastWeek, lastYear], NOW);
    expect(sections.map((s) => s.title)).toEqual(['2026', '2025', '2016']);
    expect(sections[0]!.data.map((r) => r.id)).toEqual([lastWeek.id]);
  });

  it('sorts within a past year newest first regardless of input order', () => {
    const march = row({ scheduledDeparture: '2025-03-01T08:00:00Z' });
    const june = row({ scheduledDeparture: '2025-06-01T08:00:00Z' });
    const sections = groupJourneys([march, june], NOW);
    expect(sections[0]!.data.map((r) => r.id)).toEqual([june.id, march.id]);
  });

  it('keeps a departure at the boundary in Upcoming', () => {
    const boundary = row({ scheduledDeparture: NOW.toISOString() });
    expect(groupJourneys([boundary], NOW)[0]!.title).toBe('Upcoming');
  });

  it('splits mixed lists into Upcoming plus year sections', () => {
    const future = row({ scheduledDeparture: '2026-09-01T08:00:00Z' });
    const past = row({ scheduledDeparture: '2015-01-05T08:00:00Z' });
    const sections = groupJourneys([past, future], NOW);
    expect(sections.map((s) => s.title)).toEqual(['Upcoming', '2015']);
  });
});

describe('travelStats', () => {
  it('counts trips, kilometres, and distinct countries', () => {
    const rows = [
      row({ fromCountry: 'FI', toCountry: 'DE', distanceKm: 1539 }),
      row({ fromCountry: 'DE', toCountry: 'US', distanceKm: 6200 }),
    ];
    expect(travelStats(rows)).toEqual({ trips: 2, totalKm: 7739, countries: 3 });
  });

  it('ignores empty country codes and handles no rows', () => {
    expect(travelStats([row({ fromCountry: '', toCountry: '' })]).countries).toBe(0);
    expect(travelStats([])).toEqual({ trips: 0, totalKm: 0, countries: 0 });
  });
});

describe('cityOf', () => {
  it('trims the disambiguating parenthetical and falls back to the code', () => {
    expect(cityOf('HEL')).toBe('Helsinki');
    expect(cityOf('ZZZ')).toBe('ZZZ');
  });
});

describe('travelRecap', () => {
  const trip = (from: string, to: string, overrides: Partial<JourneyRow> = {}) =>
    row({ fromCode: from, toCode: to, ...overrides });

  it('is all nulls and zeros for no rows', () => {
    expect(travelRecap([])).toMatchObject({
      trips: 0,
      airports: 0,
      airlines: 0,
      hoursAloft: 0,
      firstYear: null,
      busiestYear: null,
      longest: null,
      shortest: null,
      homeCity: null,
      topDestination: null,
      topAirline: null,
    });
  });

  it('picks longest and shortest by distance', () => {
    const short = trip('HEL', 'FRA', { distanceKm: 1539 });
    const long = trip('HEL', 'BKK', { distanceKm: 8158 });
    const recap = travelRecap([short, long]);
    expect(recap.longest?.id).toBe(long.id);
    expect(recap.shortest?.id).toBe(short.id);
  });

  it('hides shortest when it would duplicate the only record', () => {
    const only = trip('HEL', 'FRA');
    const recap = travelRecap([only]);
    expect(recap.longest?.id).toBe(only.id);
    expect(recap.shortest).toBeNull();
    expect(travelRecap([trip('HEL', 'FRA'), trip('FRA', 'HEL')]).shortest).toBeNull();
  });

  it('crowns the top destination excluding the home city', () => {
    const recap = travelRecap([
      trip('HEL', 'BKK'),
      trip('BKK', 'HEL'),
      trip('HEL', 'BKK'),
      trip('BKK', 'HEL'),
      trip('HEL', 'FRA'),
    ]);
    expect(recap.homeCity).toEqual({ city: 'Helsinki', departures: 3 });
    // Helsinki has the most landings (2) but is home; Bangkok wins.
    expect(recap.topDestination).toEqual({ city: 'Bangkok', landings: 2 });
  });

  it('falls back to home when every landing is the home city', () => {
    const recap = travelRecap([trip('FRA', 'HEL'), trip('HEL', 'HEL'), trip('BKK', 'HEL')]);
    expect(recap.topDestination).toEqual({ city: 'Helsinki', landings: 3 });
  });

  it('counts airports, airlines, and the most flown airline', () => {
    const recap = travelRecap([
      trip('HEL', 'FRA', { carrier: 'Finnair' }),
      trip('FRA', 'HEL', { carrier: 'Lufthansa' }),
      trip('HEL', 'BKK', { carrier: 'Finnair' }),
    ]);
    expect(recap.airports).toBe(3);
    expect(recap.airlines).toBe(2);
    expect(recap.topAirline).toEqual({ carrier: 'Finnair', flights: 2, number: 'AY123' });
  });

  it("ignores the manual-entry 'Flight' placeholder when ranking airlines", () => {
    const rows = [
      trip('HEL', 'FRA', { carrier: 'Flight' }),
      trip('HEL', 'BKK', { carrier: 'Flight' }),
      trip('FRA', 'HEL', { carrier: 'Finnair' }),
    ];
    const recap = travelRecap(rows);
    expect(recap.airlines).toBe(1);
    expect(recap.topAirline).toEqual({ carrier: 'Finnair', flights: 1, number: 'AY123' });
    expect(travelRecap([trip('HEL', 'FRA', { carrier: 'Flight' })]).topAirline).toBeNull();
  });

  it('tracks first and busiest year, hiding busiest for a single year', () => {
    const y = (year: number) => trip('HEL', 'FRA', { scheduledDeparture: `${year}-05-01T08:00:00` });
    const recap = travelRecap([y(2015), y(2024), y(2024), y(2026)]);
    expect(recap.firstYear).toBe('2015');
    expect(recap.busiestYear).toEqual({ year: '2024', trips: 2 });
    expect(travelRecap([y(2024), y(2024)]).busiestYear).toBeNull();
  });

  it('estimates hours aloft from distance', () => {
    expect(travelRecap([trip('HEL', 'BKK', { distanceKm: 7500 })]).hoursAloft).toBe(10);
  });
});
