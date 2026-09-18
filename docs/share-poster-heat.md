# Share poster heat layer (TypeGPU)

The World share poster (`src/screens/share-world.tsx`, `src/components/world-share-card.tsx`)
draws a route-density "heat" glow under the atlas lines. It is the app's one use of
WebGPU; the World globe stays on react-native-skia.

## What it is

Per heat pixel, the sum over every flown segment of
`weight × (exp(−d²/σ₁²) + 0.35·exp(−d²/σ₂²))`, where `d` is the distance to the segment,
`weight` is the pair's flight count capped at 6, `σ₁ = 0.7 %` and `σ₂ = 3 %` of the field
width. The field is square-rooted, then auto-exposed (`t = 1 − exp(−v·gain)`) so its peak
lands at the ramp's core (0.94) — but the gain is capped so a once-flown line never passes
`SINGLE_ROUTE_T` (0.36, cobalt): a journal of one-offs stays blue with green only where
routes meet. Coloured through a five-stop ramp per poster theme. Upcoming-only pairs are
left out — the glow is where somebody has been.

- Maths, ramps and packing (pure, jest-tested): `src/services/route-heat-field.ts`
- GPU passes, readback, PNG: `src/services/route-heat.ts` (`.web.ts` stub returns null)
- Geometry shared with the card so the glow sits on the lines: `shareMapModel()` in
  `src/services/world-share.ts`
- Prefs (poster theme, heat on/off): `src/services/share-prefs.ts`

## Pipeline

1. `shareMapModel(rows, now, format, single)` → routes + the fitted viewBox for the
   360 × 400 (story) / 360 × 250 (square) band.
2. `heatSegments()` packs the routes as `{a: vec2f, b: vec2f, w: f32}` in heat-pixel space
   (field = export size × `HEAT_SCALE` 0.5 → 540 × 600 / 540 × 375).
3. Compute pass 1 (`density`): field `array<f32>` + `atomicMax` peak.
4. `heatGain(peak)` on the CPU, written to the params uniform.
5. Compute pass 2 (`colour`): ramp → `pack4x8unorm` into `array<u32>`.
6. `copyBufferToBuffer` → `mapAsync` → `Skia.Image.MakeImage(RGBA_8888, Unpremul)` →
   `encodeToBytes(PNG)` → `Paths.cache/route-heat/<key>.png`.
7. The card draws the PNG with `expo-image` between the land path and the route lines;
   react-native-view-shot captures ordinary views as before.

Results are memoised per `routeHeatKey(model, theme)` for the session. No adapter
(`tgpu.init()` throws or `navigator.gpu` is missing) → `renderRouteHeat` resolves null,
the Heat switch is hidden, and the poster is the plain atlas — the same as Heat off.

## Stack

- `react-native-webgpu` (Dawn; the old `react-native-wgpu` name is deprecated). Headless:
  `navigator.gpu` is global, no Canvas view. Its Expo config plugin is in `app.json`
  and disables Metal API validation in the Xcode scheme — Dawn false-positives on the
  iOS simulator. Android emulators may fall back to a software adapter (slow, correct).
- `typegpu` + `unplugin-typegpu/babel` (`babel.config.js`): the `'use gpu'` functions in
  `route-heat.ts` become WGSL at build time. Read `node_modules/typegpu` typings rather
  than the docs site when an API is in doubt — the doc URLs move between minors.
- Both are native → prebuild + rebuild the dev clients after pulling. Dawn adds roughly
  22 MB (iOS arm64 static lib) / 17 MB (Android arm64 `.so`) before compression.

## Tuning

The mock page that produced the design images runs the same maths on a CPU canvas over
the real `assets/data/world-map.json`: `scratchpad/mock-share/build2.mjs` from the
2026-09-18 session (copies of the renders are in `~/Downloads/flyright-share-poster-*.png`).
Change the constants in `route-heat-field.ts` and the mock together; the ramp's reference
implementation `heatColour()` is what the shader must match.
