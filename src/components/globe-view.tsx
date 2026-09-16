/* eslint-disable react-hooks/immutability -- Reanimated shared values are
   mutable by contract: the gesture worklets below write them, the derived
   values read them. The compiler lint reads those hooks as effects. */
import {
  Canvas,
  Fill,
  FilterMode,
  ImageShader,
  MipmapMode,
  Path,
  Shader,
  Skia,
  useImage,
  type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';

import type { GeoAirport, GeoRoute, LatLng } from '@/services/geo';
import {
  MAX_TILT,
  RAD,
  fitRadius,
  nearestProjected,
  packVectors,
  projectPolyline,
  rotation,
  toView,
  unprojectPoint,
  wrapLambda,
} from '@/services/globe';

/** The land mask the shader samples: white land on black sea, equirectangular. */
const LAND_TEXTURE = require('../../assets/images/globe-land.png');

/** Loads the land texture. The World screen calls this as soon as it
 * mounts, so by the time the traveller pinches out to the globe the image
 * is already decoded and the globe arrives at once rather than a beat
 * after (in development the asset comes over the wire from Metro). */
export function useGlobeTexture(): SkImage | null {
  return useImage(LAND_TEXTURE);
}
const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

/** How close, in canvas points, a tap must land to a route to select it. */
const ROUTE_TAP_TOLERANCE = 22;
/** Pinching the globe past this multiple of its fitted radius hands the
 * view back to the map — the traveller is zooming in, and the map has the
 * detail. Between the fit and here the globe simply grows. */
const HANDOFF_SCALE = 2.1;
const MIN_SCALE = 0.7;
const MAX_SCALE = 2.6;
/** The globe arrives a touch larger than its fit and settles, as though the
 * map's zoom-out kept going. */
const ENTER_SCALE = 1.35;
const ENTER_MS = 520;

/**
 * The earth, lit and turning, with the traveller's routes drawn on it.
 *
 * A Skia runtime shader draws the sphere: for every pixel inside the disc
 * it finds the point on the globe under it, turns that into a latitude and
 * longitude, and looks up land or sea in an equirectangular mask. Lighting,
 * the limb's atmospheric glow and the anti-aliased edge are all in the same
 * pass, so the whole globe costs one fill regardless of how much land is in
 * view. Routes and airports are paths projected with the same maths on the
 * UI thread, so drags, flicks and pinches never wait for JavaScript.
 *
 * Orientation lives in shared values: `lambda`/`phi` are the coordinate at
 * the centre of the disc, `scale` its size relative to the fitted radius.
 */
export function GlobeView({
  routes,
  airports,
  selectedKey,
  width,
  height,
  strip,
  centre,
  colors,
  land,
  onSelect,
  onZoomIn,
}: {
  routes: GeoRoute[];
  airports: GeoAirport[];
  selectedKey: string | null;
  /** Canvas size — the globe fills the whole map area. */
  width: number;
  height: number;
  /** Overlay heights the globe should keep clear of, like the map's padding. */
  strip: { top: number; bottom: number };
  /** Where the globe faces on arrival — the map's centre when it handed over. */
  centre: LatLng;
  colors: { sea: string; land: string; tint: string; background: string };
  /** The decoded land texture, from `useGlobeTexture`; null while loading. */
  land: SkImage | null;
  onSelect: (key: string | null) => void;
  /** The traveller pinched in past the globe's useful zoom: continue on the
   * map, centred here. */
  onZoomIn: (centre: LatLng) => void;
}) {
  const stripHeight = Math.max(height - strip.top - strip.bottom, 120);
  const cx = width / 2;
  const cy = strip.top + stripHeight / 2;
  const fit = fitRadius(width, stripHeight);

  const lambda = useSharedValue(centre.longitude * RAD);
  const phi = useSharedValue(clampTilt(centre.latitude * RAD));
  const scale = useSharedValue(ENTER_SCALE);
  const opacity = useSharedValue(0);
  const pinchStart = useSharedValue(1);

  // The arrival waits for the texture: a runtime shader with no image to
  // sample paints the whole canvas black on Android, so nothing is shown
  // until the land can be.
  useEffect(() => {
    if (!land) return;
    scale.value = withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 280 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrival animation, once the texture is in
  }, [land]);

  // Route samples as unit vectors, converted once; each frame only rotates.
  const packed = useMemo(
    () =>
      routes.map((route) => ({
        key: route.key,
        upcoming: route.upcomingOnly,
        weight: 2.5 + Math.min(route.count - 1, 4) * 0.5,
        packed: route.segments.map(packVectors),
      })),
    [routes],
  );
  const airportVectors = useMemo(
    () => airports.map((airport) => ({ v: packVectors([{ latitude: airport.lat, longitude: airport.lon }]), r: 2.5 + Math.min(airport.count, 5) * 0.4 })),
    [airports],
  );

  const source = useMemo(() => SHADER, []);

  const uniforms = useDerivedValue(() => ({
    centre: [cx, cy],
    radius: fit * scale.value,
    lambda: lambda.value,
    phi: phi.value,
    texSize: [TEXTURE_WIDTH, TEXTURE_HEIGHT],
    seaColor: rgb(colors.sea),
    landColor: rgb(colors.land),
    glowColor: rgb(colors.tint),
    lightDir: LIGHT,
  }));

  // Three paths: flown routes, upcoming ones (fainter), and the selected one
  // on top. Built together so the projection runs once per frame.
  const paths = useDerivedValue(() => {
    const rot = rotation({ lambda: lambda.value, phi: phi.value });
    const frame = { cx, cy, r: fit * scale.value };
    const flown = Skia.PathBuilder.Make();
    const upcoming = Skia.PathBuilder.Make();
    const selected = Skia.PathBuilder.Make();
    for (const route of packed) {
      const target = route.key === selectedKey ? selected : route.upcoming ? upcoming : flown;
      for (const segment of route.packed) {
        for (const piece of projectPolyline(segment, rot, frame)) {
          target.moveTo(piece[0], piece[1]);
          for (let i = 2; i < piece.length; i += 2) target.lineTo(piece[i], piece[i + 1]);
        }
      }
    }
    const dots = Skia.PathBuilder.Make();
    for (const airport of airportVectors) {
      const [vx, vy, vz] = toView(airport.v[0], airport.v[1], airport.v[2], rot);
      if (vz > 0.02) dots.addCircle(frame.cx + frame.r * vx, frame.cy - frame.r * vy, airport.r);
    }
    return { flown: flown.build(), upcoming: upcoming.build(), selected: selected.build(), dots: dots.build() };
  });
  const flownPath = useDerivedValue(() => paths.value.flown);
  const upcomingPath = useDerivedValue(() => paths.value.upcoming);
  const selectedPath = useDerivedValue(() => paths.value.selected);
  const dotsPath = useDerivedValue(() => paths.value.dots);

  const handOff = (latitude: number, longitude: number) => onZoomIn({ latitude, longitude });
  const tapAt = (x: number, y: number) => {
    const orientation = { lambda: lambda.value, phi: phi.value };
    const frame = { cx, cy, r: fit * scale.value };
    onSelect(nearestProjected(packed, x, y, orientation, frame, ROUTE_TAP_TOLERANCE));
  };

  const pan = Gesture.Pan()
    .minDistance(4)
    .onStart(() => {
      cancelAnimation(lambda);
      cancelAnimation(phi);
    })
    .onChange((e) => {
      const r = fit * scale.value;
      lambda.value = wrapLambda(lambda.value - e.changeX / r);
      phi.value = clampTilt(phi.value + e.changeY / r);
    })
    .onEnd((e) => {
      const r = fit * scale.value;
      lambda.value = withDecay({ velocity: -e.velocityX / r, deceleration: 0.996 });
      phi.value = withDecay({
        velocity: e.velocityY / r,
        deceleration: 0.996,
        clamp: [-MAX_TILT, MAX_TILT],
      });
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      cancelAnimation(scale);
      pinchStart.value = scale.value;
    })
    .onChange((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value >= HANDOFF_SCALE) {
        const here = unprojectPoint(cx, cy, { lambda: lambda.value, phi: phi.value }, { cx, cy, r: fit * scale.value });
        if (here) runOnJS(handOff)(here.latitude, here.longitude);
        return;
      }
      if (scale.value < 1) scale.value = withTiming(1, { duration: 260 });
    });

  const tap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((e) => {
      runOnJS(tapAt)(e.x, e.y);
    });

  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // The app has no gesture root of its own (the maps handle their own
  // touches natively), so the globe brings one for its detector.
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }, fade]}
        accessibilityLabel="Globe of your travels. Drag to turn it, pinch to zoom."
        testID="world-globe">
        <Canvas style={styles.canvas}>
          {land && (
            <Fill>
              <Shader source={source} uniforms={uniforms}>
                <ImageShader
                  image={land}
                  tx="repeat"
                  ty="clamp"
                  sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}
                />
              </Shader>
            </Fill>
          )}
          <Path
            path={upcomingPath}
            style="stroke"
            strokeWidth={2}
            strokeCap="round"
            strokeJoin="round"
            color={colors.tint}
            opacity={0.4}
          />
          <Path
            path={flownPath}
            style="stroke"
            strokeWidth={2.5}
            strokeCap="round"
            strokeJoin="round"
            color={colors.tint}
          />
          <Path
            path={selectedPath}
            style="stroke"
            strokeWidth={9}
            strokeCap="round"
            strokeJoin="round"
            color={colors.tint}
            opacity={0.28}
          />
          <Path
            path={selectedPath}
            style="stroke"
            strokeWidth={3.5}
            strokeCap="round"
            strokeJoin="round"
            color={colors.tint}
          />
          <Path path={dotsPath} color={colors.background} style="stroke" strokeWidth={2} />
          <Path path={dotsPath} color={colors.tint} />
        </Canvas>
      </Animated.View>
    </GestureDetector>
    </GestureHandlerRootView>
  );
}

function clampTilt(value: number): number {
  'worklet';
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, value));
}

/** "#RRGGBB" → [r, g, b] in 0–1, for shader uniforms. */
function rgb(hex: string): [number, number, number] {
  'worklet';
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The globe's own sea and land. The map's pair (a near-white land on a
 * pale sea) is right for a map with labels on it, but shaded on a sphere
 * the two blur together: the globe wants blue oceans and pale continents,
 * the way the earth reads from orbit — deep navy water in the dark scheme. */
export function globePalette(dark: boolean): { sea: string; land: string } {
  return dark ? { sea: '#0B1A38', land: '#33486E' } : { sea: '#B9D0EF', land: '#F7F9FC' };
}

/** Sun from the upper left, slightly in front. */
const LIGHT = [-0.45, 0.55, 0.7] as const;

const SHADER = (() => {
  const effect = Skia.RuntimeEffect.Make(`
uniform shader land;
uniform float2 centre;
uniform float radius;
uniform float lambda;
uniform float phi;
uniform float2 texSize;
uniform float3 seaColor;
uniform float3 landColor;
uniform float3 glowColor;
uniform float3 lightDir;

const float PI = 3.14159265;
const float GLOW = 0.11;

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
  float u = (lon / (2.0 * PI) + 0.5) * texSize.x;
  float v = (0.5 - lat / PI) * texSize.y;
  float m = land.eval(float2(u, v)).r;
  float3 col = mix(seaColor, landColor, m);
  // Gentle lighting plus a rim of atmosphere on the limb.
  float diff = max(dot(float3(vx, vy, vz), normalize(lightDir)), 0.0);
  col *= 0.68 + 0.32 * diff;
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
