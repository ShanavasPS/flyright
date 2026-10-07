import {
  DEG,
  MAX_SCALE,
  SUN_FOCAL,
  cometAlpha,
  cometRange,
  faceSun,
  fitCamera,
  placeLabels,
  mergeSegments,
  nearestLambda,
  offsetAlong,
  fitRadius,
  nearestProjected,
  packVectors,
  projectPoint,
  projectPolyline,
  rotation,
  sunPlacement,
  toVector,
  toView,
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

describe('fitCamera', () => {
  const fitR = 180;
  it('faces the centroid and zooms in on a tight cluster', () => {
    const cluster = packVectors([
      { latitude: 60.3, longitude: 24.9 },
      { latitude: 59.6, longitude: 17.9 },
      { latitude: 55.6, longitude: 12.6 },
    ]);
    const cam = fitCamera([cluster], 400, 500, fitR, MAX_SCALE);
    expect(cam.phi * DEG).toBeGreaterThan(55);
    expect(cam.phi * DEG).toBeLessThan(61);
    expect(cam.lambda * DEG).toBeGreaterThan(12);
    expect(cam.lambda * DEG).toBeLessThan(25);
    expect(cam.scale).toBeGreaterThan(3);
    expect(cam.scale).toBeLessThanOrEqual(MAX_SCALE);
  });
  it('shows the whole globe for a far-flung set', () => {
    const wide = packVectors([
      { latitude: 34, longitude: -118 },
      { latitude: 35.7, longitude: 139.7 },
      { latitude: -33.9, longitude: 151.2 },
      { latitude: 51.5, longitude: -0.1 },
    ]);
    expect(fitCamera([wide], 400, 500, fitR, MAX_SCALE).scale).toBe(1);
  });
  it('caps the zoom for a single point', () => {
    const one = packVectors([{ latitude: 25.25, longitude: 55.36 }]);
    const cam = fitCamera([one], 400, 500, fitR, MAX_SCALE);
    expect(cam.scale).toBeLessThanOrEqual(MAX_SCALE);
    expect(cam.scale).toBeGreaterThan(1);
  });
  it('faces a focus instead of the centroid, and fits the set around it', () => {
    const europe = packVectors([
      { latitude: 60.3, longitude: 24.9 },
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 41.3, longitude: 2.1 },
    ]);
    const helsinki = toVector(60.3, 24.9);
    const cam = fitCamera([europe], 400, 500, fitR, MAX_SCALE, 0.82, helsinki);
    expect(cam.phi * DEG).toBeCloseTo(60.3, 0);
    expect(cam.lambda * DEG).toBeCloseTo(24.9, 0);
    // Barcelona is farther from Helsinki than from the centroid, so the
    // framing is a little wider than the plain fit.
    const plain = fitCamera([europe], 400, 500, fitR, MAX_SCALE);
    expect(cam.scale).toBeLessThan(plain.scale);
    expect(cam.scale).toBeGreaterThan(1);
  });
  it('falls back to a default view with nothing to frame', () => {
    expect(fitCamera([], 400, 500, fitR, MAX_SCALE)).toEqual({ lambda: -20 * RAD, phi: 25 * RAD, scale: 1 });
  });
});

describe('helpers', () => {
  it('merges antimeridian-split segments back into one line', () => {
    const merged = mergeSegments([
      [
        { latitude: 34, longitude: -118 },
        { latitude: 45, longitude: -180 },
      ],
      [
        { latitude: 45, longitude: 180 },
        { latitude: 35.7, longitude: 139.7 },
      ],
    ]);
    expect(merged).toHaveLength(3);
  });
  it('turns the short way round', () => {
    expect(nearestLambda(170 * RAD, -170 * RAD) * DEG).toBeCloseTo(190, 6);
    expect(nearestLambda(-170 * RAD, 170 * RAD) * DEG).toBeCloseTo(-190, 6);
  });
  it('offsets along a bearing', () => {
    const p = offsetAlong(0, 0, 90, 111.19);
    expect(p.latitude).toBeCloseTo(0, 3);
    expect(p.longitude).toBeCloseTo(1, 2);
  });
  it('lights a comet window with a ramp', () => {
    const range = cometRange(101, 0.5, 0.28)!;
    expect(range.from).toBe(22);
    expect(range.to).toBe(50);
    expect(cometAlpha(range, 50, 0.28)).toBeCloseTo(1, 6);
    expect(cometAlpha(range, 22, 0.28)).toBeLessThan(0.05);
    expect(cometRange(101, 0.001, 0.28)).toBeNull();
  });
});

describe('sunPlacement', () => {
  const sky = { left: 0, top: 0, right: 400, bottom: 600 };

  it('is out of frame while the sun is on the camera’s side of the Earth', () => {
    expect(sunPlacement([1, 0, 0.3], frame, sky).opacity).toBe(0);
    expect(sunPlacement([0, 0, 1], frame, sky).opacity).toBe(0);
  });

  it('sits straight behind the Earth when the sun is dead behind it', () => {
    const sun = sunPlacement([0, 0, -1], frame, sky);
    expect(sun.x).toBeCloseTo(frame.cx);
    expect(sun.y).toBeCloseTo(frame.cy);
    expect(sun.opacity).toBeCloseTo(1);
  });

  it('emerges past the limb and sweeps outward as the sun comes off that axis', () => {
    const a = sunPlacement([Math.sin(0.5), 0, -Math.cos(0.5)], frame, sky);
    const b = sunPlacement([Math.sin(0.8), 0, -Math.cos(0.8)], frame, sky);
    expect(a.x - frame.cx).toBeCloseTo(frame.r * SUN_FOCAL * Math.tan(0.5));
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.x).toBeGreaterThan(frame.cx + frame.r);
    expect(b.opacity).toBeCloseTo(1);
    // Screen y grows downward: a sun to the north is drawn above the centre.
    expect(sunPlacement([0, 0.6, -0.8], frame, sky).y).toBeLessThan(frame.cy);
  });

  it('fades out at the edge of the sky instead of popping, and is gone near the horizon', () => {
    expect(sunPlacement([0.999, 0, -0.045], frame, sky).opacity).toBe(0);
    const near = sunPlacement([Math.sin(0.9), 0, -Math.cos(0.9)], frame, sky);
    expect(near.opacity).toBeGreaterThan(0);
    expect(near.opacity).toBeLessThan(1);
  });
});

describe('faceSun', () => {
  const dz = (o: { lambda: number; phi: number }, sun: [number, number, number]) => toView(sun[0], sun[1], sun[2], rotation(o))[2];

  it('leaves a globe that already has the sun at the asked height alone', () => {
    const o = facing(0, 0);
    const sun = toVector(0, Math.acos(-0.7) * DEG);
    expect(faceSun(o, sun, -0.7)).toBe(o);
  });

  it('turns the least that brings the sun forward to the asked height', () => {
    const o = facing(0, 0);
    const sun = toVector(0, 90);
    const next = faceSun(o, sun, 0.35);
    expect(dz(next, sun)).toBeCloseTo(0.35, 5);
    expect(next.lambda * DEG).toBeCloseTo(90 - Math.acos(0.35) * DEG, 4);
    expect(next.phi).toBeCloseTo(0, 6);
  });

  it('sends a sun that is in front of the camera round behind the Earth', () => {
    const sun = toVector(0, 0);
    const next = faceSun(facing(0, 0), sun, -0.7);
    expect(dz(next, sun)).toBeCloseTo(-0.7, 5);
  });

  it('brings a sun dead behind the Earth up past the limb', () => {
    const sun = toVector(0, 180);
    const next = faceSun(facing(0, 0), sun, -0.7);
    expect(dz(next, sun)).toBeCloseTo(-0.7, 5);
  });

  it('keeps the tilt within the globe’s limits', () => {
    const next = faceSun(facing(80, 0), toVector(-80, 180), -0.7);
    expect(Math.abs(next.phi)).toBeLessThanOrEqual(85 * RAD + 1e-9);
  });
});

describe('placeLabels', () => {
  const sky = { left: 0, top: 0, right: 400, bottom: 600 };
  const dot = (x: number, y: number, priority = 1, vz = 0.9) => ({ x, y, r: 3, w: 24, vz, priority });

  it('puts a code to the right of a dot with room', () => {
    const [a] = placeLabels([dot(100, 100)], sky);
    expect(a.opacity).toBe(1);
    expect(a.x).toBe(108);
    expect(a.y).toBe(104);
  });

  it('moves a code to another side rather than over a neighbour', () => {
    const [a, b] = placeLabels([dot(100, 100, 2), dot(145, 100, 1)], sky);
    expect(a.x).toBe(108); // the busier one keeps the right-hand spot
    expect(b.opacity).toBe(1);
    expect(b.x).toBe(153); // b's left would cover a's code, so b goes right too
    // A code never sits over another airport's dot either.
    const [over] = placeLabels([dot(100, 100, 2), dot(130, 100, 1)], sky);
    expect(over.x).toBe(68);
  });

  it('drops the least busy code when a cluster has no room', () => {
    const cluster = [dot(100, 100, 5), dot(104, 103, 4), dot(97, 106, 3), dot(103, 96, 2), dot(99, 101, 1)];
    const placed = placeLabels(cluster, sky);
    expect(placed[0].opacity).toBe(1);
    expect(placed.filter((p) => p.opacity > 0).length).toBeLessThan(cluster.length);
    expect(placed[4].opacity).toBe(0);
  });

  it('labels nothing on the far side and fades near the limb', () => {
    const [far, limb] = placeLabels([dot(100, 100, 1, -0.5), dot(200, 200, 1, 0.2)], sky);
    expect(far.opacity).toBe(0);
    expect(limb.opacity).toBeGreaterThan(0);
    expect(limb.opacity).toBeLessThan(1);
  });

  it('keeps clear of a plane glyph waiting on the dot', () => {
    const [a] = placeLabels([dot(100, 100)], sky, [{ x: 104, y: 100, r: 9, vz: 0.9 }]);
    expect(a.opacity).toBe(1);
    expect(a.x).toBe(118); // out past the glyph, not under it
    // A plane elsewhere is simply kept clear of.
    const [b] = placeLabels([dot(100, 100)], sky, [{ x: 125, y: 100, r: 9, vz: 0.9 }]);
    expect(b.x).toBe(68);
  });

  it('keeps a code inside the sky', () => {
    const [edge] = placeLabels([dot(395, 300)], sky);
    expect(edge.opacity).toBe(1);
    expect(edge.x + 24).toBeLessThanOrEqual(400);
  });
});
