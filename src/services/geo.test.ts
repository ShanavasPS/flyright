import { getAirport } from '@/services/airports';
import {
  WORLD,
  arcCoordinates,
  arcPaths,
  buildWorldMap,
  buildWorldRoutes,
  fitViewBox,
  greatCircle,
  haversineKm,
  project,
} from '@/services/geo';
import type { JourneyRow } from '@/services/journeys';

const NOW = new Date('2026-08-31T12:00:00Z');

function row(overrides: Partial<JourneyRow>): JourneyRow {
  return {
    id: 'j1',
    userId: null,
    mode: 'flight',
    carrier: 'Emirates',
    carrierCountry: 'AE',
    number: 'EK215',
    fromCode: 'DXB',
    fromCountry: 'AE',
    toCode: 'LAX',
    toCountry: 'US',
    distanceKm: 13400,
    scheduledDeparture: '2026-08-01T08:45:00Z',
    scheduledArrival: '2026-08-01T13:30:00Z',
    ticketPriceAmount: null,
    ticketPriceCurrency: null,
    source: 'lookup',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '',
    deletedAt: null,
    syncedAt: null,
    ...overrides,
  };
}

// Coordinates from assets/data/airports.json.
const HEL = [60.3184, 24.9633] as const;
const FRA = [50.0267, 8.5584] as const;
const TLL = [59.4132, 24.8326] as const;
const JFK = [40.6394, -73.7793] as const;
const LHR = [51.4707, -0.4599] as const;

describe('haversineKm', () => {
  it('matches the known HEL→FRA distance', () => {
    // The dev-mock leg in flight-status+api.ts uses 1531 km for the same
    // route; great-circle from airport coordinates lands within ~1%.
    expect(haversineKm(...HEL, ...FRA)).toBe(1539);
  });

  it('handles short hops', () => {
    expect(haversineKm(...HEL, ...TLL)).toBe(101);
  });

  it('handles long haul across the meridian', () => {
    expect(haversineKm(...LHR, ...JFK)).toBe(5540);
  });

  it('returns 0 for identical points', () => {
    expect(haversineKm(...HEL, ...HEL)).toBe(0);
  });
});

describe('project', () => {
  it('maps the corners of the crop onto the viewBox', () => {
    expect(project(WORLD.latTop, -180)).toEqual({ x: 0, y: 0 });
    const bottomRight = project(WORLD.latBottom, 180);
    expect(bottomRight.x).toBeCloseTo(WORLD.width);
    expect(bottomRight.y).toBeCloseTo(WORLD.height);
  });

  it('clamps polar latitudes into the crop', () => {
    expect(project(89, 0).y).toBe(0);
  });
});

describe('greatCircle', () => {
  it('keeps both endpoints and bows toward the pole', () => {
    const dxb = getAirport('DXB')!;
    const lax = getAirport('LAX')!;
    const points = greatCircle(dxb.lat, dxb.lon, lax.lat, lax.lon);
    expect(points[0][0]).toBeCloseTo(dxb.lat);
    expect(points[points.length - 1][1]).toBeCloseTo(lax.lon);
    // The DXB–LAX great circle flies far north of both endpoints.
    const peak = Math.max(...points.map(([lat]) => lat));
    expect(peak).toBeGreaterThan(60);
  });

  it('handles co-located endpoints without NaNs', () => {
    const points = greatCircle(10, 20, 10, 20);
    expect(points.every(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))).toBe(true);
  });
});

describe('arcCoordinates', () => {
  it('starts at the origin and ends at the destination', () => {
    const dxb = getAirport('DXB')!;
    const lax = getAirport('LAX')!;
    const [segment] = arcCoordinates(dxb, lax);
    expect(segment[0].latitude).toBeCloseTo(dxb.lat);
    expect(segment[0].longitude).toBeCloseTo(dxb.lon);
    expect(segment[segment.length - 1].latitude).toBeCloseTo(lax.lat);
    expect(segment[segment.length - 1].longitude).toBeCloseTo(lax.lon);
  });

  it('splits a transpacific route into segments ending at ±180°', () => {
    const segments = arcCoordinates(getAirport('LAX')!, getAirport('NRT')!);
    expect(segments).toHaveLength(2);
    // Westbound out of LAX: the first piece exits at -180° and the second
    // re-enters from +180°, at the same latitude.
    expect(segments[0][segments[0].length - 1].longitude).toBe(-180);
    expect(segments[1][0].longitude).toBe(180);
    expect(segments[0][segments[0].length - 1].latitude).toBeCloseTo(segments[1][0].latitude);
  });
});

describe('buildWorldRoutes', () => {
  it('keeps origin and destination airports on the route', () => {
    const { routes } = buildWorldRoutes([row({})], NOW);
    expect(routes).toHaveLength(1);
    expect(routes[0].from.iata).toBe('DXB');
    expect(routes[0].to.iata).toBe('LAX');
    const [segment] = routes[0].segments;
    expect(segment[0].latitude).toBeCloseTo(routes[0].from.lat);
    expect(segment[segment.length - 1].longitude).toBeCloseTo(routes[0].to.lon);
  });

  it('collects fit coordinates covering the arc, not just the endpoints', () => {
    const { fitCoords } = buildWorldRoutes([row({})], NOW);
    // The DXB–LAX great circle bows far north of either endpoint.
    expect(Math.max(...fitCoords.map((c) => c.latitude))).toBeGreaterThan(60);
  });
});

describe('arcPaths', () => {
  it('draws a single path for an ordinary route', () => {
    expect(arcPaths(getAirport('DXB')!, getAirport('LAX')!)).toHaveLength(1);
  });

  it('splits a transpacific route at the antimeridian', () => {
    const paths = arcPaths(getAirport('LAX')!, getAirport('NRT')!);
    expect(paths).toHaveLength(2);
    // Westbound out of LAX: the first piece exits at x=0 and the second
    // re-enters from the x=width edge.
    expect(paths[0]).toContain('L0.00 ');
    expect(paths[1]).toContain(`M${WORLD.width.toFixed(2)}`);
  });
});

describe('buildWorldMap', () => {
  it('collapses both directions of a pair into one route', () => {
    const { routes, airports } = buildWorldMap(
      [
        row({ id: 'a' }),
        row({ id: 'b', fromCode: 'LAX', fromCountry: 'US', toCode: 'DXB', toCountry: 'AE' }),
      ],
      NOW,
    );
    expect(routes).toHaveLength(1);
    expect(routes[0].key).toBe('DXB-LAX');
    expect(routes[0].count).toBe(2);
    expect(routes[0].upcomingOnly).toBe(false);
    expect(airports.map((a) => a.iata).sort()).toEqual(['DXB', 'LAX']);
    expect(airports[0].count).toBe(2);
  });

  it('marks routes with no flown leg as upcoming-only', () => {
    const { routes } = buildWorldMap(
      [row({ scheduledDeparture: '2026-12-24T08:45:00Z' })],
      NOW,
    );
    expect(routes[0].upcomingOnly).toBe(true);
  });

  it('skips rows whose codes have no coordinates', () => {
    const { routes } = buildWorldMap([row({ fromCode: 'ZZZ' })], NOW);
    expect(routes).toHaveLength(0);
  });
});

describe('fitViewBox', () => {
  it('falls back to the whole world, letterboxed to the viewport, without points', () => {
    const box = fitViewBox([], 0.5);
    expect(box.width).toBe(WORLD.width);
    expect(box.height).toBe(WORLD.width / 0.5);
    // Extra height centers the map vertically inside the viewport.
    expect(box.y).toBeCloseTo((WORLD.height - box.height) / 2);
  });

  it('contains every point, keeps the aspect, and stays inside the map', () => {
    const points = [project(60, 24), project(25, 55)]; // HEL, DXB-ish
    const aspect = 0.75;
    const box = fitViewBox(points, aspect);
    expect(box.width / box.height).toBeCloseTo(aspect);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(box.x);
      expect(p.x).toBeLessThanOrEqual(box.x + box.width);
      expect(p.y).toBeGreaterThanOrEqual(box.y);
      expect(p.y).toBeLessThanOrEqual(box.y + box.height);
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(WORLD.width);
  });

  it('never zooms tighter than minWidth for a short hop', () => {
    const points = [project(60.3, 24.9), project(59.4, 24.8)]; // HEL–TLL
    expect(fitViewBox(points, 1).width).toBeGreaterThanOrEqual(WORLD.width / 8);
  });
});
