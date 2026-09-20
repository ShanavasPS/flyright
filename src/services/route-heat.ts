/** The share poster's heat layer: a route-density field drawn on the GPU.
 *
 * Every heat pixel sums a count-weighted gaussian of its distance to every
 * flown segment (a hub's pairs pile up, a one-off stays a faint line), the
 * field is square-rooted and auto-exposed so the busiest pixel lands at the
 * ramp's core, and a second pass colours it through the poster theme's ramp.
 * The pixels are read back, wrapped by Skia, encoded to PNG and written to
 * the cache directory; the card draws that file with expo-image under its
 * SVG routes, so react-native-view-shot keeps capturing ordinary views.
 *
 * WebGPU comes from react-native-webgpu (Dawn) headless — no canvas — and
 * TypeGPU turns the `'use gpu'` functions below into WGSL at build time
 * (unplugin-typegpu in babel.config.js). Without an adapter (old phone,
 * broken driver) everything resolves to null and the poster is the plain
 * atlas, which is also what the Heat switch's off state looks like. */

import { AlphaType, ColorType, ImageFormat, Skia } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import 'react-native-webgpu';
import { tgpu, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

import {
  HALO,
  HEAT_RAMPS,
  HEAT_SCALE,
  PEAK_STEPS,
  SEGMENT_STRIDE,
  heatGain,
  heatKernel,
  heatSegments,
} from '@/services/route-heat-field';
import type { PosterTheme, ShareMapModel } from '@/services/world-share';

/** Export scale of the poster: the 360-pt card is captured at 1080 px. */
const EXPORT_SCALE = 3;

/** WebGPU flag values, fixed by the spec. react-native-webgpu's re-exports
 * of `GPUBufferUsage`/`GPUMapMode` read `globalThis` when its module is
 * evaluated, which under Metro can be before the native install has set
 * them — they came back undefined on Android. */
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_DST = 0x0008;
const MAP_MODE_READ = 0x0001;

const Segment = d.struct({ a: d.vec2f, b: d.vec2f, w: d.f32 });

const Params = d.struct({
  count: d.u32,
  width: d.u32,
  k1: d.f32,
  k2: d.f32,
  halo: d.f32,
  gain: d.f32,
});

const Ramp = d.struct({
  c0: d.vec4f,
  c1: d.vec4f,
  c2: d.vec4f,
  c3: d.vec4f,
  c4: d.vec4f,
  stops: d.vec4f,
});

const densityLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  segments: { storage: d.arrayOf(Segment) },
  field: { storage: d.arrayOf(d.f32), access: 'mutable' },
  peak: { storage: d.atomic(d.u32), access: 'mutable' },
});

const colourLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  ramp: { uniform: Ramp },
  field: { storage: d.arrayOf(d.f32) },
  pixels: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

interface Gpu {
  root: TgpuRoot;
  density: ReturnType<TgpuRoot['createGuardedComputePipeline']>;
  colour: ReturnType<TgpuRoot['createGuardedComputePipeline']>;
}

function makePipelines(root: TgpuRoot): Gpu {
  // Pass 1 — the field: for this pixel, the sum over every segment of
  // weight × (core gaussian + halo gaussian) of the distance to it.
  const density = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const p = densityLayout.$.params;
    const px = d.f32(x) + 0.5;
    const py = d.f32(y) + 0.5;
    let sum = d.f32(0);
    for (let i = d.u32(0); i < p.count; i++) {
      const s = densityLayout.$.segments[i];
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const l2 = std.max(dx * dx + dy * dy, 0.000001);
      const t = std.clamp(((px - s.a.x) * dx + (py - s.a.y) * dy) / l2, 0, 1);
      const ex = s.a.x + t * dx - px;
      const ey = s.a.y + t * dy - py;
      const d2 = ex * ex + ey * ey;
      sum += s.w * (std.exp(-d2 * p.k1) + p.halo * std.exp(-d2 * p.k2));
    }
    // Square-rooted so a hub does not swallow the rest of the range.
    const v = std.sqrt(sum);
    densityLayout.$.field[y * p.width + x] = v;
    std.atomicMax(densityLayout.$.peak, d.u32(v * PEAK_STEPS));
  });

  // Pass 2 — colour: exposure, then the theme's five-stop ramp, packed as
  // RGBA bytes in memory order (pack4x8unorm puts .x in the lowest byte).
  const colour = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const p = colourLayout.$.params;
    const r = colourLayout.$.ramp;
    const i = y * p.width + x;
    const t = d.f32(1) - std.exp(-colourLayout.$.field[i] * p.gain);
    // A copy, not a reference — WGSL `let` cannot rebind a reference later.
    let c = d.vec4f(r.c4);
    if (t <= r.stops.x) {
      c = std.mix(r.c0, r.c1, t / r.stops.x);
    } else if (t <= r.stops.y) {
      c = std.mix(r.c1, r.c2, (t - r.stops.x) / (r.stops.y - r.stops.x));
    } else if (t <= r.stops.z) {
      c = std.mix(r.c2, r.c3, (t - r.stops.y) / (r.stops.z - r.stops.y));
    } else if (t <= r.stops.w) {
      c = std.mix(r.c3, r.c4, (t - r.stops.z) / (r.stops.w - r.stops.z));
    }
    colourLayout.$.pixels[i] = std.pack4x8unorm(c);
  });

  return { root, density, colour };
}

let gpuPromise: Promise<Gpu | null> | null = null;

/** The device and pipelines, once per app run; null where WebGPU is not
 * available. Never throws — the poster must never fail over its glow. */
function getGpu(): Promise<Gpu | null> {
  gpuPromise ??= (async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return null;
      const root = await tgpu.init();
      return makePipelines(root);
    } catch (e) {
      console.warn('[route-heat] WebGPU unavailable', e);
      return null;
    }
  })();
  return gpuPromise;
}

/** Whether this device can draw the heat at all — the share screen hides
 * the switch when it cannot. */
export async function routeHeatSupported(): Promise<boolean> {
  return (await getGpu()) !== null;
}

const HEAT_DIR = 'route-heat';

/** Finished PNGs by request key, so flipping theme or format back and forth
 * on the share screen re-uses what was already drawn this session. */
const rendered = new Map<string, Promise<string | null>>();
const MAX_CACHED = 12;

/** A short stable name for the rows + fit + theme, for the cache and the
 * file name. */
export function routeHeatKey(model: ShareMapModel, theme: PosterTheme): string {
  let hash = 2166136261;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  };
  for (const route of model.routes) feed(`${route.key}:${route.count}:${route.upcomingOnly ? 1 : 0};`);
  feed(`${model.box.x.toFixed(1)},${model.box.y.toFixed(1)},${model.box.width.toFixed(1)};${model.width}x${model.height};${theme}`);
  return hash.toString(16);
}

/** Draws the heat for the poster's map band in `theme` and returns the
 * PNG's file URI, or null when there is nothing to draw or no GPU. */
export function renderRouteHeat(model: ShareMapModel, theme: PosterTheme): Promise<string | null> {
  const key = routeHeatKey(model, theme);
  const hit = rendered.get(key);
  if (hit) return hit;
  const job = render(model, theme, key).catch((e) => {
    console.warn('[route-heat] render failed', e);
    rendered.delete(key);
    return null;
  });
  rendered.set(key, job);
  if (rendered.size > MAX_CACHED) {
    const oldest = rendered.keys().next().value;
    if (oldest !== undefined) rendered.delete(oldest);
  }
  return job;
}

async function render(model: ShareMapModel, theme: PosterTheme, key: string): Promise<string | null> {
  const gpu = await getGpu();
  if (!gpu) return null;

  const width = Math.round(model.width * EXPORT_SCALE * HEAT_SCALE);
  const height = Math.round(model.height * EXPORT_SCALE * HEAT_SCALE);
  const segments = heatSegments(model.routes, model.box, width, height);
  const count = segments.length / SEGMENT_STRIDE;
  if (count === 0) return null;

  const { root, density, colour } = gpu;
  const { k1, k2 } = heatKernel(width);
  const ramp = HEAT_RAMPS[theme];
  const pixelCount = width * height;

  const params = root.createBuffer(Params, { count, width, k1, k2, halo: HALO, gain: 0 }).$usage('uniform');
  const segmentBuffer = root.createBuffer(d.arrayOf(Segment, count)).$usage('storage');
  const field = root.createBuffer(d.arrayOf(d.f32, pixelCount)).$usage('storage');
  const peak = root.createBuffer(d.atomic(d.u32), 0).$usage('storage');
  const pixels = root.createBuffer(d.arrayOf(d.u32, pixelCount)).$usage('storage');
  const rampBuffer = root
    .createBuffer(Ramp, {
      c0: d.vec4f(...ramp.colours[0]),
      c1: d.vec4f(...ramp.colours[1]),
      c2: d.vec4f(...ramp.colours[2]),
      c3: d.vec4f(...ramp.colours[3]),
      c4: d.vec4f(...ramp.colours[4]),
      stops: d.vec4f(...ramp.stops),
    })
    .$usage('uniform');
  const staging = root.device.createBuffer({
    size: pixelCount * 4,
    usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
  });

  try {
    // The packed Float32Array already has the struct array's exact layout, so
    // it goes straight into the buffer's host copy — no per-struct encoding.
    new Float32Array(segmentBuffer.arrayBuffer).set(segments);
    segmentBuffer.write(segmentBuffer.arrayBuffer);

    density
      .with(root.createBindGroup(densityLayout, { params, segments: segmentBuffer, field, peak }))
      .dispatchThreads(width, height);
    const gain = heatGain(await peak.read());
    params.write({ count, width, k1, k2, halo: HALO, gain });
    colour
      .with(root.createBindGroup(colourLayout, { params, ramp: rampBuffer, field, pixels }))
      .dispatchThreads(width, height);

    // TypeGPU buffers carry COPY_SRC; one copy into a mappable buffer and
    // the bytes are ours — no per-element deserialisation of a million u32s.
    const encoder = root.device.createCommandEncoder();
    encoder.copyBufferToBuffer(root.unwrap(pixels), 0, staging, 0, pixelCount * 4);
    root.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(MAP_MODE_READ);
    const bytes = new Uint8Array(staging.getMappedRange().slice(0));
    staging.unmap();

    const image = Skia.Image.MakeImage(
      { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
      Skia.Data.fromBytes(bytes),
      width * 4,
    );
    if (!image) return null;
    const png = image.encodeToBytes(ImageFormat.PNG, 100);
    image.dispose();

    const dir = new Directory(Paths.cache, HEAT_DIR);
    if (!dir.exists) dir.create();
    const file = new File(dir, `${key}.png`);
    if (file.exists) file.delete();
    file.create();
    await file.write(png);
    return file.uri;
  } finally {
    staging.destroy();
    for (const buffer of [params, segmentBuffer, field, peak, pixels, rampBuffer]) buffer.destroy();
  }
}
