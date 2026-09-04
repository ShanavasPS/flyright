import type { JourneyRow } from './journeys';
import {
  blockMinutes,
  cityOf,
  formatKm,
  groupJourneys,
  timeAloftComparison,
  travelRecap,
  travelStats,
} from './timeline';

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
    notes: null,
    notesUpdatedAt: null,
    rating: null,
    bookingReference: null,
    seat: null,
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
    expect(travelStats(rows)).toMatchObject({ trips: 2, totalKm: 7739, countries: 3 });
  });

  it('ignores empty country codes and handles no rows', () => {
    expect(travelStats([row({ fromCountry: '', toCountry: '' })]).countries).toBe(0);
    expect(travelStats([])).toEqual({
      trips: 0,
      totalKm: 0,
      countries: 0,
      hoursAloft: 0,
      hoursEstimated: false,
    });
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
      favouriteAirline: null,
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

  it('crowns the highest-rated airline, ties going to the one rated more often', () => {
    const rows = [
      trip('HEL', 'FRA', { carrier: 'Finnair', number: 'AY123', rating: 4 }),
      trip('HEL', 'LHR', { carrier: 'Finnair', number: 'AY1331', rating: 5 }),
      trip('HEL', 'ARN', { carrier: 'SAS', number: 'SK701', rating: 5 }),
      trip('HEL', 'CPH', { carrier: 'Norwegian', number: 'DY1234' }),
    ];
    expect(travelRecap(rows).favouriteAirline).toEqual({
      carrier: 'SAS',
      rating: 5,
      rated: 1,
      number: 'SK701',
    });
    rows.push(trip('HEL', 'ARN', { carrier: 'Finnair', number: 'AY801', rating: 5 }));
    // Finnair now averages 4.67 vs SAS 5 — SAS still wins on the mean.
    expect(travelRecap(rows).favouriteAirline?.carrier).toBe('SAS');
    rows.push(trip('HEL', 'OSL', { carrier: 'SAS', number: 'SK702', rating: 3 }));
    // SAS drops to 4; Finnair's 4.67 takes it.
    expect(travelRecap(rows).favouriteAirline?.carrier).toBe('Finnair');
    expect(travelRecap([trip('HEL', 'FRA', {})]).favouriteAirline).toBeNull();
  });

  it('tracks first and busiest year, hiding busiest for a single year', () => {
    const y = (year: number) => trip('HEL', 'FRA', { scheduledDeparture: `${year}-05-01T08:00:00` });
    const recap = travelRecap([y(2015), y(2024), y(2024), y(2026)]);
    expect(recap.firstYear).toBe('2015');
    expect(recap.busiestYear).toEqual({ year: '2024', trips: 2 });
    expect(travelRecap([y(2024), y(2024)]).busiestYear).toBeNull();
  });

  it('sums real block time and estimates only trips with bare wall-clock times', () => {
    // HEL→FRA 08:00Z→10:35Z = 2h35 exactly, no estimate involved.
    const real = travelRecap([trip('HEL', 'FRA')]);
    expect(real.hoursAloft).toBeCloseTo(2.6, 1);
    expect(real.hoursEstimated).toBe(false);
    // A manual row with zone-less times falls back to ~750 km/h.
    const manual = trip('HEL', 'BKK', {
      source: 'manual',
      distanceKm: 7500,
      scheduledDeparture: '2026-08-20T12:00:00',
      scheduledArrival: '2026-08-20T12:00:00',
    });
    const mixed = travelRecap([trip('HEL', 'FRA'), manual]);
    expect(mixed.hoursAloft).toBeCloseTo(2.58 + 10, 0);
    expect(mixed.hoursEstimated).toBe(true);
  });
});

describe('blockMinutes', () => {
  it('differences zoned timestamps and rejects bare or implausible ones', () => {
    expect(blockMinutes('2026-08-20T08:00:00Z', '2026-08-20T10:35:00Z')).toBe(155);
    expect(blockMinutes('2026-08-20T08:00:00+03:00', '2026-08-20T10:35:00+01:00')).toBe(275);
    expect(blockMinutes('2026-08-20T08:00:00', '2026-08-20T10:35:00')).toBeNull();
    expect(blockMinutes('2026-08-20T10:35:00Z', '2026-08-20T08:00:00Z')).toBeNull();
    expect(blockMinutes('2026-08-20T08:00:00Z', '2026-08-22T08:00:00Z')).toBeNull();
  });
});

describe('formatKm', () => {
  it('groups digits below a million and goes compact from there', () => {
    expect(formatKm(17467)).toBe('17,467');
    expect(formatKm(999_999)).toBe('999,999');
    expect(formatKm(1_000_000)).toBe('1M');
    expect(formatKm(1_250_000)).toBe('1.3M');
    expect(formatKm(12_600_000)).toBe('13M');
  });
});

describe('timeAloftComparison', () => {
  it('picks the unit that keeps the number small', () => {
    expect(timeAloftComparison(0.5)).toBeNull();
    expect(timeAloftComparison(1)).toBe('1 hour in the air');
    expect(timeAloftComparison(14.4)).toBe('14 hours in the air');
    expect(timeAloftComparison(47)).toBe('47 hours in the air');
    expect(timeAloftComparison(48)).toBe('2 days in the air');
    expect(timeAloftComparison(60)).toBe('2.5 days in the air');
    expect(timeAloftComparison(13 * 24)).toBe('13 days in the air');
    expect(timeAloftComparison(14 * 24)).toBe('2 weeks in the air');
    expect(timeAloftComparison(24 * 7 * 3.5)).toBe('3.5 weeks in the air');
    expect(timeAloftComparison(24 * 30.44 * 2)).toBe('2 months in the air');
    expect(timeAloftComparison(24 * 30.44 * 14.2)).toBe('14 months in the air');
  });
});
