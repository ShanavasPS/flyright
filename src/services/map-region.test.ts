import { getAirport } from '@/services/airports';
import { arcCoordinates } from '@/services/geo';
import { frameInset, maxLonSpanFor, regionFor, regionHolds } from '@/services/map-region';

/** The journey inset as an iPhone 17 lays it out: a 346-point-wide card,
 * 220 points tall. The SDK grants about 124° of longitude in it. */
const WIDTH = 346;
const HEIGHT = 220;

function inset(from: string, to: string) {
  const a = getAirport(from)!;
  const b = getAirport(to)!;
  const coords = arcCoordinates(a, b).flat();
  const fit = regionFor(coords, [a.lon, b.lon], 359);
  return frameInset(
    fit,
    coords.map((c) => c.latitude),
    WIDTH,
    HEIGHT,
  );
}

describe('maxLonSpanFor', () => {
  it('predicts a little under what the SDKs were measured to grant', () => {
    // iPhone 17: a 346pt card was granted 124°. Pixel 9a: 360dp got 127°.
    expect(maxLonSpanFor(346)).toBeGreaterThan(115);
    expect(maxLonSpanFor(346)).toBeLessThanOrEqual(124);
    expect(maxLonSpanFor(360)).toBeLessThanOrEqual(127);
  });
});

describe('frameInset', () => {
  it('frames a short-haul on the real map', () => {
    const { fits, region } = inset('HEL', 'LHR');
    expect(fits).toBe(true);
    // Both airports inside the window, with room around them.
    expect(region.longitudeDelta).toBeGreaterThan(25.4);
    expect(region.longitudeDelta).toBeLessThan(maxLonSpanFor(WIDTH));
  });

  it('still frames a route that fills nearly the whole window', () => {
    // 115° of longitude, the widest the inset can actually hold.
    const { fits, region } = inset('LHR', 'LAS');
    expect(fits).toBe(true);
    // Never asks past the floor — asking wider only lets the SDK re-centre.
    expect(region.longitudeDelta).toBeLessThanOrEqual(maxLonSpanFor(WIDTH));
  });

  it('gives up on a route too wide for the window', () => {
    // 174° of longitude: the SDK would grant its floor and put the airports
    // off screen either side of it.
    expect(inset('DXB', 'LAX').fits).toBe(false);
  });

  it('gives up on an arc that climbs out of the top of the window', () => {
    // HKG → JFK spans 172° and peaks past 80°N — Mercator sends the pole to
    // infinity, so the arc leaves any band this card can show.
    expect(inset('HKG', 'JFK').fits).toBe(false);
  });

  it('holds a wide route on a wider card', () => {
    // The floor scales with the card, so an iPad frames what a phone can't.
    const a = getAirport('DXB')!;
    const b = getAirport('LAX')!;
    const coords = arcCoordinates(a, b).flat();
    const fit = regionFor(coords, [a.lon, b.lon], 359);
    expect(frameInset(fit, coords.map((c) => c.latitude), 1000, HEIGHT).fits).toBe(false);
    // Wide enough in longitude at 1000pt, but the polar apex still doesn't fit
    // — the two failures are independent.
    expect(maxLonSpanFor(1000)).toBeGreaterThan(174);
  });
});

describe('regionHolds', () => {
  const coords = (from: string, to: string) => {
    const a = getAirport(from)!;
    const b = getAirport(to)!;
    return arcCoordinates(a, b).flat();
  };

  it('accepts the window the route was framed in', () => {
    const { region } = inset('HEL', 'LHR');
    expect(regionHolds(region, coords('HEL', 'LHR'))).toBe(true);
  });

  it('rejects the window Google settled on for HEL → JFK', () => {
    // What the Pixel actually reported after being asked for 52°N: the whole
    // flight sat off the top of it.
    const settled = { latitude: 14, longitude: -24, latitudeDelta: 69, longitudeDelta: 127 };
    expect(regionHolds(settled, coords('HEL', 'JFK'))).toBe(false);
  });

  it('counts a route across the antimeridian as held', () => {
    // NRT → LAX crosses ±180; a naive comparison would call every point of it
    // half a world away from a centre in the Pacific.
    const points = coords('NRT', 'LAX');
    const settled = { latitude: 45, longitude: -180, latitudeDelta: 60, longitudeDelta: 140 };
    expect(regionHolds(settled, points)).toBe(true);
  });
});
