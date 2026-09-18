import { getAirport } from '@/services/airports';
import { buildWorldRoutes, fitViewBox, project, type ViewBox } from '@/services/geo';
import {
  HALO,
  HEAT_RAMPS,
  MAX_WEIGHT,
  PEAK_STEPS,
  SEGMENT_STRIDE,
  SINGLE_ROUTE_T,
  heatColour,
  heatGain,
  heatKernel,
  heatSegments,
} from '@/services/route-heat-field';

const row = (id: string, fromCode: string, toCode: string, when: string) => ({
  id,
  fromCode,
  toCode,
  number: 'AY1',
  carrier: 'Finnair',
  scheduledDeparture: when,
});

const now = new Date('2026-06-01T00:00:00Z');
const past = '2026-01-10T08:00:00Z';
const future = '2026-12-10T08:00:00Z';

function fit(routesData: ReturnType<typeof buildWorldRoutes>, width: number, height: number): ViewBox {
  return fitViewBox(
    routesData.fitCoords.map((c) => project(c.latitude, c.longitude)),
    width / height,
    0.22,
  );
}

describe('heatSegments', () => {
  it('packs one entry per polyline segment of every flown route, in pixel space', () => {
    const data = buildWorldRoutes([row('1', 'HEL', 'LHR', past), row('2', 'LHR', 'HEL', past)], now);
    const box = fit(data, 540, 600);
    const packed = heatSegments(data.routes, box, 540, 600);
    const expected = data.routes[0].segments.reduce((n, s) => n + s.length - 1, 0);
    expect(packed.length).toBe(expected * SEGMENT_STRIDE);
    // Endpoints sit inside the field, and the weight is the pair's count.
    for (let i = 0; i < packed.length; i += SEGMENT_STRIDE) {
      expect(packed[i]).toBeGreaterThanOrEqual(0);
      expect(packed[i]).toBeLessThanOrEqual(540);
      expect(packed[i + 1]).toBeGreaterThanOrEqual(0);
      expect(packed[i + 1]).toBeLessThanOrEqual(600);
      expect(packed[i + 4]).toBe(2);
      expect(packed[i + 5]).toBe(0);
    }
    // Consecutive segments chain: this one's b is the next one's a.
    expect(packed[2]).toBeCloseTo(packed[SEGMENT_STRIDE]);
    expect(packed[3]).toBeCloseTo(packed[SEGMENT_STRIDE + 1]);
  });

  it('leaves out pairs that are only upcoming and caps the weight', () => {
    const rows = [
      row('u', 'HEL', 'ARN', future),
      ...Array.from({ length: 9 }, (_, i) => row(`l${i}`, 'HEL', 'LHR', past)),
    ];
    const data = buildWorldRoutes(rows, now);
    const box = fit(data, 540, 600);
    const packed = heatSegments(data.routes, box, 540, 600);
    const lhr = data.routes.find((r) => r.key === 'HEL-LHR')!;
    const lhrSegments = lhr.segments.reduce((n, s) => n + s.length - 1, 0);
    expect(packed.length).toBe(lhrSegments * SEGMENT_STRIDE);
    expect(packed[4]).toBe(MAX_WEIGHT);
  });

  it('projects to the box, not the world: an airport at the box origin lands at 0,0', () => {
    const hel = getAirport('HEL')!;
    const p = project(hel.lat, hel.lon);
    const box: ViewBox = { x: p.x, y: p.y, width: 100, height: 50 };
    const data = buildWorldRoutes([row('1', 'HEL', 'LHR', past)], now);
    const packed = heatSegments(data.routes, box, 200, 100);
    expect(packed[0]).toBeCloseTo(0, 5);
    expect(packed[1]).toBeCloseTo(0, 5);
  });
});

describe('exposure and ramp', () => {
  it('kernel widths scale with the field', () => {
    const a = heatKernel(540);
    const b = heatKernel(1080);
    expect(b.k1).toBeCloseTo(a.k1 / 4);
    expect(b.k2).toBeCloseTo(a.k2 / 4);
  });

  it('gain puts a busy peak at t = 0.94 and is 0 with no peak', () => {
    const peak = 12; // a hub: well past the single-route ceiling
    const gain = heatGain(peak * PEAK_STEPS);
    expect(1 - Math.exp(-peak * gain)).toBeCloseTo(0.94);
    expect(heatGain(0)).toBe(0);
  });

  it('never exposes a journal of one-offs past cobalt', () => {
    // A lone count-1 segment's core is sqrt(1 + HALO); with only such routes
    // the peak is about that, and it must land at SINGLE_ROUTE_T, not 0.94.
    const single = Math.sqrt(1 + HALO);
    const gain = heatGain(single * PEAK_STEPS);
    expect(1 - Math.exp(-single * gain)).toBeCloseTo(SINGLE_ROUTE_T);
    expect(heatColour(HEAT_RAMPS.dark, SINGLE_ROUTE_T)[1]).toBeLessThan(0.8); // not payout green yet
  });

  it('ramps are transparent at 0, opaque at the core, and monotone in alpha', () => {
    for (const ramp of Object.values(HEAT_RAMPS)) {
      expect(heatColour(ramp, 0)[3]).toBe(0);
      expect(heatColour(ramp, 1)[3]).toBe(1);
      let last = -1;
      for (let t = 0; t <= 1; t += 0.05) {
        const a = heatColour(ramp, t)[3];
        expect(a).toBeGreaterThanOrEqual(last);
        last = a;
      }
      expect(heatColour(ramp, 1.5)).toEqual(ramp.colours[4]);
    }
  });
});
