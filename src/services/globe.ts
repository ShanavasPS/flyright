/**
 * Orthographic globe math shared by the World tab's Skia globe: the shader
 * inverts it per pixel to look up land, and the worklets that draw routes
 * and hit-test taps run it forward per sample.
 *
 * Frames. A point on the earth is a unit vector in the globe frame — X out
 * of the equator at 90°E, Y through the north pole, Z out of the equator at
 * 0° — so (lat, lon) is (cos lat · sin lon, sin lat, cos lat · cos lon). The
 * view frame puts the screen centre on +Z (toward the viewer), +X right and
 * +Y up. Orientation is the centre's longitude `lambda` and latitude `phi`
 * in radians: rotate the globe by −lambda about Y so that meridian faces the
 * viewer, then tilt by phi about X so that parallel lands on the centre.
 * Everything in here is a plain function marked as a worklet so the same
 * code runs on the UI thread for gestures and on JS for taps.
 */

export interface GlobeOrientation {
  /** Longitude at the screen centre, radians. */
  lambda: number;
  /** Latitude at the screen centre, radians. */
  phi: number;
}

/** Where the globe sits on the canvas. */
export interface GlobeFrame {
  cx: number;
  cy: number;
  /** Radius in canvas points. */
  r: number;
}

export const RAD = Math.PI / 180;
export const DEG = 180 / Math.PI;

/** Latitude tilt is capped short of the poles: past them the globe would
 * flip upside down and drag directions invert. */
export const MAX_TILT = 85 * RAD;

/** The unit vector for a coordinate, in the globe frame, packed as three
 * floats. Route samples are converted once and kept, so each frame only
 * rotates. */
export function toVector(lat: number, lon: number): [number, number, number] {
  'worklet';
  const la = lat * RAD;
  const lo = lon * RAD;
  const c = Math.cos(la);
  return [c * Math.sin(lo), Math.sin(la), c * Math.cos(lo)];
}

/** Pack a polyline of coordinates as a flat xyz array. */
export function packVectors(points: { latitude: number; longitude: number }[]): Float32Array {
  const out = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    const [x, y, z] = toVector(points[i].latitude, points[i].longitude);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

/** Precomputed sines and cosines of an orientation, for tight loops. */
export interface Rotation {
  cl: number;
  sl: number;
  cp: number;
  sp: number;
}

export function rotation(orientation: GlobeOrientation): Rotation {
  'worklet';
  return {
    cl: Math.cos(orientation.lambda),
    sl: Math.sin(orientation.lambda),
    cp: Math.cos(orientation.phi),
    sp: Math.sin(orientation.phi),
  };
}

/** Rotate a globe-frame vector into the view frame. Returns view x (right),
 * y (up) and z (toward the viewer; the point is on the visible hemisphere
 * when z > 0). */
export function toView(x: number, y: number, z: number, rot: Rotation): [number, number, number] {
  'worklet';
  const x1 = x * rot.cl - z * rot.sl;
  const z1 = x * rot.sl + z * rot.cl;
  const y2 = y * rot.cp - z1 * rot.sp;
  const z2 = y * rot.sp + z1 * rot.cp;
  return [x1, y2, z2];
}

/** The screen position of a coordinate, and whether it faces the viewer.
 * Hidden points still get a position (their place on the far side, seen
 * through the globe) so callers can decide what to do with them. */
export function projectPoint(
  lat: number,
  lon: number,
  orientation: GlobeOrientation,
  frame: GlobeFrame,
): { x: number; y: number; visible: boolean } {
  'worklet';
  const [gx, gy, gz] = toVector(lat, lon);
  const [vx, vy, vz] = toView(gx, gy, gz, rotation(orientation));
  return { x: frame.cx + frame.r * vx, y: frame.cy - frame.r * vy, visible: vz > 0 };
}

/** The coordinate under a canvas point, or null off the globe. Inverse of
 * `projectPoint` — the rotations undone in reverse order. */
export function unprojectPoint(
  px: number,
  py: number,
  orientation: GlobeOrientation,
  frame: GlobeFrame,
): { latitude: number; longitude: number } | null {
  'worklet';
  const vx = (px - frame.cx) / frame.r;
  const vy = (frame.cy - py) / frame.r;
  const r2 = vx * vx + vy * vy;
  if (r2 > 1) return null;
  const vz = Math.sqrt(1 - r2);
  const rot = rotation(orientation);
  const z1 = -vy * rot.sp + vz * rot.cp;
  const gy = vy * rot.cp + vz * rot.sp;
  const gx = vx * rot.cl + z1 * rot.sl;
  const gz = -vx * rot.sl + z1 * rot.cl;
  return { latitude: Math.asin(Math.max(-1, Math.min(1, gy))) * DEG, longitude: Math.atan2(gx, gz) * DEG };
}

/** A polyline's visible pieces on screen. Each piece is a flat [x, y, …]
 * list; where the line dips behind the horizon it is cut at the limb (the
 * crossing interpolated along the chord and pushed out to the circle) so
 * arcs end cleanly on the edge of the globe instead of vanishing mid-air. */
export function projectPolyline(packed: Float32Array, rot: Rotation, frame: GlobeFrame): number[][] {
  'worklet';
  const pieces: number[][] = [];
  let piece: number[] | null = null;
  let px = 0;
  let py = 0;
  let pz = 0;
  const count = packed.length / 3;
  for (let i = 0; i < count; i += 1) {
    const [vx, vy, vz] = toView(packed[i * 3], packed[i * 3 + 1], packed[i * 3 + 2], rot);
    const visible = vz > 0;
    if (i > 0 && visible !== pz > 0) {
      // Crossed the horizon between the previous sample and this one.
      const t = pz / (pz - vz);
      let hx = px + (vx - px) * t;
      let hy = py + (vy - py) * t;
      const len = Math.hypot(hx, hy) || 1;
      hx /= len;
      hy /= len;
      const sx = frame.cx + frame.r * hx;
      const sy = frame.cy - frame.r * hy;
      if (visible) {
        piece = [sx, sy];
      } else if (piece) {
        piece.push(sx, sy);
        pieces.push(piece);
        piece = null;
      }
    }
    if (visible) {
      if (!piece) piece = [];
      piece.push(frame.cx + frame.r * vx, frame.cy - frame.r * vy);
    }
    px = vx;
    py = vy;
    pz = vz;
  }
  if (piece && piece.length >= 4) pieces.push(piece);
  return pieces;
}

/** Distance from a point to a segment, in canvas points. */
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  'worklet';
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

/** The key of the route nearest a tap, within `tolerance` canvas points, or
 * null. Only visible pieces count — a route on the far side is not tappable
 * through the globe. */
export function nearestProjected(
  routes: { key: string; packed: Float32Array[] }[],
  x: number,
  y: number,
  orientation: GlobeOrientation,
  frame: GlobeFrame,
  tolerance: number,
): string | null {
  'worklet';
  const rot = rotation(orientation);
  let best: string | null = null;
  let bestDistance = tolerance;
  for (const route of routes) {
    for (const packed of route.packed) {
      for (const piece of projectPolyline(packed, rot, frame)) {
        for (let i = 2; i < piece.length; i += 2) {
          const d = segmentDistance(x, y, piece[i - 2], piece[i - 1], piece[i], piece[i + 1]);
          if (d < bestDistance) {
            bestDistance = d;
            best = route.key;
          }
        }
      }
    }
  }
  return best;
}

/** Longitude wrapped into [−π, π). */
export function wrapLambda(lambda: number): number {
  'worklet';
  const twoPi = Math.PI * 2;
  return ((((lambda + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

/** Radius of the globe that fits a strip of the canvas with some air. */
export const fitRadius = (width: number, height: number) => (Math.min(width, height) / 2) * 0.9;

/** Where the globe looks and how big it is: the orientation plus the size
 * relative to the fitted radius. */
export interface GlobeCamera extends GlobeOrientation {
  scale: number;
}

/** The globe as big as the World tab lets it get. At a 3× phone this puts
 * the 8192-wide detail texture at about one texel per one and a half
 * points, where coastlines still read as lines rather than steps. */
export const MAX_SCALE = 12;
export const MIN_SCALE = 0.7;

/** Undo the antimeridian split the map SDKs needed: a route's samples in
 * one list, the two ±180° edge points collapsed into one hop. On a sphere
 * there is no edge to split at. */
export function mergeSegments(segments: { latitude: number; longitude: number }[][]): {
  latitude: number;
  longitude: number;
}[] {
  const samples: { latitude: number; longitude: number }[] = [];
  for (const segment of segments) {
    for (const point of segment) {
      const prev = samples[samples.length - 1];
      if (prev && prev.latitude === point.latitude && Math.abs(prev.longitude) === 180) continue;
      samples.push(point);
    }
  }
  return samples;
}

/** The camera that frames a set of packed vectors: facing their centroid,
 * as close as the strip allows with `pad` of air. A point `theta` away from
 * the centre projects `r · sin(theta)` from it, so the radius that puts the
 * farthest point at the strip's edge is half the strip over that sine.
 * Anything spread wider than a hemisphere's worth just gets the whole globe
 * (scale 1). With nothing to frame, a gentle default over the Atlantic.
 *
 * With `focus` — a unit vector — the camera faces that point instead of the
 * centroid and frames the set around it: the next flight, or the one in
 * the air, in the middle, with as much of the rest as fits around it. */
export function fitCamera(
  packed: Float32Array[],
  stripWidth: number,
  stripHeight: number,
  fitR: number,
  maxScale: number,
  pad = 0.82,
  focus: readonly [number, number, number] | null = null,
): GlobeCamera {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  for (const p of packed) {
    for (let i = 0; i < p.length; i += 3) {
      sx += p[i];
      sy += p[i + 1];
      sz += p[i + 2];
      count += 1;
    }
  }
  const len = Math.hypot(sx, sy, sz);
  if (!count || len < 1e-6) return { lambda: -20 * RAD, phi: 25 * RAD, scale: 1 };
  const cx = focus ? focus[0] : sx / len;
  const cy = focus ? focus[1] : sy / len;
  const cz = focus ? focus[2] : sz / len;
  let maxTheta = 0;
  for (const p of packed) {
    for (let i = 0; i < p.length; i += 3) {
      const dot = Math.max(-1, Math.min(1, p[i] * cx + p[i + 1] * cy + p[i + 2] * cz));
      maxTheta = Math.max(maxTheta, Math.acos(dot));
    }
  }
  const phi = Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.asin(Math.max(-1, Math.min(1, cy)))));
  const lambda = Math.atan2(cx, cz);
  // Below a couple of degrees (one airport, a hop) the fit would zoom past
  // anything useful; hold it at a city-region view.
  const theta = Math.max(maxTheta, 1.5 * RAD);
  const half = (Math.min(stripWidth, stripHeight) / 2) * pad;
  const r = theta >= 80 * RAD ? fitR : half / Math.sin(theta);
  const scale = Math.max(1, Math.min(maxScale, r / fitR));
  return { lambda, phi, scale };
}

/** The shortest turn from one longitude to another, so an animation to a
 * fit never goes the long way round. Returns the target expressed next to
 * `from` (possibly outside [−π, π); wrap it after the animation). */
export function nearestLambda(from: number, to: number): number {
  'worklet';
  return from + wrapLambda(to - from);
}

/** A point `km` along `bearing` (degrees clockwise from north) from a
 * coordinate — used to give a plane a second point to aim at, so its screen
 * angle can be read off the projection rather than guessed from the
 * compass heading. */
export function offsetAlong(lat: number, lon: number, bearing: number, km: number): { latitude: number; longitude: number } {
  const d = km / 6371;
  const la = lat * RAD;
  const lo = lon * RAD;
  const b = bearing * RAD;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { latitude: la2 * DEG, longitude: ((((lo2 * DEG + 180) % 360) + 360) % 360) - 180 };
}

/** The stretch of a packed route lit by a travelling comet: sample index
 * range [from, to] for a head at fraction `head` (0–1+length) of the way,
 * plus what `cometAlpha` needs to ramp each index 0 at the tail to 1 at the
 * head. No closures: worklets call this. */
export function cometRange(
  count: number,
  head: number,
  length: number,
): { from: number; to: number; last: number; tail: number } | null {
  'worklet';
  const last = count - 1;
  const t0 = Math.max(0, head - length);
  const t1 = Math.min(1, head);
  if (t1 - t0 < 0.005) return null;
  // A hair of slack: 0.5 − 0.28 lands a rounding error under 0.22.
  return {
    from: Math.max(0, Math.floor(t0 * last + 1e-6)),
    to: Math.min(last, Math.ceil(t1 * last - 1e-6)),
    last,
    tail: head - length,
  };
}

/** The comet's alpha at sample index `i` of a range from `cometRange`. */
export function cometAlpha(range: { last: number; tail: number }, i: number, length: number): number {
  'worklet';
  return Math.max(0, Math.min(1, (i / range.last - range.tail) / length));
}
