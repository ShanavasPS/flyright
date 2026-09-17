import type { JourneyRow } from './journeys';
import {
  aircraftMaker,
  aircraftRanks,
  airlineRanks,
  aroundEarth,
  destinationDetail,
  flagEmoji,
  formatMinutes,
  placeGroups,
  makerRanks,
  rankFlights,
} from './travel-recap';

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
    ticketedDeparture: null,
    ticketedArrival: null,
    ticketPriceAmount: null,
    ticketPriceCurrency: null,
    notes: null,
    notesUpdatedAt: null,
    rating: null,
    bookingReference: null,
    seat: null,
    passCode: null,
    passFormat: null,
    passCapturedAt: null,
    ...overrides,
  } as JourneyRow;
}

describe('aroundEarth', () => {
  it('counts laps and the way to the next one', () => {
    const half = aroundEarth(20_037.5);
    expect(half.laps).toBeCloseTo(0.5, 2);
    expect(half.progress).toBeCloseTo(0.5, 2);
    expect(half.next).toBe(1);
    const some = aroundEarth(52_000);
    expect(some.laps).toBeCloseTo(1.3, 1);
    expect(some.next).toBe(2);
    expect(some.progress).toBeCloseTo(0.3, 1);
  });
});

describe('flagEmoji', () => {
  it.each([
    ['FI', '🇫🇮'],
    ['gb', '🇬🇧'],
    ['', ''],
    ['XKX', ''],
  ])('%s → %s', (code, flag) => {
    expect(flagEmoji(code)).toBe(flag);
  });
});

describe('formatMinutes', () => {
  it.each([
    [45, '45m'],
    [60, '1h'],
    [685, '11h 25m'],
  ])('%d → %s', (minutes, label) => {
    expect(formatMinutes(minutes)).toBe(label);
  });
});

describe('rankFlights', () => {
  const short = row({ id: 'short', distanceKm: 400, scheduledDeparture: '2026-07-03T08:00:00Z', scheduledArrival: '2026-07-03T09:06:00Z', toCode: 'ARN', toCountry: 'SE' });
  const long = row({ id: 'long', distanceKm: 8782, scheduledDeparture: '2026-09-16T12:00:00', scheduledArrival: '2026-09-16T23:00:00', toCode: 'POS', toCountry: 'TT' });
  // The noon placeholder pair: no usable duration.
  const untimed = row({ id: 'untimed', distanceKm: 2000, scheduledDeparture: '2026-01-01T12:00:00', scheduledArrival: '2026-01-01T12:00:00', toCode: 'MAD', toCountry: 'ES' });

  it('orders by distance, duration and date', () => {
    expect(rankFlights([short, untimed, long], 'distance').map((r) => r.id)).toEqual(['long', 'untimed', 'short']);
    expect(rankFlights([short, untimed, long], 'newest').map((r) => r.id)).toEqual(['long', 'short', 'untimed']);
    // Untimed rows go last however far they flew.
    expect(rankFlights([untimed, short, long], 'duration').map((r) => r.id)).toEqual(['long', 'short', 'untimed']);
  });
});

describe('placeGroups', () => {
  const rows = [
    row({ fromCode: 'HEL', fromCountry: 'FI', toCode: 'LHR', toCountry: 'GB', scheduledArrival: '2026-02-02T10:00:00Z' }),
    row({ fromCode: 'HEL', fromCountry: 'FI', toCode: 'LGW', toCountry: 'GB', scheduledArrival: '2026-05-02T10:00:00Z' }),
    row({ fromCode: 'LHR', fromCountry: 'GB', toCode: 'HEL', toCountry: 'FI', scheduledDeparture: '2026-05-09T07:00:00Z', scheduledArrival: '2026-05-09T10:00:00Z' }),
    row({ fromCode: 'HEL', fromCountry: 'FI', toCode: 'MAD', toCountry: 'ES', scheduledArrival: '2026-08-01T10:00:00Z' }),
  ];

  it('groups airports under their country with landings and take-offs', () => {
    const groups = placeGroups(rows);
    expect(groups.map((g) => g.country)).toEqual(['FI', 'GB', 'ES']);
    const gb = groups[1];
    expect(gb.name).toBe('United Kingdom');
    expect(gb.flag).toBe('🇬🇧');
    expect(gb.landings).toBe(2);
    expect(gb.takeoffs).toBe(1);
    expect(gb.cities).toEqual(['London']);
    expect(gb.airports.map((a) => a.iata)).toEqual(['LHR', 'LGW']);
    expect(groups[0].takeoffs).toBe(3);
  });

  it('sorts by name and by latest visit', () => {
    expect(placeGroups(rows, 'name').map((g) => g.name)).toEqual(['Finland', 'Spain', 'United Kingdom']);
    expect(placeGroups(rows, 'latest').map((g) => g.country)).toEqual(['FI', 'ES', 'GB']);
  });
});

describe('airlineRanks', () => {
  const rows = [
    row({ carrier: 'Finnair', number: 'AY1331', distanceKm: 1830, rating: 4 }),
    row({ carrier: 'Finnair', number: 'AY954', distanceKm: 2950, rating: 5 }),
    row({ carrier: 'Emirates', number: 'EK238', distanceKm: 2800, rating: 5, scheduledDeparture: '2026-09-01T08:00:00Z' }),
    row({ carrier: 'Flight', number: '', distanceKm: 8782 }),
  ];

  it('ranks by flights, distance and rating, skipping the placeholder carrier', () => {
    const byFlights = airlineRanks(rows);
    expect(byFlights.map((a) => a.carrier)).toEqual(['Finnair', 'Emirates']);
    expect(byFlights[0]).toMatchObject({ flights: 2, km: 4780, rating: 4.5, rated: 2, number: 'AY1331' });
    expect(airlineRanks(rows, 'distance')[0].carrier).toBe('Finnair');
    expect(airlineRanks(rows, 'rating')[0].carrier).toBe('Emirates');
  });
});

describe('destinationDetail', () => {
  it('names the country and the codes landed at in a city', () => {
    const rows = [
      row({ toCode: 'LHR', toCountry: 'GB' }),
      row({ toCode: 'LGW', toCountry: 'GB' }),
      row({ toCode: 'LHR', toCountry: 'GB' }),
      row({ toCode: 'MAD', toCountry: 'ES' }),
    ];
    expect(destinationDetail(rows, 'London')).toEqual({ city: 'London', country: 'GB', codes: ['LHR', 'LGW'], landings: 3 });
    expect(destinationDetail(rows, 'Paris')).toBeNull();
  });
});

describe('aircraft', () => {
  it.each([
    ['Airbus A350-900', 'Airbus'],
    ['Boeing 787-9 Dreamliner', 'Boeing'],
    ['Embraer 190', 'Embraer'],
    ['ATR 72-600', 'ATR'],
    ['De Havilland Canada DHC-8-400', 'De Havilland'],
  ])('%s is made by %s', (model, maker) => {
    expect(aircraftMaker(model)).toBe(maker);
  });

  it('ranks types with their airframes, and makers across them', () => {
    const rows = [
      row({ aircraftModel: 'Airbus A350-900', aircraftReg: 'OH-LWA', distanceKm: 6600 }),
      row({ aircraftModel: 'Airbus A350-900', aircraftReg: 'OH-LWB', distanceKm: 6600 }),
      row({ aircraftModel: 'Airbus A320', aircraftReg: 'OH-LXA', distanceKm: 1500 }),
      row({ aircraftModel: 'Boeing 737-800', aircraftReg: null, distanceKm: 2000 }),
      row({ aircraftModel: null }),
    ] as JourneyRow[];
    const types = aircraftRanks(rows);
    // Ties on flights break on distance: the 737 flew further than the A320.
    expect(types.map((t) => t.model)).toEqual(['Airbus A350-900', 'Boeing 737-800', 'Airbus A320']);
    expect(types[0]).toMatchObject({ maker: 'Airbus', flights: 2, km: 13200, airframes: 2 });
    expect(aircraftRanks(rows, 'distance')[0].model).toBe('Airbus A350-900');
    expect(makerRanks(types)).toEqual([
      { maker: 'Airbus', flights: 3, km: 14700, models: 2 },
      { maker: 'Boeing', flights: 1, km: 2000, models: 1 },
    ]);
  });
});
