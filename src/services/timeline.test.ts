import type { JourneyRow } from './journeys';
import { groupJourneys, travelStats } from './timeline';

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
