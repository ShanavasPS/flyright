import { subsolarPoint, sunVector } from './sun';

const at = (iso: string) => Date.parse(iso);

describe('subsolarPoint', () => {
  it('puts the sun over the equator at the equinoxes', () => {
    // March equinox 2026: 14:46 UTC on the 20th. September: 00:05 UTC on the 23rd.
    expect(Math.abs(subsolarPoint(at('2026-03-20T14:46:00Z')).latitude)).toBeLessThan(0.1);
    expect(Math.abs(subsolarPoint(at('2026-09-23T00:05:00Z')).latitude)).toBeLessThan(0.1);
  });

  it('reaches the tropics at the solstices', () => {
    expect(subsolarPoint(at('2026-06-21T08:24:00Z')).latitude).toBeCloseTo(23.44, 1);
    expect(subsolarPoint(at('2026-12-21T20:50:00Z')).latitude).toBeCloseTo(-23.44, 1);
  });

  it('crosses Greenwich around noon UTC and the antimeridian at midnight', () => {
    // Off by the equation of time, which peaks at 16.4 minutes (4.1°) in
    // early November.
    for (const day of ['2026-01-01', '2026-04-15', '2026-09-18', '2026-11-03']) {
      expect(Math.abs(subsolarPoint(at(`${day}T12:00:00Z`)).longitude)).toBeLessThan(4.3);
      expect(Math.abs(subsolarPoint(at(`${day}T00:00:00Z`)).longitude)).toBeGreaterThan(175.7);
    }
  });

  it('moves west fifteen degrees an hour', () => {
    const noon = subsolarPoint(at('2026-09-18T12:00:00Z')).longitude;
    const later = subsolarPoint(at('2026-09-18T13:00:00Z')).longitude;
    expect(noon - later).toBeCloseTo(15, 1);
  });

  it('matches a published position: 2026-09-18 11:30 UTC over the Gulf of Guinea', () => {
    const point = subsolarPoint(at('2026-09-18T11:30:00Z'));
    expect(point.latitude).toBeCloseTo(1.9, 0);
    expect(point.longitude).toBeGreaterThan(4);
    expect(point.longitude).toBeLessThan(10);
  });
});

describe('sunVector', () => {
  it('is a unit vector pointing at the subsolar point', () => {
    const v = sunVector(at('2026-06-21T12:00:00Z'));
    expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 6);
    // Northern summer: the sun is north of the equator (+Y is north).
    expect(v[1]).toBeGreaterThan(0.39);
    // Noon UTC: over the prime meridian, which is +Z in the globe's frame.
    expect(v[2]).toBeGreaterThan(0.9);
  });
});
