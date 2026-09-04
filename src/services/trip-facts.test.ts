import type { JourneyRow } from './journeys';
import { ordinal, tripFacts } from './trip-facts';

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
    source: 'manual',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    deletedAt: null,
    syncedAt: null,
    ...overrides,
  };
}

describe('ordinal', () => {
  it('handles the English suffix rules', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]);
  });
});

describe('tripFacts', () => {
  it('reads a first international trip as a first visit', () => {
    const trip = row({ toCode: 'NRT', toCountry: 'JP', distanceKm: 7800 });
    expect(tripFacts(trip, [trip])).toEqual(['First time in Japan']);
  });

  it('counts earlier visits to the destination country in departure order', () => {
    const first = row({ toCode: 'NRT', toCountry: 'JP', scheduledDeparture: '2024-01-01T00:00:00Z' });
    const second = row({ toCode: 'KIX', toCountry: 'JP', scheduledDeparture: '2025-01-01T00:00:00Z' });
    const later = row({ toCode: 'HND', toCountry: 'JP', scheduledDeparture: '2027-01-01T00:00:00Z' });
    expect(tripFacts(second, [first, second, later])).toContain('2nd time in Japan');
    expect(tripFacts(first, [first, second, later])).toContain('First time in Japan');
  });

  it('ranks the distance record only against a real journal', () => {
    const short = row({ distanceKm: 400, toCode: 'ARN', toCountry: 'SE' });
    const mid = row({ distanceKm: 1539 });
    const long = row({ distanceKm: 9000, toCode: 'SIN', toCountry: 'SG' });
    expect(tripFacts(long, [short, mid, long])[0]).toBe('Your longest flight');
    expect(tripFacts(short, [short, mid, long])[0]).toBe('Your shortest flight');
    expect(tripFacts(mid, [short, mid, long])).not.toContain('Your longest flight');
    // Two trips: nothing to rank inside yet.
    expect(tripFacts(long, [short, long])).not.toContain('Your longest flight');
  });

  it('tallies flights with the same airline and skips placeholder carriers', () => {
    const a = row({ scheduledDeparture: '2024-01-01T00:00:00Z' });
    const b = row({ scheduledDeparture: '2025-01-01T00:00:00Z' });
    const c = row({ scheduledDeparture: '2026-01-01T00:00:00Z' });
    expect(tripFacts(c, [a, b, c])).toContain('3rd flight with Finnair');
    expect(tripFacts(a, [a, b, c])).not.toEqual(expect.arrayContaining([expect.stringMatching(/flight with/)]));

    const placeholder = row({ carrier: 'Flight', number: '' });
    expect(tripFacts(placeholder, [placeholder, a])).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/flight with/)]),
    );
  });

  it('says nothing about a domestic leg’s country and ignores tombstones', () => {
    const domestic = row({ toCode: 'OUL', toCountry: 'FI' });
    const deleted = row({ toCode: 'OUL', toCountry: 'FI', deletedAt: '2026-01-01T00:00:00Z' });
    expect(tripFacts(domestic, [domestic, deleted])).toEqual([]);
  });

  it('adds the ticket price last and caps at three facts', () => {
    const trip = row({
      toCode: 'NRT',
      toCountry: 'JP',
      distanceKm: 7800,
      ticketPriceAmount: 245,
      ticketPriceCurrency: 'EUR',
      scheduledDeparture: '2026-01-01T00:00:00Z',
    });
    const a = row({ distanceKm: 100, scheduledDeparture: '2024-01-01T00:00:00Z' });
    const b = row({ distanceKm: 200, scheduledDeparture: '2025-01-01T00:00:00Z' });
    const facts = tripFacts(trip, [a, b, trip]);
    expect(facts).toHaveLength(3);
    expect(facts).toEqual(['Your longest flight', 'First time in Japan', '3rd flight with Finnair']);
    expect(tripFacts(trip, [trip])).toEqual(['First time in Japan', expect.stringMatching(/^Ticket /)]);
  });
});
