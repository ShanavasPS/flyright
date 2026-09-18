import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlobeView, globePalette } from '@/components/globe-view';
import { PathCaption } from '@/components/path-caption';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone, getAirport } from '@/services/airports';
import { flightInstant } from '@/services/dates';
import { planeNow } from '@/services/flight-position';
import { buildWorldRoutes, pathCaption, type RoutePath, type RouteSource } from '@/services/geo';
import { useGlobeDaylight } from '@/services/globe-daylight';
import { useGlobeTextures } from '@/services/globe-textures';
import {
  flightProgress,
  travelWindow,
  type FlightFacts,
  type TravelDayState,
  type TravelJourney,
} from '@/services/travel-day';

/** What the inset needs to draw the aircraft where it is during the flight:
 * the trip's travel-day state and cached facts, read against `now`. */
export interface RouteMapLive {
  journey: TravelJourney;
  state: TravelDayState;
  facts: FlightFacts;
  now: number;
}

/** The journey fields the inset needs: the route, plus the landing time for
 * placing the sun once the flight is over. */
export type RouteMapSource = RouteSource & { scheduledArrival?: string };

/** When the inset's sun is placed: at take-off before the flight leaves,
 * at landing once it is over, live (null) in between. */
export function sunMoment(journey: RouteMapSource, now: Date): number | null {
  const departure = flightInstant(journey.scheduledDeparture, airportZone(journey.fromCode));
  const arrival = journey.scheduledArrival
    ? flightInstant(journey.scheduledArrival, airportZone(journey.toCode))
    : NaN;
  const t = now.getTime();
  if (!Number.isNaN(departure) && t < departure) return departure;
  if (!Number.isNaN(arrival) && t > arrival) return arrival;
  // Past the departure with no landing time to compare against: take-off
  // is the one moment this trip can vouch for.
  if (Number.isNaN(arrival) && !Number.isNaN(departure)) return departure;
  return null;
}

/** Inset height: tall enough to read a long-haul arc, short enough that the
 * route hero and the verdict still land above the fold on a small phone. */
export const ROUTE_MAP_HEIGHT = 220;

/** A journey's own route on the globe, framed as a static card in the
 * detail screen (the Airbnb "getting there" pattern): the arc, both
 * airports with their codes, the plane where the World tab would draw it.
 * Not interactive — the whole card is one tap target that hands the trip
 * to the World tab, so the globe never fights the screen's scroll. Any
 * route fits: a sphere has no edge to run off, and the camera simply faces
 * the arc's middle. Renders nothing when either airport is unknown (manual
 * entries with non-IATA codes).
 *
 * `onPress` is optional: a followed person's trip shows the same card, but
 * the World tab draws the viewer's OWN journal and has nothing to open it
 * on — so there the card is a picture, not a button, and does not pretend
 * otherwise by staying pressable.
 *
 * `path` is the flight's real line when the path lookup has one (see
 * services/flight-path) — the track it flew, or the route it filed. Without
 * one the card draws the great circle, and its caption says "Overview". */
export function RouteMap({
  journey,
  path,
  live = null,
  onPress,
}: {
  journey: RouteMapSource;
  path?: RoutePath | null;
  /** The flight in progress, when this trip is the one under way. */
  live?: RouteMapLive | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const textures = useGlobeTextures();
  const palette = globePalette(dark);
  const daylight = useGlobeDaylight();
  // Frozen per mount, same as the World tab — the flown/upcoming cutoff
  // doesn't need to tick.
  const [now] = useState(() => new Date());
  const paths = useMemo(() => (path ? { [journey.id]: path } : undefined), [journey.id, path]);
  const data = useMemo(() => buildWorldRoutes([journey], now, paths), [journey, now, paths]);
  const route = data.routes[0];
  const sunAt = useMemo(() => sunMoment(journey, now), [journey, now]);
  // In the air: the plane where the flight is, from its last reported
  // position or the timetable, instead of parked by the origin.
  const livePlane = useMemo(() => {
    if (!live || !route) return null;
    const progress = flightProgress(live.journey, live.state, live.facts, new Date(live.now));
    if (progress <= 0 || progress >= 1) return null;
    const leg = route.legs.find((candidate) => candidate.id === live.journey.id);
    const forward = leg ? leg.from.iata === route.from.iata : true;
    return { key: route.key, ...planeNow(route, forward, progress, live.facts.position, live.now) };
  }, [live, route]);
  // The radar rings the World tab gives the trip of the day: on the origin
  // through the travel day, on the aircraft once it is in the air.
  const beacon = useMemo(() => {
    if (!live) return null;
    if (livePlane) return livePlane.coordinate;
    const { phase } = travelWindow(live.journey, live.state, new Date(live.now));
    if (phase !== 'reminder' && phase !== 'live') return null;
    const origin = getAirport(live.journey.fromCode);
    return origin ? { latitude: origin.lat, longitude: origin.lon } : null;
  }, [live, livePlane]);
  // The globe is sized to the card as it came out, so it is measured first;
  // the sea-coloured background covers the frame until the width lands.
  const [width, setWidth] = useState(0);

  if (!route) return null;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={[
        route.path
          ? `${pathCaption(route.path)} from ${route.from.iata} to ${route.to.iata}`
          : `Overview route from ${route.from.iata} to ${route.to.iata}; actual flight path may differ`,
        onPress ? 'Open in World' : null,
      ]
        .filter(Boolean)
        .join('. ')}
      onPress={onPress}
      disabled={!onPress}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.sea, borderColor: theme.hairline, opacity: pressed ? 0.92 : 1 },
      ]}>
      {width > 0 && (
        <GlobeView
          // One globe per route: a new journey frames afresh rather than
          // animating from the last one's camera.
          key={`${route.key}-${route.path?.kind ?? 'arc'}`}
          routes={data.routes}
          airports={data.airports}
          width={width}
          height={ROUTE_MAP_HEIGHT}
          textures={textures}
          colors={{ ...palette, tint: theme.tint, background: palette.sea }}
          interactive={false}
          labels="always"
          animate={false}
          fitPad={0.7}
          daylight={daylight}
          sunAt={sunAt}
          livePlane={livePlane}
          beacon={beacon}
          // The picture stays still (no comets, no pulse); only the rings move.
          beaconAnimate
          // This globe is about one trip, so its aircraft stays even once flown.
          pastPlanes
        />
      )}
      <PathCaption path={route.path} />
      {/* The pill is a promise to open somewhere. Without a destination it
          would be a button that lies, so it goes rather than sits there
          inert. */}
      {onPress && (
        <View style={[styles.expand, { backgroundColor: theme.backgroundElement }]}>
          <SymbolView
            name={{
              ios: 'arrow.up.left.and.arrow.down.right',
              android: 'open_in_full',
              web: 'open_in_full',
            }}
            size={13}
            weight="semibold"
            tintColor={theme.tint}
          />
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            World
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: ROUTE_MAP_HEIGHT,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  expand: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    paddingVertical: Spacing.one + Spacing.half,
    paddingLeft: Spacing.two + Spacing.half,
    paddingRight: Spacing.three,
    borderRadius: Spacing.five,
    // Same floating-layer elevation as the World tab's recenter button.
    shadowColor: '#0B1424',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
