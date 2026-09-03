import { Platform, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { G, Path } from 'react-native-svg';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { LatLng, RoutePlane } from '@/services/geo';

/** 0–1 → two hex digits, for appending alpha to a #RRGGBB colour. */
export function alphaHex(alpha: number): string {
  return Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
}

/** Material "flight" glyph, nose up, in a 24×24 box. */
const PLANE_PATH =
  'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

/** Same glyph as a bitmap, for Android — see scripts/generate-plane-marker.mjs. */
const PLANE_IMAGE = {
  light: require('../../assets/images/plane-marker-light.png'),
  dark: require('../../assets/images/plane-marker-dark.png'),
};

/** Marker footprint: the glyph plus a transparent margin that serves as the
 * tap target. */
const PLANE_FRAME = 40;
/** Glyph size inside the frame, in points. */
const PLANE_SIZE = 22;

/** The plane on a route, nose along the direction of travel, in a
 * transparent 40pt frame that serves as the tap target.
 *
 * Android gets a ready bitmap plus the marker's native `rotation`: Google
 * Maps snapshots a custom marker view once, before react-native-svg has
 * drawn, which left a blank or clipped icon. Apple Maps ignores `rotation`,
 * so iOS keeps the live SVG and rotates the view itself; the heading is
 * baked into the key so a changed heading re-snapshots. */
export function PlaneMarker({
  plane,
  opacity = 1,
  onPress,
}: {
  plane: RoutePlane;
  opacity?: number;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const heading = Math.round(plane.heading);
  if (Platform.OS === 'android') {
    return (
      <Marker
        coordinate={plane.coordinate}
        image={dark ? PLANE_IMAGE.dark : PLANE_IMAGE.light}
        rotation={heading}
        flat
        anchor={{ x: 0.5, y: 0.5 }}
        opacity={opacity}
        onPress={onPress}
        tracksViewChanges={false}
        zIndex={2}
      />
    );
  }
  return (
    <Marker
      key={`${plane.leg.id}-${heading}`}
      coordinate={plane.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      opacity={opacity}
      onPress={onPress}
      tracksViewChanges={false}
      zIndex={2}>
      {/* One Svg is the whole marker view, with the glyph centred and rotated
          INSIDE it. A smaller Svg rotated by a view `transform` inside a
          wrapper View drew the plane up to 20pt off its coordinate on iOS
          (worst on a map that never moves, like the detail's inset). */}
      <Svg width={PLANE_FRAME} height={PLANE_FRAME} viewBox={`0 0 ${PLANE_FRAME} ${PLANE_FRAME}`}>
        <G
          transform={`translate(${PLANE_FRAME / 2} ${PLANE_FRAME / 2}) rotate(${heading}) scale(${PLANE_SIZE / 24}) translate(-12 -12)`}>
          {/* White halo so the glyph separates from the line and both map schemes. */}
          <Path d={PLANE_PATH} stroke="#FFFFFF" strokeWidth={3} strokeLinejoin="round" fill="none" />
          <Path d={PLANE_PATH} fill={theme.tint} />
        </G>
      </Svg>
    </Marker>
  );
}

/** A visited airport: white core, tint ring. Marker views render on the map
 * surface, not our theme background — a constant white core reads correctly
 * on both map color schemes. */
export function AirportMarker({
  iata,
  city,
  coordinate,
}: {
  iata: string;
  city?: string;
  coordinate: LatLng;
}) {
  const theme = useTheme();
  return (
    <Marker
      coordinate={coordinate}
      title={iata}
      description={city}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}>
      <View style={[styles.dot, { borderColor: theme.tint }]} />
    </Marker>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
  },
});
