import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GlobeView, globePalette } from '@/components/globe-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { planeNow } from '@/services/flight-position';
import { buildWorldRoutes, type RouteSource } from '@/services/geo';
import { useGlobeDaylight } from '@/services/globe-daylight';
import { useGlobeTextures } from '@/services/globe-textures';

/** The trip a person is on, as a follower is told it: which leg and how far
 * along the timetable says it is (services/public-session sessionProgress).
 * Before departure the beacon sits on the origin; in the air the plane is
 * drawn where it is and the beacon rides on it; landed, it marks the
 * destination. */
export interface TravelGlobeLive {
  journeyId: string;
  /** 0 before take-off, 1 after landing, in between by the timetable. */
  progress: number;
  /** The clock the progress was read at, ms since epoch. */
  now: number;
}

/**
 * Somebody's travel on the globe, as a still card: the same Skia earth as
 * the World tab and the trip inset, fitted to every route they share. The
 * web twin (travel-globe.web.tsx) draws the SVG atlas instead. Renders the
 * sea colour until the width is measured; nothing when none of the codes
 * are airports the app knows.
 */
export function TravelGlobe({
  journeys,
  height,
  live = null,
}: {
  journeys: RouteSource[];
  height: number;
  live?: TravelGlobeLive | null;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const textures = useGlobeTextures();
  const palette = globePalette(dark);
  const daylight = useGlobeDaylight();
  // Frozen per mount, like the World tab: the flown/upcoming cutoff has no
  // need to tick; the live plane carries its own clock.
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldRoutes(journeys, now), [journeys, now]);
  const [width, setWidth] = useState(0);

  const liveRoute = useMemo(
    () => (live ? (data.routes.find((route) => route.legs.some((leg) => leg.id === live.journeyId)) ?? null) : null),
    [data, live],
  );
  const livePlane = useMemo(() => {
    if (!live || !liveRoute || live.progress <= 0 || live.progress >= 1) return null;
    const leg = liveRoute.legs.find((candidate) => candidate.id === live.journeyId);
    const forward = leg ? leg.from.iata === liveRoute.from.iata : true;
    return { key: liveRoute.key, ...planeNow(liveRoute, forward, live.progress, null, live.now) };
  }, [live, liveRoute]);
  // Origin while they are still to leave, the aircraft in the air, the
  // destination once landed — for as long as the follower is shown the trip.
  const beacon = useMemo(() => {
    if (!live || !liveRoute) return null;
    if (livePlane) return livePlane.coordinate;
    const leg = liveRoute.legs.find((candidate) => candidate.id === live.journeyId);
    if (!leg) return null;
    const airport = live.progress >= 1 ? leg.to : leg.from;
    return { latitude: airport.lat, longitude: airport.lon };
  }, [live, liveRoute, livePlane]);

  if (!data.routes.length) return null;
  return (
    <View style={[styles.fill, { height, backgroundColor: palette.sea }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <GlobeView
          routes={data.routes}
          airports={data.airports}
          width={width}
          height={height}
          textures={textures}
          colors={{ ...palette, tint: theme.tint, background: palette.sea }}
          interactive={false}
          animate={false}
          fitPad={0.7}
          daylight={daylight}
          livePlane={livePlane}
          beacon={beacon}
          beaconAnimate
          fitFocus={beacon}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
  },
});
