import {
  fitRadius,
  nearestProjected,
  packVectors,
  projectPoint,
  projectPolyline,
  rotation,
  toVector,
  unprojectPoint,
  wrapLambda,
  RAD,
} from './globe';

const frame = { cx: 200, cy: 300, r: 100 };
const facing = (lat: number, lon: number) => ({ lambda: lon * RAD, phi: lat * RAD });

describe('globe projection', () => {
  it('puts the coordinate the globe faces at the centre', () => {
    const p = projectPoint(60.3, 24.9, facing(60.3, 24.9), frame);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(300, 6);
    expect(p.visible).toBe(true);
  });

  it('places east to the right and north up when facing the equator', () => {
    const east = projectPoint(0, 30, facing(0, 0), frame);
    const north = projectPoint(30, 0, facing(0, 0), frame);
    expect(east.x).toBeGreaterThan(200);
    expect(east.y).toBeCloseTo(300, 6);
    expect(north.y).toBeLessThan(300);
    expect(north.x).toBeCloseTo(200, 6);
  });

  it('hides the far side', () => {
    expect(projectPoint(0, 180, facing(0, 0), frame).visible).toBe(false);
    expect(projectPoint(-60, 0, facing(60, 0), frame).visible).toBe(false);
  });

  it('round-trips through unproject', () => {
    const orientation = facing(-33.9, 151.2);
    for (const [lat, lon] of [
      [-33.9, 151.2],
      [-37.8, 144.9],
      [1.35, 103.8],
      [-36.8, 174.8],
    ]) {
      const p = projectPoint(lat, lon, orientation, frame);
      expect(p.visible).toBe(true);
      const back = unprojectPoint(p.x, p.y, orientation, frame)!;
      expect(back.latitude).toBeCloseTo(lat, 4);
      expect(back.longitude).toBeCloseTo(lon, 4);
    }
    expect(unprojectPoint(200, 300 + 101, orientation, frame)).toBeNull();
  });

  it('keeps unit vectors unit', () => {
    const [x, y, z] = toVector(51.5, -0.1);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
  });
});

describe('projectPolyline', () => {
  const equator = packVectors(Array.from({ length: 37 }, (_, i) => ({ latitude: 0, longitude: -180 + i * 10 })));

  it('cuts a line at the limb and pins the cut to the circle', () => {
    const pieces = projectPolyline(equator, rotation(facing(0, 0)), frame);
    // Visible from −90° to 90°: one piece (the sample at exactly ±90° sits on the limb).
    expect(pieces.length).toBeGreaterThanOrEqual(1);
    const flat = pieces.flat();
    for (let i = 0; i < flat.length; i += 2) {
      const d = Math.hypot(flat[i] - frame.cx, flat[i + 1] - frame.cy);
      expect(d).toBeLessThanOrEqual(frame.r + 1e-6);
    }
    const first = pieces[0];
    expect(Math.hypot(first[0] - frame.cx, first[1] - frame.cy)).toBeCloseTo(frame.r, 5);
    expect(Math.hypot(first[first.length - 2] - frame.cx, first[first.length - 1] - frame.cy)).toBeCloseTo(frame.r, 5);
  });

  it('returns nothing for a line entirely behind the globe', () => {
    const back = packVectors([
      { latitude: 0, longitude: 170 },
      { latitude: 5, longitude: -175 },
    ]);
    expect(projectPolyline(back, rotation(facing(0, 0)), frame)).toEqual([]);
  });
});

describe('nearestProjected', () => {
  const routes = [
    { key: 'A', packed: [packVectors([{ latitude: 0, longitude: -20 }, { latitude: 0, longitude: 20 }])] },
    { key: 'B', packed: [packVectors([{ latitude: 40, longitude: -20 }, { latitude: 40, longitude: 20 }])] },
  ];
  it('picks the closest visible route within tolerance', () => {
    const o = facing(0, 0);
    expect(nearestProjected(routes, 200, 300 + 4, o, frame, 22)).toBe('A');
    const b = projectPoint(40, 0, o, frame);
    expect(nearestProjected(routes, b.x + 3, b.y, o, frame, 22)).toBe('B');
    expect(nearestProjected(routes, 200, 300 - 40, o, frame, 10)).toBeNull();
  });
  it('ignores routes on the far side', () => {
    expect(nearestProjected(routes, 200, 300, facing(0, 180), frame, 22)).toBeNull();
  });
});

describe('helpers', () => {
  it('wraps longitude', () => {
    expect(wrapLambda(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2, 9);
    expect(wrapLambda(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 9);
  });
  it('fits the shorter side', () => {
    expect(fitRadius(400, 600)).toBe(180);
  });
});
