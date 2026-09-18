/** The maths of the share poster's heat layer, kept free of GPU and Skia so
 * it runs under jest: which line segments the field sums over, how they are
 * weighted, and how the field is exposed and coloured. `route-heat.ts` feeds
 * these to the compute pass. */

import { project, type GeoRoute, type ViewBox } from '@/services/geo';
import type { PosterTheme } from '@/services/world-share';

/** Heat pixels per exported pixel. The glow is soft by nature, so half the
 * export resolution upscales invisibly and quarters the work. */
export const HEAT_SCALE = 0.5;

/** Floats per segment in the packed buffer: a.xy, b.xy, weight, padding —
 * the WGSL layout of `struct { a: vec2f, b: vec2f, w: f32 }` (stride 24). */
export const SEGMENT_STRIDE = 6;

/** A pair flown more often than this glows no brighter — the ramp's top is
 * for the busiest place, not for a commuter's single pair to blow out. */
export const MAX_WEIGHT = 6;

/** Kernel widths as a fraction of the field's width: a tight core that keeps
 * a ×6 pair apart from a one-off, and a wide soft halo (at `HALO` of the
 * core's strength) that turns a hub into a glow rather than a line. */
export const CORE_SIGMA = 0.007;
export const HALO_SIGMA = 0.03;
export const HALO = 0.35;

/** The field is stored as its square root and the peak read back quantised
 * to this many steps per unit — plenty for exposure, and integers are what
 * `atomicMax` takes. */
export const PEAK_STEPS = 4096;

/** Flown routes as line segments in heat-pixel space, packed for the GPU.
 * Upcoming-only pairs are left out: the glow is where somebody has been. */
export function heatSegments(routes: GeoRoute[], box: ViewBox, width: number, height: number): Float32Array {
  const sx = width / box.width;
  const sy = height / box.height;
  let count = 0;
  for (const route of routes) {
    if (route.upcomingOnly) continue;
    for (const segment of route.segments) count += Math.max(0, segment.length - 1);
  }
  const data = new Float32Array(count * SEGMENT_STRIDE);
  let i = 0;
  for (const route of routes) {
    if (route.upcomingOnly) continue;
    const weight = Math.min(route.count, MAX_WEIGHT);
    for (const segment of route.segments) {
      for (let p = 1; p < segment.length; p++) {
        const a = project(segment[p - 1].latitude, segment[p - 1].longitude);
        const b = project(segment[p].latitude, segment[p].longitude);
        data[i++] = (a.x - box.x) * sx;
        data[i++] = (a.y - box.y) * sy;
        data[i++] = (b.x - box.x) * sx;
        data[i++] = (b.y - box.y) * sy;
        data[i++] = weight;
        data[i++] = 0;
      }
    }
  }
  return data;
}

/** Gaussian falloff constants (1/σ²) for a field `width` pixels across. */
export function heatKernel(width: number): { k1: number; k2: number } {
  const s1 = width * CORE_SIGMA;
  const s2 = width * HALO_SIGMA;
  return { k1: 1 / (s1 * s1), k2: 1 / (s2 * s2) };
}

/** Where a lone once-flown route's core lands on the ramp: cobalt, never
 * green. Green and the white core are for places flown more, or through. */
export const SINGLE_ROUTE_T = 0.36;

/** Auto-exposure: the gain that puts the field's peak at the ramp's core
 * (t = 0.94), whatever the journal's size — one flight and two hundred both
 * make a poster — but never so much that a once-flown line reads as hot: a
 * journal of one-offs stays cobalt with green only where routes meet.
 * `peak` is the quantised maximum the compute pass recorded. */
export function heatGain(peak: number): number {
  const max = peak / PEAK_STEPS;
  if (max <= 0) return 0;
  const single = Math.sqrt(1 + HALO); // the field on a count-1 segment
  return Math.min(-Math.log(0.06) / max, -Math.log(1 - SINGLE_ROUTE_T) / single);
}

/** Colour stop: [r, g, b, a] in 0–1. */
export type HeatColour = [number, number, number, number];

export interface HeatRamp {
  /** Five colours, from nothing to the core. */
  colours: [HeatColour, HeatColour, HeatColour, HeatColour, HeatColour];
  /** Where colours 1–4 sit on 0–1 (colour 0 is at 0). */
  stops: [number, number, number, number];
}

const c = (r: number, g: number, b: number, a: number): HeatColour => [r / 255, g / 255, b / 255, a];

/** Per poster theme. Dark runs the brand's cobalt into payout green and a
 * near-white core; on paper a white core would vanish, so light ends in a
 * deep green instead. */
export const HEAT_RAMPS: Record<PosterTheme, HeatRamp> = {
  dark: {
    colours: [c(78, 155, 245, 0), c(78, 155, 245, 0.42), c(70, 190, 200, 0.75), c(47, 214, 140, 0.92), c(236, 252, 244, 1)],
    stops: [0.22, 0.55, 0.8, 1],
  },
  light: {
    colours: [c(120, 175, 245, 0), c(120, 175, 245, 0.35), c(30, 107, 224, 0.7), c(19, 168, 106, 0.9), c(6, 92, 64, 1)],
    stops: [0.22, 0.55, 0.8, 1],
  },
};

/** Reference implementation of the ramp, for tests and for checking the
 * shader against. */
export function heatColour(ramp: HeatRamp, t: number): HeatColour {
  const stops = [0, ...ramp.stops];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i]) {
      const k = (t - stops[i - 1]) / (stops[i] - stops[i - 1]);
      const a = ramp.colours[i - 1];
      const b = ramp.colours[i];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
  }
  return ramp.colours[4];
}
