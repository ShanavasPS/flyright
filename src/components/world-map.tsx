import { memo } from 'react';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { WORLD, type MapAirport, type MapRoute, type ViewBox } from '@/services/geo';

/** Labels appear once the view is tighter than half the world — at full zoom
 * a label per visited airport is noise, zoomed in it's the payoff. */
const LABEL_MAX_WIDTH = WORLD.width * 0.5;

/** Map surface colors. Dark mode is the brand's night flight: deep-navy sea,
 * lifted-navy land. Light mode inverts to a porcelain sea with white land,
 * like a paper atlas. The World screen paints its root with `sea` so the
 * letterbox around the map (and any pan/zoom overshoot) reads as more ocean,
 * never as the page background. */
export function mapColors(dark: boolean) {
  const theme = Colors[dark ? 'dark' : 'light'];
  return {
    sea: dark ? theme.background : theme.backgroundSelected,
    land: dark ? theme.backgroundSelected : theme.backgroundElement,
  };
}

interface WorldMapProps {
  box: ViewBox;
  /** Rendered width in px — sizes strokes/dots/labels in screen terms so
   * they stay constant as zoom changes the viewBox. */
  pxWidth: number;
  routes: MapRoute[];
  airports: MapAirport[];
}

/** The map itself: land silhouette, great-circle route arcs, airport dots.
 * Purely presentational — pan/zoom is the World screen's business. */
export const WorldMap = memo(function WorldMap({ box, pxWidth, routes, airports }: WorldMapProps) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const theme = Colors[dark ? 'dark' : 'light'];
  const { land } = mapColors(dark);

  const u = box.width / pxWidth; // map units per screen px
  const showLabels = box.width < LABEL_MAX_WIDTH;

  // No sea rect: the Svg stays transparent and the screen's sea-colored
  // root shows through — that covers any letterboxing and gesture overshoot,
  // which a finite rect clipped to the Svg canvas cannot.
  return (
    <Svg width="100%" height="100%" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}>
      <Path d={WORLD.land} fill={land} fillRule="evenodd" />

      {routes.map((route) => {
        const width = (1.6 + Math.min(route.count - 1, 4) * 0.3) * u;
        return route.paths.map((d, i) => (
          <Path
            key={`${route.key}-${i}`}
            d={d}
            fill="none"
            stroke={theme.tint}
            strokeWidth={width}
            strokeLinecap="round"
            strokeOpacity={route.upcomingOnly ? 0.85 : 1}
            strokeDasharray={route.upcomingOnly ? `${4.5 * u},${3.5 * u}` : undefined}
          />
        ));
      })}
      {/* A soft tint halo per airport anchors the arcs to their endpoints. */}
      {airports.map((airport) => (
        <Circle
          key={`halo-${airport.iata}`}
          cx={airport.x}
          cy={airport.y}
          r={(4 + Math.min(airport.count, 6) * 0.4) * u}
          fill={theme.tint}
          opacity={0.22}
        />
      ))}
      {airports.map((airport) => (
        <Circle
          key={`dot-${airport.iata}`}
          cx={airport.x}
          cy={airport.y}
          r={1.9 * u}
          fill={dark ? '#FFFFFF' : theme.backgroundElement}
          stroke={theme.tint}
          strokeWidth={1.1 * u}
        />
      ))}
      {showLabels &&
        airports.map((airport) => (
          <SvgText
            key={`label-${airport.iata}`}
            x={airport.x + 5 * u}
            y={airport.y - 4.5 * u}
            fontSize={9.5 * u}
            fontWeight="600"
            fill={theme.textSecondary}>
            {airport.iata}
          </SvgText>
        ))}
    </Svg>
  );
});
