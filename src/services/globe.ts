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
