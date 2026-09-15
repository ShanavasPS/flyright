/** The pure flight-path rules — picking the provider's flight, shaping a
 * track and a filed route, retention, the provider's windows and prices. */

import {
  callCents,
  compact,
  hasDeparted,
  hasLanded,
  historyWindow,
  isHistorical,
  lookupWindow,
  normalizeRoute,
  normalizeTrack,
  pathExpiry,
  pathProviderBills,
  pickFlight,
  resultSets,
  simplify,
  PATH_CACHE_MAX_AGE_MS,
  type AeroFlight,
} from '../../convex/flightPathShared';

const NOW = Date.parse('2026-09-15T12:00:00Z');

const flight = (overrides: Partial<AeroFlight>): AeroFlight => ({
  fa_flight_id: 'FIN1331-1757900000-airline-0001',
  ident_iata: 'AY1331',
  origin: { code_iata: 'HEL' },
  destination: { code_iata: 'LHR' },
  scheduled_out: '2026-09-14T08:00:00Z',
  actual_off: null,
  actual_on: null,
  actual_in: null,
  cancelled: false,
  ...overrides,
});

describe('pickFlight', () => {
  const journey = { from: 'HEL', to: 'LHR', departure: '2026-09-14T08:00:00Z' };

  it('picks the leg on the right airports nearest the journey departure', () => {
    const picked = pickFlight(
      [
        // The return leg the same day.
        flight({ fa_flight_id: 'back', origin: { code_iata: 'LHR' }, destination: { code_iata: 'HEL' } }),
        // Yesterday's outbound.
        flight({ fa_flight_id: 'yesterday', scheduled_out: '2026-09-13T08:00:00Z' }),
        flight({ fa_flight_id: 'ours' }),
        // Tomorrow's, a few minutes closer would still lose to the exact one.
        flight({ fa_flight_id: 'tomorrow', scheduled_out: '2026-09-15T08:00:00Z' }),
      ],
      journey,
    );
    expect(picked?.fa_flight_id).toBe('ours');
  });

  it('skips cancellations and legs further than a day and a half away', () => {
    expect(pickFlight([flight({ cancelled: true })], journey)).toBeNull();
    expect(pickFlight([flight({ scheduled_out: '2026-09-17T08:00:00Z' })], journey)).toBeNull();
  });

  it('falls back to scheduled_off when the gate time is missing', () => {
    const picked = pickFlight([flight({ scheduled_out: null, scheduled_off: '2026-09-14T08:15:00Z' })], journey);
    expect(picked).not.toBeNull();
  });
});

describe('departed / landed', () => {
  it('reads the runway times', () => {
    expect(hasDeparted(flight({}))).toBe(false);
    expect(hasDeparted(flight({ actual_off: '2026-09-14T08:10:00Z' }))).toBe(true);
    expect(hasLanded(flight({ actual_off: '2026-09-14T08:10:00Z' }))).toBe(false);
    expect(hasLanded(flight({ actual_on: '2026-09-14T10:30:00Z' }))).toBe(true);
    expect(hasLanded(flight({ progress_percent: 100 }))).toBe(true);
  });
});

describe('simplify', () => {
  it('drops points on a straight line and keeps a bend', () => {
    const points: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 3], // the bend
      [5, 3],
    ];
    expect(simplify(points, 0.01)).toEqual([
      [0, 0],
      [3, 3],
      [5, 3],
    ]);
  });

  it('keeps both endpoints of a two-point line', () => {
    expect(simplify([[0, 0], [1, 1]], 1)).toEqual([[0, 0], [1, 1]]);
  });

  it('compacts a long wobbly track to a bounded point count', () => {
    const track: [number, number][] = [];
    for (let i = 0; i < 5000; i += 1) {
      track.push([60 - i * 0.002 + Math.sin(i / 3) * 0.05, 25 - i * 0.006]);
    }
    const out = compact(track);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out[0]).toEqual(track[0]);
    expect(out[out.length - 1]).toEqual(track[track.length - 1]);
  });
});

describe('normalizeTrack', () => {
  const position = (lat: number, lon: number, t: string, update_type: string | null = 'A') => ({
    latitude: lat,
    longitude: lon,
    timestamp: t,
    update_type,
  });

  it('orders by time, drops projected and malformed positions, and simplifies', () => {
    const path = normalizeTrack(
      [
        position(51.5, -0.4, '2026-09-14T10:20:00Z'),
        position(60.3, 24.9, '2026-09-14T08:10:00Z'),
        position(58, 15, '2026-09-14T09:00:00Z'),
        position(55, 5, '2026-09-14T09:40:00Z'),
        // An estimate, not an observation.
        position(54, 3, '2026-09-14T09:50:00Z', 'P'),
        // Garbage.
        { latitude: Number.NaN, longitude: 1, timestamp: '2026-09-14T09:55:00Z', update_type: 'A' },
        { latitude: 50, longitude: 200, timestamp: '2026-09-14T09:56:00Z', update_type: 'A' },
      ],
      true,
      NOW,
    );
    expect(path).not.toBeNull();
    expect(path!.kind).toBe('track');
    expect(path!.complete).toBe(true);
    expect(path!.points[0]).toEqual([60.3, 24.9]);
    expect(path!.points[path!.points.length - 1]).toEqual([51.5, -0.4]);
    expect(path!.points.flat()).not.toContain(200);
  });

  it('is null with fewer than two usable positions', () => {
    expect(normalizeTrack([position(60, 25, '2026-09-14T08:10:00Z')], false, NOW)).toBeNull();
    expect(normalizeTrack(null, false, NOW)).toBeNull();
  });
});

describe('normalizeRoute', () => {
  it('keeps placed fixes and refuses a route with only endpoints placed', () => {
    const fixes = [
      { name: 'HEL', latitude: 60.3, longitude: 24.9, type: 'Origin Airport' },
      { name: 'ABCDE', latitude: null, longitude: null, type: 'UNKNOWN' },
      { name: 'LHR', latitude: 51.5, longitude: -0.4, type: 'Destination Airport' },
    ];
    expect(normalizeRoute(fixes, NOW)).toBeNull();
    const placed = normalizeRoute(
      [fixes[0], { name: 'KEMAX', latitude: 57, longitude: 12, type: 'Waypoint' }, fixes[2]],
      NOW,
    );
    expect(placed?.kind).toBe('planned');
    expect(placed?.points).toHaveLength(3);
    expect(placed?.complete).toBe(false);
  });
});

describe('pathExpiry', () => {
  const track = { kind: 'track' as const, points: [], complete: true, updatedAt: '' };
  it('keeps a finished track for the licence maximum and a live one for minutes', () => {
    expect(pathExpiry(track, null, NOW)).toBe(NOW + PATH_CACHE_MAX_AGE_MS);
    expect(pathExpiry({ ...track, complete: false }, null, NOW)).toBe(NOW + 2 * 60_000);
  });
  it('re-asks about nothing sooner before and during the flight than after', () => {
    const before = pathExpiry(null, flight({}), NOW) - NOW;
    const airborne = pathExpiry(null, flight({ actual_off: 'x' }), NOW) - NOW;
    const landed = pathExpiry(null, flight({ actual_off: 'x', actual_on: 'y' }), NOW) - NOW;
    expect(airborne).toBeLessThan(before);
    expect(before).toBeLessThan(landed);
    expect(landed).toBeLessThanOrEqual(PATH_CACHE_MAX_AGE_MS);
  });
});

describe('provider windows', () => {
  it('treats flights older than the live horizon as historical', () => {
    expect(isHistorical('2026-09-10T08:00:00Z', NOW)).toBe(false);
    expect(isHistorical('2026-09-01T08:00:00Z', NOW)).toBe(true);
    expect(isHistorical('garbage', NOW)).toBe(false);
  });

  it('brackets the departure by a day, clamped to what the live endpoint accepts', () => {
    expect(lookupWindow('2026-09-14T08:00:00Z', NOW)).toEqual({ start: '2026-09-13', end: '2026-09-15' });
    // Tomorrow: the end is clamped to two days out.
    expect(lookupWindow('2026-09-16T20:00:00Z', NOW)).toEqual({ start: '2026-09-15', end: '2026-09-17' });
    // A flight in five days: nothing to ask for yet.
    expect(lookupWindow('2026-09-20T08:00:00Z', NOW)).toBeNull();
    // Nine days back: the start is clamped to the horizon.
    expect(lookupWindow('2026-09-06T08:00:00Z', NOW)?.start).toBe('2026-09-06');
  });

  it('brackets a historical departure by a day', () => {
    expect(historyWindow('2026-03-02T23:30:00Z')).toEqual({ start: '2026-03-01', end: '2026-03-03' });
  });
});

describe('prices', () => {
  it('bills per result set of fifteen, one at least', () => {
    expect(resultSets(0)).toBe(1);
    expect(resultSets(15)).toBe(1);
    expect(resultSets(16)).toBe(2);
    expect(callCents('track', 600)).toBeCloseTo(48);
    expect(callCents('historyTrack', 600)).toBeCloseTo(240);
    expect(callCents('flight', 3)).toBeCloseTo(0.5);
  });

  it('charges processed answers and not refusals or outages', () => {
    expect(pathProviderBills(200, true)).toBe(true);
    expect(pathProviderBills(404, false)).toBe(true);
    expect(pathProviderBills(429, false)).toBe(false);
    expect(pathProviderBills(503, false)).toBe(false);
  });
});
