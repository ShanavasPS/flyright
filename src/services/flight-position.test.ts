import { FIX_MAX_AGE_MS, planeNow } from './flight-position';
import { arcCoordinates, haversineKm } from './geo';
import { getAirport } from './airports';

const HEL = getAirport('HEL')!;
const JFK = getAirport('JFK')!;
const route = { segments: arcCoordinates(HEL, JFK) };
const NOW = Date.parse('2026-09-18T15:12:00Z');

const fix = {
  latitude: 39.33879,
  longitude: -95.84509,
  altitudeFt: 34000,
  groundSpeedKt: 460,
  trackDeg: 261,
  reportedAt: '2026-09-18T15:11Z',
};

describe('planeNow', () => {
  it('places the plane along the arc by the timetable when there is no fix', () => {
    const half = planeNow(route, true, 0.5, null, NOW);
    expect(half.source).toBe('estimated');
    // Halfway HEL→JFK is over the North Atlantic south of Greenland.
    expect(half.coordinate.latitude).toBeGreaterThan(60);
    expect(half.coordinate.longitude).toBeLessThan(-30);
    expect(half.coordinate.longitude).toBeGreaterThan(-50);
    // Westbound: heading in the western half of the compass.
    expect(half.heading).toBeGreaterThan(180);
  });

  it('flies the arc the other way for the return leg', () => {
    const early = planeNow(route, false, 0.1, null, NOW);
    // Ten percent into JFK→HEL is still near New York.
    expect(haversineKm(early.coordinate.latitude, early.coordinate.longitude, JFK.lat, JFK.lon)).toBeLessThan(900);
    expect(early.heading).toBeLessThan(180);
  });

  it('keeps the plane off both airports whatever the timetable says', () => {
    const before = planeNow(route, true, -1, null, NOW);
    const after = planeNow(route, true, 2, null, NOW);
    expect(haversineKm(before.coordinate.latitude, before.coordinate.longitude, HEL.lat, HEL.lon)).toBeGreaterThan(50);
    expect(haversineKm(after.coordinate.latitude, after.coordinate.longitude, JFK.lat, JFK.lon)).toBeGreaterThan(50);
  });

  it('carries a fresh fix forward along its track at its ground speed', () => {
    const placed = planeNow(route, true, 0.5, fix, NOW);
    expect(placed.source).toBe('reported');
    expect(placed.heading).toBe(261);
    // One minute at 460 kt is about 14 km, roughly west.
    const km = haversineKm(placed.coordinate.latitude, placed.coordinate.longitude, fix.latitude, fix.longitude);
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(16);
    expect(placed.coordinate.longitude).toBeLessThan(fix.longitude);
  });

  it('holds a fix caught mid-turn instead of sliding it off the route', () => {
    // AA2274 ORF→DFW, 2026-10-10: reported heading 331° for two minutes on a
    // west-south-west flight; the real plane was back on 245° by 12:10.
    const leg = { segments: arcCoordinates(getAirport('ORF')!, getAirport('DFW')!) };
    const turning = {
      latitude: 37.50886,
      longitude: -81.99156,
      altitudeFt: 37775,
      groundSpeedKt: 449,
      trackDeg: 331,
      reportedAt: '2026-10-10T12:05Z',
    };
    const at = Date.parse('2026-10-10T12:15:00Z');
    const held = planeNow(leg, true, 0.3, turning, at);
    expect(held.source).toBe('reported');
    expect(held.coordinate).toEqual({ latitude: turning.latitude, longitude: turning.longitude });
    expect(held.heading).toBe(331);
    // The same fix on course is carried as before.
    const onCourse = planeNow(leg, true, 0.3, { ...turning, trackDeg: 258 }, at);
    expect(
      haversineKm(onCourse.coordinate.latitude, onCourse.coordinate.longitude, turning.latitude, turning.longitude),
    ).toBeGreaterThan(130);
  });

  it('carries a fix at most ten minutes, then holds it', () => {
    const later = planeNow(route, true, 0.5, fix, NOW + 25 * 60_000);
    expect(later.source).toBe('reported');
    const km = haversineKm(later.coordinate.latitude, later.coordinate.longitude, fix.latitude, fix.longitude);
    expect(km).toBeLessThan(145);
    expect(km).toBeGreaterThan(135);
  });

  it('falls back to the timetable once the fix is stale', () => {
    const stale = planeNow(route, true, 0.5, fix, NOW + FIX_MAX_AGE_MS + 1);
    expect(stale.source).toBe('estimated');
  });

  it('sits on a fix that carries no speed or track', () => {
    const still = planeNow(route, true, 0.5, { ...fix, groundSpeedKt: null, trackDeg: null }, NOW);
    expect(still.coordinate).toEqual({ latitude: fix.latitude, longitude: fix.longitude });
    // Heading comes from the arc instead.
    expect(still.heading).toBeGreaterThan(180);
  });
});
