/* eslint-disable react-hooks/immutability -- Reanimated shared values are
   mutable by contract: the gesture worklets below write them, the derived
   values read them. The compiler lint reads those hooks as effects. */
import {
  Canvas,
  Circle,
  DashPathEffect,
  Fill,
  FilterMode,
  Group,
  ImageShader,
  MipmapMode,
  Path,
  Shader,
  Skia,
  Text,
  matchFont,
  useClock,
  type SkFont,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { COMET_LENGTH, routePlane, type GeoAirport, type GeoRoute, type LatLng } from '@/services/geo';
import {
  MAX_SCALE,
  MAX_TILT,
  MIN_SCALE,
  cometAlpha,
  cometRange,
  fitCamera,
  fitRadius,
  mergeSegments,
  nearestLambda,
  nearestProjected,
  offsetAlong,
  packVectors,
  projectPolyline,
  rotation,
  toVector,
  toView,
  wrapLambda,
  type GlobeCamera,
} from '@/services/globe';
import { BASE_SIZE, TILE, type GlobeTextures } from '@/services/globe-textures';
import { sunVector } from '@/services/sun';

/** How close, in canvas points, a tap must land to a route to select it. */
const ROUTE_TAP_TOLERANCE = 22;
/** Airport labels appear from this zoom on ('auto' mode). */
const LABEL_SCALE = 3;
/** The detail tiles take over from the base mask from this zoom on. */
const DETAIL_SCALE = 1.8;
/** Country borders fade in across this zoom range. */
const BORDER_FADE = [2.2, 4.5] as const;
/** A double tap zooms in by this much, about the tapped point. */
const DOUBLE_TAP_ZOOM = 2.2;
/** Generous: a test driver's double tap lands 350 ms apart, a thumb's well under. */
const DOUBLE_TAP_MS = 420;
const FIT_MS = 650;
/** One comet pass, origin to clear of the destination, in ms. Longer arcs
 * get a little longer so the light doesn't race across a long haul. */
function cometPeriod(samples: number): number {
  'worklet';
  return Math.min(5200, 2400 + samples * 12);
}
const PULSE_PERIOD_MS = 1400;
/** Comet alpha is drawn in this many steps, each its own stroke. */
const COMET_STEPS = 6;
/** The beacon's rings: one ring's life, how many are in flight at once,
 * how far each spreads (points) and how heavy it is drawn. Tuned by eye
 * with the user (2026-09-18): clearly there across a busy globe, without
 * shouting. */
const BEACON_PERIOD_MS = 2000;
const BEACON_RINGS = 2;
const BEACON_REACH = 23;
const BEACON_STROKE = 2;
/** A soft halo under the rings, so the spot is marked even between pulses. */
const BEACON_HALO = 8;
/** The sun moves a quarter of a degree a minute — under a pixel here. */
const SUN_TICK_MS = 60_000;
/** Flipping the switch fades between the two lightings. */
const DAYLIGHT_FADE_MS = 500;

/** Material "flight" glyph, nose up, in a 24×24 box — the same one the
 * map markers drew. */
const PLANE_PATH = Skia.Path.MakeFromSVGString(
  'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z',
)!;
const PLANE_SIZE = 22;

export interface GlobeColors {
  sea: string;
  land: string;
  border: string;
  tint: string;
  background: string;
  label: string;
  /** What the night side sinks towards when the globe is lit by the sun. */
  night: string;
}

/** The globe's own sea, land, border and label colours. The map's near-
 * white land on a pale sea blurs together once shaded on a sphere: the
 * globe wants blue oceans and pale continents, the way the earth reads
 * from orbit — deep navy water in the dark scheme. */
export function globePalette(dark: boolean): Pick<GlobeColors, 'sea' | 'land' | 'border' | 'label' | 'night'> {
  return dark
    ? { sea: '#0B1A38', land: '#33486E', border: '#5A72A0', label: '#F2F6FB', night: '#040A1A' }
    : // A dusk blue rather than black: the pale land has to stay legible
      // where it is night.
      { sea: '#B9D0EF', land: '#F7F9FC', border: '#A9BBD6', label: '#13294B', night: '#22355E' };
}

interface PackedRoute {
  key: string;
  upcoming: boolean;
  weight: number;
  /** Samples in the pair's order, as unit vectors. */
  samples: Float32Array;
  /** Samples in the direction the next flight flies, for the comet. */
  flying: Float32Array;
  /** Still to fly, for an aircraft mid-track — drawn dashed. */
  remaining: Float32Array[];
  plane: {
    anchor: [number, number, number];
    aim: [number, number, number];
    upcoming: boolean;
    /** In the air right now, at the end of a track still being flown. */
    live: boolean;
  };
}

/** A coordinate the globe marks with a radar beacon — the next flight's
 * origin while its travel day is on the home screen. */
export interface GlobeBeacon {
  latitude: number;
  longitude: number;
}

/** An aircraft in the air: which route pair it flies and where it is now.
 * That route's own plane (pulsing by the origin, or mid-arc) gives way to it. */
export interface GlobeLivePlane {
  key: string;
  coordinate: LatLng;
  /** Compass heading, degrees clockwise from north. */
  heading: number;
}

/**
 * The earth, lit and turning, with the traveller's routes drawn on it.
 *
 * One Skia runtime shader draws the sphere: for every pixel inside the
 * disc it finds the point on the globe under it, turns that into a
 * latitude and longitude, and looks up land or sea in an equirectangular
 * mask — the 2048-wide base at a glance, eight tiles at four times that
 * once zoomed in, with country borders fading in past that. Lighting, the
 * limb's atmospheric glow and the anti-aliased edge are the same pass, so
 * the globe costs one fill however much land is in view. Routes, planes,
 * comets and airports are projected with the same maths on the UI thread,
 * so drags, flicks and pinches never wait for JavaScript.
 *
 * Lighting is one of two: a fixed studio light from the upper left, or —
 * `daylight` — the sun where it actually is at `sunAt` (now, ticking, when
 * not given), so the day side, the night side and the twilight band between
 * them are the earth's own for that moment (see services/sun).
 *
 * Planes are drawn only where there is still something to fly: upcoming
 * routes (pulsing by the origin) and a flight in the air (at the end of its
 * track). Flown routes keep their line and airports but no aircraft, so the
 * eye goes to what is next; `pastPlanes` restores them for a picture of one
 * past trip. A `beacon` marks a coordinate with spreading radar rings.
 *
 * The camera is three shared values: `lambda`/`phi` are the coordinate at
 * the centre of the disc and `scale` its size relative to the fitted
 * radius (1 = the whole globe in the strip, up to MAX_SCALE). Interactive,
 * it takes pan (with inertia), pinch about the fingers, a double tap to
 * zoom in and a tap to pick a route. Static, it is a picture framed on the
 * routes — the trip page's inset.
 */
export function GlobeView({
  routes,
  airports,
  selectedKey = null,
  width,
  height,
  strip = { top: 0, bottom: 0 },
  textures,
  colors,
  interactive = true,
  holdFit = false,
  labels = 'auto',
  animate = true,
  fitPad,
  daylight = false,
  sunAt = null,
  beacon = null,
  beaconAnimate = animate,
  fitFocus = null,
  livePlane = null,
  pastPlanes = false,
  onSelect,
  onMoved,
  testID,
}: {
  routes: GeoRoute[];
  airports: GeoAirport[];
  selectedKey?: string | null;
  /** Canvas size — the globe fills the whole area. */
  width: number;
  height: number;
  /** Overlay heights the fit keeps clear of, like the old map's padding. */
  strip?: { top: number; bottom: number };
  textures: GlobeTextures;
  colors: GlobeColors;
  /** Gestures, or a still picture. */
  interactive?: boolean;
  /** True while the traveller has the camera: new routes then don't pull
   * it back to their fit. Flipping it false animates back to the fit. */
  holdFit?: boolean;
  /** Airport codes: from a zoom on, or always (the inset). */
  labels?: 'auto' | 'always';
  /** Whether comets run and undeparted planes pulse. */
  animate?: boolean;
  /** Air around the fit, 0–1 of the strip's half-size. */
  fitPad?: number;
  /** Light the globe by the sun (day and night) rather than the studio light. */
  daylight?: boolean;
  /** The instant the sun is placed for, ms since epoch; null means now,
   * kept current while the globe is up. */
  sunAt?: number | null;
  /** A coordinate to mark with radar rings, or null for none. */
  beacon?: GlobeBeacon | null;
  /** Whether the rings spread — by default with everything else; the
   * still inset keeps them moving on their own. */
  beaconAnimate?: boolean;
  /** The coordinate the fit faces (the overview, Recenter, All travels)
   * instead of the routes' centroid — the beacon, so the next flight or the
   * one in the air sits in the middle. */
  fitFocus?: GlobeBeacon | null;
  /** A flight in the air, drawn where it is instead of its route's plane. */
  livePlane?: GlobeLivePlane | null;
  /** Draw a plane on flown routes too (the trip page's inset). */
  pastPlanes?: boolean;
  onSelect?: (key: string | null) => void;
  /** The traveller took the camera somewhere: the fit no longer holds. */
  onMoved?: () => void;
  testID?: string;
}) {
  const stripHeight = Math.max(height - strip.top - strip.bottom, 80);
  const cx = width / 2;
  const cy = strip.top + stripHeight / 2;
  const fitR = fitRadius(width, stripHeight);

  // Route samples as unit vectors, converted once; each frame only rotates.
  const packed = useMemo<PackedRoute[]>(
    () =>
      routes.map((route) => {
        const samples = packVectors(mergeSegments(route.segments));
        const plane = routePlane(route);
        const flying = plane.forward ? samples : reversed(samples);
        const aim = offsetAlong(plane.coordinate.latitude, plane.coordinate.longitude, plane.heading, 60);
        return {
          key: route.key,
          upcoming: route.upcomingOnly,
          weight: 2.5 + Math.min(route.count - 1, 4) * 0.5,
          samples,
          flying,
          remaining: (route.remaining ?? []).map((segment) => packVectors(segment)),
          plane: {
            anchor: toVector(plane.coordinate.latitude, plane.coordinate.longitude),
            aim: toVector(aim.latitude, aim.longitude),
            upcoming: plane.upcoming,
            live: route.path?.kind === 'track' && !route.path.complete,
          },
        };
      }),
    [routes],
  );
  const airportVectors = useMemo(
    () =>
      airports.map((airport) => ({
        iata: airport.iata,
        v: toVector(airport.lat, airport.lon),
        r: 2.5 + Math.min(airport.count, 5) * 0.4,
      })),
    [airports],
  );
  const fit = useMemo<GlobeCamera>(
    () =>
      fitCamera(
        [...packed.map((route) => route.samples), packVectors(airports.map((a) => ({ latitude: a.lat, longitude: a.lon })))],
        width,
        stripHeight,
        fitR,
        MAX_SCALE,
        fitPad,
        fitFocus ? toVector(fitFocus.latitude, fitFocus.longitude) : null,
      ),
    [packed, airports, width, stripHeight, fitR, fitPad, fitFocus],
  );

  const lambda = useSharedValue(fit.lambda);
  const phi = useSharedValue(fit.phi);
  const scale = useSharedValue(fit.scale);
  const opacity = useSharedValue(0);

  // Back to the fit whenever it changes (new routes, a resize) or the hold
  // is released, the short way round. The very first fit is the initial
  // value above.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (holdFit) return;
    const easing = Easing.inOut(Easing.cubic);
    lambda.value = withTiming(nearestLambda(lambda.value, fit.lambda), { duration: FIT_MS, easing }, () => {
      'worklet';
      lambda.value = wrapLambda(lambda.value);
    });
    phi.value = withTiming(fit.phi, { duration: FIT_MS, easing });
    scale.value = withTiming(fit.scale, { duration: FIT_MS, easing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit on a new fit or a released hold only
  }, [fit, holdFit]);

  // Nothing is shown until the base mask can be: a runtime shader with no
  // image to sample paints the whole canvas black on Android.
  useEffect(() => {
    if (!textures.base) return;
    opacity.value = withTiming(1, { duration: interactive ? 240 : 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the texture is in
  }, [textures.base]);

  // The sun: at the given instant, or now — re-read every minute while the
  // globe is lit by it, since that is the only time it shows.
  const [sunNow, setSunNow] = useState(() => Date.now());
  const ticking = daylight && sunAt == null;
  useEffect(() => {
    if (!ticking) return;
    const update = () => setSunNow(Date.now());
    // Catch up at once (the switch may be flipped hours after mount), then tick.
    const first = setTimeout(update, 0);
    const id = setInterval(update, SUN_TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ticking]);
  const sunDir = useMemo(() => sunVector(sunAt ?? sunNow), [sunAt, sunNow]);
  const daylightMix = useSharedValue(daylight ? 1 : 0);
  useEffect(() => {
    daylightMix.value = withTiming(daylight ? 1 : 0, { duration: DAYLIGHT_FADE_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shared value is stable
  }, [daylight]);

  const detail = textures.detail;
  const borders = textures.borders;
  const uniforms = useDerivedValue(() => ({
    centre: [cx, cy],
    radius: fitR * scale.value,
    lambda: lambda.value,
    phi: phi.value,
    baseSize: [BASE_SIZE.width, BASE_SIZE.height],
    tile: TILE,
    useDetail: detail && scale.value >= DETAIL_SCALE ? 1 : 0,
    borderAlpha: borders ? smoothstep(BORDER_FADE[0], BORDER_FADE[1], scale.value) : 0,
    seaColor: rgb(colors.sea),
    landColor: rgb(colors.land),
    borderColor: rgb(colors.border),
    glowColor: rgb(colors.tint),
    nightColor: rgb(colors.night),
    lightDir: LIGHT,
    sunDir,
    daylight: daylightMix.value,
  }));

  // Route paths, built together so the projection runs once per frame.
  const paths = useDerivedValue(() => {
    const rot = rotation({ lambda: lambda.value, phi: phi.value });
    const frame = { cx, cy, r: fitR * scale.value };
    const flown = Skia.PathBuilder.Make();
    const upcoming = Skia.PathBuilder.Make();
    const selected = Skia.PathBuilder.Make();
    const remaining = Skia.PathBuilder.Make();
    for (const route of packed) {
      const target = route.key === selectedKey ? selected : route.upcoming ? upcoming : flown;
      for (const piece of projectPolyline(route.samples, rot, frame)) {
        target.moveTo(piece[0], piece[1]);
        for (let i = 2; i < piece.length; i += 2) target.lineTo(piece[i], piece[i + 1]);
      }
      for (const segment of route.remaining) {
        for (const piece of projectPolyline(segment, rot, frame)) {
          remaining.moveTo(piece[0], piece[1]);
          for (let i = 2; i < piece.length; i += 2) remaining.lineTo(piece[i], piece[i + 1]);
        }
      }
    }
    const dots = Skia.PathBuilder.Make();
    for (const airport of airportVectors) {
      const [vx, vy, vz] = toView(airport.v[0], airport.v[1], airport.v[2], rot);
      if (vz > 0.02) dots.addCircle(frame.cx + frame.r * vx, frame.cy - frame.r * vy, airport.r);
    }
    return {
      flown: flown.build(),
      upcoming: upcoming.build(),
      selected: selected.build(),
      remaining: remaining.build(),
      dots: dots.build(),
    };
  });
  const flownPath = useDerivedValue(() => paths.value.flown);
  const upcomingPath = useDerivedValue(() => paths.value.upcoming);
  const selectedPath = useDerivedValue(() => paths.value.selected);
  const remainingPath = useDerivedValue(() => paths.value.remaining);
  const dotsPath = useDerivedValue(() => paths.value.dots);

  const font = useMemo(() => labelFont(), []);
  const camera = { lambda, phi, scale, cx, cy, fitR };

  const moved = () => onMoved?.();
  const select = (key: string | null) => onSelect?.(key);

  const pinchStart = useSharedValue(1);
  const focal = useSharedValue({ x: 0, y: 0 });

  const pan = Gesture.Pan()
    .enabled(interactive)
    // A tap with a little wobble must stay a tap, not fling the globe.
    .minDistance(10)
    .maxPointers(1)
    .onStart(() => {
      cancelAnimation(lambda);
      cancelAnimation(phi);
    })
    .onChange((e) => {
      const r = fitR * scale.value;
      lambda.value = wrapLambda(lambda.value - e.changeX / r);
      phi.value = clampTilt(phi.value + e.changeY / r);
    })
    .onEnd((e) => {
      const r = fitR * scale.value;
      // Inertia only for a real flick; a nudge stops where the finger left it.
      if (Math.hypot(e.velocityX, e.velocityY) > 80) {
        lambda.value = withDecay({ velocity: -e.velocityX / r, deceleration: 0.996 });
        phi.value = withDecay({ velocity: e.velocityY / r, deceleration: 0.996, clamp: [-MAX_TILT, MAX_TILT] });
      }
      runOnJS(moved)();
    });

  const pinch = Gesture.Pinch()
    .enabled(interactive)
    .onStart((e) => {
      cancelAnimation(scale);
      cancelAnimation(lambda);
      cancelAnimation(phi);
      pinchStart.value = scale.value;
      focal.value = { x: e.focalX, y: e.focalY };
    })
    .onChange((e) => {
      const r0 = fitR * scale.value;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.value * e.scale));
      const r1 = fitR * next;
      // Keep the point under the fingers under the fingers: the part of
      // the globe there moves out from the centre as it grows, so turn the
      // globe back by that much — and follow the fingers as they drift.
      const vx = (e.focalX - cx) / r0;
      const vy = (cy - e.focalY) / r0;
      const dx = (r1 - r0) * vx - (e.focalX - focal.value.x);
      const dy = -(r1 - r0) * vy - (e.focalY - focal.value.y);
      focal.value = { x: e.focalX, y: e.focalY };
      scale.value = next;
      lambda.value = wrapLambda(lambda.value + dx / r1);
      phi.value = clampTilt(phi.value - dy / r1);
    })
    .onEnd(() => {
      if (scale.value < 1) scale.value = withTiming(1, { duration: 260 });
      runOnJS(moved)();
    });

  const selectAt = (x: number, y: number) => {
    const orientation = { lambda: lambda.value, phi: phi.value };
    const frame = { cx, cy, r: fitR * scale.value };
    select(
      nearestProjected(
        packed.map((route) => ({ key: route.key, packed: [route.samples] })),
        x,
        y,
        orientation,
        frame,
        ROUTE_TAP_TOLERANCE,
      ),
    );
  };
  // Taps are told apart on the UI thread: a second tap within DOUBLE_TAP_MS
  // of the first, close to it, zooms in about that point (keeping what was
  // under it under it); every tap also selects, at once, so a double tap on
  // a route docks its card and zooms in on it. One recogniser, the same on
  // both platforms — an exclusive pair of tap recognisers missed double
  // taps on iOS.
  const lastTap = useSharedValue({ x: 0, y: 0, at: 0 });
  const tap = Gesture.Tap()
    .enabled(interactive)
    .maxDistance(12)
    .onEnd((e) => {
      const now = nowMs();
      const last = lastTap.value;
      runOnJS(selectAt)(e.x, e.y);
      if (now - last.at < DOUBLE_TAP_MS && Math.hypot(e.x - last.x, e.y - last.y) < 30) {
        lastTap.value = { x: 0, y: 0, at: 0 };
        const r0 = fitR * scale.value;
        const next = Math.min(MAX_SCALE, scale.value * DOUBLE_TAP_ZOOM);
        if (next === scale.value) return;
        const r1 = fitR * next;
        const vx = (e.x - cx) / r0;
        const vy = (cy - e.y) / r0;
        const config = { duration: 320, easing: Easing.out(Easing.cubic) };
        scale.value = withTiming(next, config);
        lambda.value = withTiming(lambda.value + ((r1 - r0) * vx) / r1, config, () => {
          'worklet';
          lambda.value = wrapLambda(lambda.value);
        });
        phi.value = withTiming(clampTilt(phi.value + ((r1 - r0) * vy) / r1), config);
        runOnJS(moved)();
        return;
      }
      lastTap.value = { x: e.x, y: e.y, at: now };
    });

  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // The route with a plane in the air draws that plane and nothing else
  // moving — no comet, no pulse by the origin.
  const liveKey = livePlane?.key ?? null;
  const liveRoute = useMemo<PackedRoute | null>(() => {
    if (!livePlane) return null;
    const route = packed.find((candidate) => candidate.key === livePlane.key);
    if (!route) return null;
    const { latitude, longitude } = livePlane.coordinate;
    const aim = offsetAlong(latitude, longitude, livePlane.heading, 60);
    return {
      ...route,
      plane: { ...route.plane, anchor: toVector(latitude, longitude), aim: toVector(aim.latitude, aim.longitude) },
    };
  }, [packed, livePlane]);
  const upcomingRoutes = packed.filter((route) => route.plane.upcoming && route.key !== liveKey);
  // Aircraft on routes that are not waiting to leave: the one in the air,
  // and — only when asked — a plane mid-arc on a flown route.
  const stillRoutes = packed.filter(
    (route) => route.key !== liveKey && !route.plane.upcoming && (pastPlanes || route.plane.live),
  );
  const beaconVector = useMemo(
    () => (beacon ? toVector(beacon.latitude, beacon.longitude) : null),
    [beacon],
  );

  const canvas = (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }, fade]}
      accessibilityLabel={
        interactive ? 'Globe of your travels. Drag to turn it, pinch to zoom, double tap to zoom in.' : undefined
      }
      testID={testID}>
      <Canvas style={styles.canvas}>
        {textures.base && (
          <Fill>
            <Shader source={SHADER} uniforms={uniforms}>
              <ImageShader image={textures.base} tx="repeat" ty="clamp" sampling={SAMPLING} />
              {(detail ?? PLACEHOLDERS.detail).map((image, i) => (
                <ImageShader key={`d${i}`} image={image ?? textures.base} tx="clamp" ty="clamp" sampling={SAMPLING} />
              ))}
              {(borders ?? PLACEHOLDERS.borders).map((image, i) => (
                <ImageShader key={`b${i}`} image={image ?? textures.base} tx="clamp" ty="clamp" sampling={SAMPLING} />
              ))}
            </Shader>
          </Fill>
        )}
        <Path path={upcomingPath} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" color={colors.tint} opacity={0.4} />
        <Path path={remainingPath} style="stroke" strokeWidth={2.5} strokeCap="round" strokeJoin="round" color={colors.tint} opacity={0.55}>
          <DashPathEffect intervals={[6, 6]} />
        </Path>
        <Path path={flownPath} style="stroke" strokeWidth={2.5} strokeCap="round" strokeJoin="round" color={colors.tint} />
        <Path path={selectedPath} style="stroke" strokeWidth={9} strokeCap="round" strokeJoin="round" color={colors.tint} opacity={0.28} />
        <Path path={selectedPath} style="stroke" strokeWidth={3.5} strokeCap="round" strokeJoin="round" color={colors.tint} />
        {animate && upcomingRoutes.length > 0 && (
          <Comets routes={upcomingRoutes} camera={camera} color={colors.tint} />
        )}
        <Path path={dotsPath} color={colors.background} style="stroke" strokeWidth={2} />
        <Path path={dotsPath} color={colors.tint} />
        {stillRoutes.map((route) => (
          <PlaneGlyph key={route.key} route={route} camera={camera} colors={colors} clock={null} />
        ))}
        {liveRoute && <PlaneGlyph route={liveRoute} camera={camera} colors={colors} clock={null} />}
        {upcomingRoutes.length > 0 && (
          <PulsingPlanes routes={upcomingRoutes} camera={camera} colors={colors} animate={animate} />
        )}
        {airportVectors.map((airport) => (
          <AirportLabel key={airport.iata} airport={airport} camera={camera} font={font} color={colors.label} mode={labels} />
        ))}
      </Canvas>
      {/* The radar rings get a canvas of their own, over the globe: their
          clock redraws only this small layer each frame. Inside the globe's
          canvas every tick re-ran the sun-lit earth shader on the main
          thread, and the page it sits on answered taps a second late. */}
      {beaconVector && (
        <Canvas style={[styles.canvas, StyleSheet.absoluteFill]} pointerEvents="none">
          <Beacon v={beaconVector} camera={camera} color={colors.tint} animate={beaconAnimate} />
        </Canvas>
      )}
    </Animated.View>
  );

  if (!interactive) return canvas;
  // The app has no gesture root of its own (the old maps handled their own
  // touches natively), so the globe brings one for its detector.
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={gesture}>{canvas}</GestureDetector>
    </GestureHandlerRootView>
  );
}

interface Camera {
  lambda: SharedValue<number>;
  phi: SharedValue<number>;
  scale: SharedValue<number>;
  cx: number;
  cy: number;
  fitR: number;
}

/** A route's plane: the glyph at its anchor, nose along the projected
 * direction of travel (read off a second point 60 km ahead, so it follows
 * the line as the globe turns), hidden on the far side. */
function PlaneGlyph({
  route,
  camera,
  colors,
  clock,
}: {
  route: PackedRoute;
  camera: Camera;
  colors: GlobeColors;
  /** Ticking for an undeparted plane's pulse; null holds it steady. */
  clock: SharedValue<number> | null;
}) {
  const { lambda, phi, scale, cx, cy, fitR } = camera;
  const { anchor, aim } = route.plane;
  const transform = useDerivedValue(() => {
    const rot = rotation({ lambda: lambda.value, phi: phi.value });
    const r = fitR * scale.value;
    const [ax, ay] = toView(anchor[0], anchor[1], anchor[2], rot);
    const [bx, by] = toView(aim[0], aim[1], aim[2], rot);
    const x = cx + r * ax;
    const y = cy - r * ay;
    const angle = Math.atan2(-(by - ay), bx - ax) + Math.PI / 2;
    const s = PLANE_SIZE / 24;
    return [{ translateX: x }, { translateY: y }, { rotate: angle }, { scale: s }, { translateX: -12 }, { translateY: -12 }];
  });
  const opacity = useDerivedValue(() => {
    const rot = rotation({ lambda: lambda.value, phi: phi.value });
    const vz = toView(anchor[0], anchor[1], anchor[2], rot)[2];
    if (vz <= 0.02) return 0;
    if (!clock) return 1;
    return Math.round((0.675 + 0.325 * Math.sin((clock.value / PULSE_PERIOD_MS) * 2 * Math.PI)) * 100) / 100;
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={PLANE_PATH} color={colors.background} style="stroke" strokeWidth={3} strokeJoin="round" />
      <Path path={PLANE_PATH} color={colors.tint} />
    </Group>
  );
}

/** Undeparted planes pulse on a clock — mounted only while there is one
 * to pulse and the screen is live, so the clock is not ticking for nobody. */
function PulsingPlanes({
  routes,
  camera,
  colors,
  animate,
}: {
  routes: PackedRoute[];
  camera: Camera;
  colors: GlobeColors;
  animate: boolean;
}) {
  const clock = useClock();
  return routes.map((route) => (
    <PlaneGlyph key={route.key} route={route} camera={camera} colors={colors} clock={animate ? clock : null} />
  ));
}

/** Radar rings spreading from a point: each ring grows from the airport's
 * dot out to BEACON_REACH while fading, the rings a fraction of a period
 * apart so one is always on its way. Still — a single soft ring — when the
 * screen is not animating or the traveller prefers reduced motion. */
function Beacon({
  v,
  camera,
  color,
  animate,
}: {
  v: [number, number, number];
  camera: Camera;
  color: string;
  animate: boolean;
}) {
  const { lambda, phi, scale, cx, cy, fitR } = camera;
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const moving = animate && !reduceMotion;
  const place = useDerivedValue(() => {
    const rot = rotation({ lambda: lambda.value, phi: phi.value });
    const r = fitR * scale.value;
    const [vx, vy, vz] = toView(v[0], v[1], v[2], rot);
    return { x: cx + r * vx, y: cy - r * vy, visible: vz > 0.02 };
  });
  const x = useDerivedValue(() => place.value.x);
  const y = useDerivedValue(() => place.value.y);
  const haloOpacity = useDerivedValue(() => (place.value.visible ? 0.14 : 0));
  const rings = [];
  for (let i = 0; i < BEACON_RINGS; i += 1) rings.push(i);
  return (
    <>
      <Circle cx={x} cy={y} r={BEACON_HALO} color={color} opacity={haloOpacity} />
      {rings.map((i) => (
        <BeaconRing key={i} index={i} x={x} y={y} place={place} clock={moving ? clock : null} color={color} />
      ))}
    </>
  );
}

function BeaconRing({
  index,
  x,
  y,
  place,
  clock,
  color,
}: {
  index: number;
  x: SharedValue<number>;
  y: SharedValue<number>;
  place: SharedValue<{ x: number; y: number; visible: boolean }>;
  clock: SharedValue<number> | null;
  color: string;
}) {
  // A ring's age, 0–1: staggered by its index, or held mid-life when still.
  const age = useDerivedValue(() => {
    if (!clock) return index === 0 ? 0.45 : 1;
    return ((clock.value + (index * BEACON_PERIOD_MS) / BEACON_RINGS) % BEACON_PERIOD_MS) / BEACON_PERIOD_MS;
  });
  const r = useDerivedValue(() => 4 + age.value * BEACON_REACH);
  // A steady fade: still visible halfway out, gone by the edge.
  const opacity = useDerivedValue(() => {
    if (!place.value.visible) return 0;
    return Math.round((1 - age.value) * 90) / 100;
  });
  return <Circle cx={x} cy={y} r={r} color={color} style="stroke" strokeWidth={BEACON_STROKE} opacity={opacity} />;
}

/** The bright light running along each upcoming route toward its
 * destination: the stretch behind the head, drawn in COMET_STEPS strokes
 * of rising opacity. Passes are staggered so several don't move in lockstep. */
function Comets({ routes, camera, color }: { routes: PackedRoute[]; camera: Camera; color: string }) {
  const { lambda, phi, scale, cx, cy, fitR } = camera;
  const clock = useClock();
  // Plain loops throughout: a closure inside a worklet gets hoisted out of
  // it by the React Compiler, to where the UI runtime cannot call it.
  const steps = useDerivedValue(() => {
    const rot = rotation({ lambda: lambda.value, phi: phi.value });
    const frame = { cx, cy, r: fitR * scale.value };
    const builders = [];
    for (let s = 0; s < COMET_STEPS; s += 1) builders.push(Skia.PathBuilder.Make());
    for (let i = 0; i < routes.length; i += 1) {
      const route = routes[i];
      const count = route.flying.length / 3;
      const period = cometPeriod(count);
      const head = (((clock.value + i * 700) % period) / period) * (1 + COMET_LENGTH);
      const range = cometRange(count, head, COMET_LENGTH);
      if (!range) continue;
      for (let j = range.from; j < range.to; j += 1) {
        const alpha = cometAlpha(range, j + 0.5, COMET_LENGTH);
        const step = Math.min(COMET_STEPS - 1, Math.floor(alpha * COMET_STEPS));
        const [ax, ay, az] = toView(route.flying[j * 3], route.flying[j * 3 + 1], route.flying[j * 3 + 2], rot);
        const [bx, by, bz] = toView(route.flying[j * 3 + 3], route.flying[j * 3 + 4], route.flying[j * 3 + 5], rot);
        if (az <= 0 || bz <= 0) continue;
        builders[step].moveTo(frame.cx + frame.r * ax, frame.cy - frame.r * ay);
        builders[step].lineTo(frame.cx + frame.r * bx, frame.cy - frame.r * by);
      }
    }
    const built = [];
    for (let s = 0; s < COMET_STEPS; s += 1) built.push(builders[s].build());
    return built;
  });
  return Array.from({ length: COMET_STEPS }, (_, step) => (
    <CometStep key={step} steps={steps} step={step} color={color} />
  ));
}

function CometStep({ steps, step, color }: { steps: SharedValue<ReturnType<typeof Skia.Path.Make>[]>; step: number; color: string }) {
  const path = useDerivedValue(() => steps.value[step]);
  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={3.5}
      strokeCap="round"
      color={color}
      opacity={(step + 1) / COMET_STEPS}
    />
  );
}

/** An airport's code beside its dot, once the globe is close enough for
 * the codes not to crowd (or always, on the inset). */
function AirportLabel({
  airport,
  camera,
  font,
  color,
  mode,
}: {
  airport: { iata: string; v: [number, number, number]; r: number };
  camera: Camera;
  font: SkFont | null;
  color: string;
  mode: 'auto' | 'always';
}) {
  const { lambda, phi, scale, cx, cy, fitR } = camera;
  const place = useDerivedValue(() => {
    const rot = rotation({ lambda: lambda.value, phi: phi.value });
    const r = fitR * scale.value;
    const [vx, vy, vz] = toView(airport.v[0], airport.v[1], airport.v[2], rot);
    const shown = vz > 0.05 && (mode === 'always' || scale.value >= LABEL_SCALE);
    return { x: cx + r * vx + airport.r + 5, y: cy - r * vy + 4, opacity: shown ? 1 : 0 };
  });
  const x = useDerivedValue(() => place.value.x);
  const y = useDerivedValue(() => place.value.y);
  const opacity = useDerivedValue(() => place.value.opacity);
  if (!font) return null;
  return (
    <Group opacity={opacity}>
      <Text x={x} y={y} text={airport.iata} font={font} color={color} />
    </Group>
  );
}

function reversed(packed: Float32Array): Float32Array {
  const out = new Float32Array(packed.length);
  const count = packed.length / 3;
  for (let i = 0; i < count; i += 1) {
    const j = count - 1 - i;
    out[i * 3] = packed[j * 3];
    out[i * 3 + 1] = packed[j * 3 + 1];
    out[i * 3 + 2] = packed[j * 3 + 2];
  }
  return out;
}

function labelFont(): SkFont | null {
  try {
    return matchFont({
      fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
      fontSize: 11,
      fontWeight: 'bold',
    });
  } catch {
    return null;
  }
}

function nowMs(): number {
  'worklet';
  return Date.now();
}

function clampTilt(value: number): number {
  'worklet';
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, value));
}

function smoothstep(a: number, b: number, x: number): number {
  'worklet';
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** "#RRGGBB" → [r, g, b] in 0–1, for shader uniforms. */
function rgb(hex: string): [number, number, number] {
  'worklet';
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Sun from the upper left, slightly in front. */
const LIGHT = [-0.45, 0.55, 0.7] as const;
/** No mipmaps: the GPU picks a mip level from screen-space derivatives of
 * the sample position, which jump at the texture's wrap and at every tile
 * edge — and a level picked there is a blurred average that shows up as a
 * dotted seam down the antimeridian. The base mask is never minified (half
 * the globe is 1024 texels across a globe at least that wide in pixels), so
 * plain bilinear sampling is the right filter anyway. */
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None };
/** The shader declares every tile; until the detail set is in, the base
 * mask stands in for each (and is never sampled, `useDetail` being 0). */
const PLACEHOLDERS = { detail: Array.from({ length: 8 }, () => null), borders: [null, null] };

const SHADER = (() => {
  const effect = Skia.RuntimeEffect.Make(`
uniform shader base;
uniform shader d0; uniform shader d1; uniform shader d2; uniform shader d3;
uniform shader d4; uniform shader d5; uniform shader d6; uniform shader d7;
uniform shader b0; uniform shader b1;
uniform float2 centre;
uniform float radius;
uniform float lambda;
uniform float phi;
uniform float2 baseSize;
uniform float tile;
uniform float useDetail;
uniform float borderAlpha;
uniform float3 seaColor;
uniform float3 landColor;
uniform float3 borderColor;
uniform float3 glowColor;
uniform float3 nightColor;
uniform float3 lightDir;
uniform float3 sunDir;
uniform float daylight;

const float PI = 3.14159265;
const float GLOW = 0.11;
// Twilight: full night from the sun 6° below the horizon (civil twilight,
// cos ≈ -0.10) to full day a little past sunrise — a band of about nine
// degrees, soft rather than a hard line.
const float NIGHT_EDGE = -0.10;
const float DAY_EDGE = 0.06;
const float3 DUSK = float3(0.95, 0.55, 0.25);

// Land at (u, v) in 0–1: the 4×2 detail tiles when zoomed in, else the base.
float landAt(float2 uv) {
  if (useDetail < 0.5) return base.eval(uv * baseSize).a;
  float2 q = float2(uv.x * 4.0, uv.y * 2.0);
  float2 t = floor(q);
  float2 p = (q - t) * tile;
  int idx = int(t.x) + int(t.y) * 4;
  if (idx == 0) return d0.eval(p).a;
  if (idx == 1) return d1.eval(p).a;
  if (idx == 2) return d2.eval(p).a;
  if (idx == 3) return d3.eval(p).a;
  if (idx == 4) return d4.eval(p).a;
  if (idx == 5) return d5.eval(p).a;
  if (idx == 6) return d6.eval(p).a;
  return d7.eval(p).a;
}

// Country borders at (u, v): two tiles side by side.
float borderAt(float2 uv) {
  float2 q = float2(uv.x * 2.0, uv.y);
  float2 t = floor(q);
  float2 p = (q - t) * tile;
  if (t.x < 0.5) return b0.eval(p).a;
  return b1.eval(p).a;
}

half4 main(float2 p) {
  float2 d = (p - centre) / radius;
  float r2 = dot(d, d);
  float rr = sqrt(r2);
  if (rr > 1.0) {
    // Atmosphere: a soft halo that fades out over a tenth of the radius.
    float t = clamp((rr - 1.0) / GLOW, 0.0, 1.0);
    float a = (1.0 - t) * (1.0 - t) * 0.55;
    return half4(half3(glowColor) * a, a);
  }
  float vz = sqrt(max(1.0 - r2, 0.0));
  float vx = d.x;
  float vy = -d.y;
  // Undo the view rotation: tilt about X, then spin about Y (see services/globe).
  float cp = cos(phi);
  float sp = sin(phi);
  float cl = cos(lambda);
  float sl = sin(lambda);
  float z1 = -vy * sp + vz * cp;
  float gy = vy * cp + vz * sp;
  float gx = vx * cl + z1 * sl;
  float gz = -vx * sl + z1 * cl;
  float lat = asin(clamp(gy, -1.0, 1.0));
  float lon = atan(gx, gz);
  float2 uv = float2(fract(lon / (2.0 * PI) + 0.5), clamp(0.5 - lat / PI, 0.0, 0.9999));
  float m = landAt(uv);
  float3 col = mix(seaColor, landColor, m);
  if (borderAlpha > 0.0) col = mix(col, borderColor, borderAt(uv) * borderAlpha * m);
  // Studio light: gentle shading from a fixed lamp.
  float diff = max(dot(float3(vx, vy, vz), normalize(lightDir)), 0.0);
  float3 studio = col * (0.68 + 0.32 * diff);
  // Sunlight: the surface normal against the sun. Day keeps the colours,
  // night sinks toward nightColor but stays readable, and the terminator
  // carries a faint warm dusk, stronger over land.
  float sun = dot(float3(gx, gy, gz), sunDir);
  float day = smoothstep(NIGHT_EDGE, DAY_EDGE, sun);
  float3 dayCol = col * (0.80 + 0.20 * max(sun, 0.0));
  float3 nightCol = mix(col, nightColor, 0.62) * 0.55;
  float dusk = sun / 0.09;
  float band = exp(-dusk * dusk);
  float3 sunlit = mix(nightCol, dayCol, day) + DUSK * band * 0.07 * (0.4 + 0.6 * m);
  col = mix(studio, sunlit, daylight);
  // A rim of atmosphere on the limb.
  float rim = pow(1.0 - vz, 3.0);
  col = col + glowColor * rim * 0.5;
  // Anti-aliased edge: the last ~1.5 points fade out.
  float edge = clamp((1.0 - rr) * radius / 1.5, 0.0, 1.0);
  return half4(half3(col) * edge, edge);
}
`);
  if (!effect) throw new Error('Globe shader failed to compile');
  return effect;
})();

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
});
