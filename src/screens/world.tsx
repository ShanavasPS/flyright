import { useAuth } from '@clerk/expo';
import { Link, useIsFocused } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  Polyline,
  type Region,
} from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLabel, formatDayLabelWithYear } from '@/services/dates';
import {
  COMET_LENGTH,
  buildWorldRoutes,
  cometSegments,
  haversineKm,
  nearestRoute,
  routePlane,
  type GeoRoute,
  type LatLng,
  type RoutePlane,
} from '@/services/geo';
import { useJourneys } from '@/services/journeys';
import { travelRecap } from '@/services/timeline';

/** Latitude cap for fitting. Polar great-circle apexes reach ~85°, which in
 * Mercator is nearly the top of the world — fitting them forces a zoom that
 * shows almost no longitude. Capping here lets a polar arc leave the top of
 * the screen instead, which reads fine. */
const MAX_LAT = 75;
/** Longitude padding factor so endpoints sit clear of the screen edges. */
const LON_PAD = 1.3;
const toMercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const fromMercator = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

/** Region containing every coordinate, wraparound-aware. The camera is set
 * from this instead of `fitToCoordinates` because antimeridian-split routes
 * defeat a naive bounding box (their ±180° endpoints make it span the whole
 * world and the SDKs then pick an arbitrary window). The longitude window is
 * the complement of the largest empty gap between route samples — the
 * standard fix for bounds on a circle.
 *
 * Both SDKs have a zoom-out floor (MapKit's camera-altitude ceiling shows
 * ~89° of longitude on an iPhone; Google's min zoom is similar), so a
 * far-flung set of routes can't all fit. Rather than let the SDK pick an
 * arbitrary window, anything wider than `maxLonSpan` gets the window holding
 * the most route samples — the user's densest region — and the recenter
 * button/panning covers the rest. Latitude is padded in Mercator space and
 * clamped inside MAX_LAT. */
function regionFor(coords: LatLng[], airportLons: number[], maxLonSpan: number): Region {
  if (!coords.length) return { latitude: 30, longitude: 0, latitudeDelta: 100, longitudeDelta: 120 };
  const lons = coords.map((c) => c.longitude).sort((a, b) => a - b);
  let gapStart = lons[lons.length - 1];
  let gapSize = lons[0] + 360 - gapStart;
  for (let i = 1; i < lons.length; i += 1) {
    const gap = lons[i] - lons[i - 1];
    if (gap > gapSize) {
      gapSize = gap;
      gapStart = lons[i - 1];
    }
  }
  let lonSpan = 360 - gapSize;
  let lonStart = gapStart + gapSize;
  let lonDelta = Math.min(359, Math.max(6, lonSpan * LON_PAD));
  let visible = coords;

  if (lonDelta > maxLonSpan) {
    // At the floor the SDK shows exactly maxLonSpan, so use all of it: slide
    // a window that wide around the circle and keep the start holding the
    // most airports (arc samples would let one long haul outvote a cluster),
    // then centre the airports it caught within it.
    const width = maxLonSpan;
    const anchors = (airportLons.length ? [...airportLons] : lons).sort((a, b) => a - b);
    const doubled = [...anchors, ...anchors.map((l) => l + 360)];
    let best = 0;
    let bestStart = anchors[0];
    let bestEnd = anchors[0];
    let j = 0;
    for (let i = 0; i < anchors.length; i += 1) {
      while (j < doubled.length && doubled[j] <= anchors[i] + width) j += 1;
      if (j - i > best) {
        best = j - i;
        bestStart = anchors[i];
        bestEnd = doubled[j - 1];
      }
    }
    lonStart = bestStart - (width - (bestEnd - bestStart)) / 2;
    lonSpan = width;
    lonDelta = width;
    visible = coords.filter((c) => (((c.longitude - lonStart) % 360) + 360) % 360 <= width);
  }

  let yMin = toMercator(MAX_LAT);
  let yMax = toMercator(-MAX_LAT);
  for (const c of visible) {
    const y = toMercator(Math.min(MAX_LAT, Math.max(-MAX_LAT, c.latitude)));
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  const yPad = Math.max(0.05, (yMax - yMin) * 0.12);
  const yTop = Math.min(toMercator(MAX_LAT), yMax + yPad);
  const yBottom = Math.max(toMercator(-MAX_LAT), yMin - yPad);

  // Both SDKs turn a region back into bounds as latitude ± latitudeDelta/2 in
  // plain degrees, so the centre is the degree midpoint, not the Mercator one.
  const latTop = fromMercator(yTop);
  const latBottom = fromMercator(yBottom);
  const rawCenter = lonStart + lonSpan / 2;
  return {
    latitude: (latTop + latBottom) / 2,
    longitude: ((rawCenter % 360) + 540) % 360 - 180,
    latitudeDelta: Math.max(4, latTop - latBottom),
    longitudeDelta: lonDelta,
  };
}

let zoomFloorLon = 359;

/** Overlay heights below the safe areas, for `mapPadding`. Header: eyebrow
 * (16) + gap (2) + title (41) + vertical padding (8 + 16). Card: numerals
 * (28) + label (20) + vertical padding (32). */
const HEADER_HEIGHT = 83;
const STATS_CARD_HEIGHT = 80;

/** Upcoming routes draw faint and let the travelling comet carry the colour;
 * two hex digits of alpha appended to the theme tint. */
const UPCOMING_ALPHA = '59';
/** Animation clock tick — comets and the pulse both update at this rate. Each
 * tick re-sends a handful of short polylines over the bridge, so 30 fps is
 * plenty and far cheaper than 60. */
const TICK_MS = 33;
/** One comet pass, origin to clear of the destination, in ms. Longer arcs get
 * a little longer so the light doesn't race across a long haul. */
const cometPeriod = (samples: number) => Math.min(5200, 2400 + samples * 12);
const PULSE_PERIOD_MS = 1400;
/** How close, in screen points, a tap must land to a route to select it. */
const ROUTE_TAP_TOLERANCE = 22;
/** Offset of the probe point used to measure the map's local scale. */
const SCALE_PROBE_PT = 50;

/** Google's night-mode base palette, plus POI/transit clutter removal (the
 * clutter rules also apply in light mode — this is a travel map, not a city
 * guide). Apple Maps ignores this and follows `userInterfaceStyle` instead. */
const CLUTTER_OFF = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
const GOOGLE_NIGHT = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
  ...CLUTTER_OFF,
];

/** Your travels on a real map — Apple Maps on iOS, Google Maps on Android —
 * with every route drawn as a great-circle arc between its origin and
 * destination. Flown routes are solid with a plane mid-arc showing the way
 * the latest leg flew; upcoming ones are faint with a light running toward
 * the destination and a pulsing plane waiting by the origin. Tapping a plane
 * docks the route's journeys where the stats card sits. Pan/zoom is the map
 * SDK's own. */
export function World() {
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);
  const dark = useColorScheme() === 'dark';
  const theme = useTheme();

  // "Flown vs upcoming" cutoff, frozen per mount — a live clock would redraw
  // the map mid-session for no visible gain.
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldRoutes(journeys ?? [], now), [journeys, now]);
  const recap = useMemo(() => travelRecap(journeys ?? []), [journeys]);
  const airportLons = useMemo(() => data.airports.map((a) => a.lon), [data]);

  const mapRef = useRef<MapView>(null);
  // True once the user pans/zooms away from the fitted view; new flights
  // stop re-fitting the camera the moment the user takes the wheel. Detected
  // by comparing regions against the last fit, not `details.isGesture` —
  // Apple Maps doesn't report that flag.
  const [moved, setMoved] = useState(false);
  const fitting = useRef(false);
  const fitted = useRef<Region | null>(null);

  // The SDK's zoom-out floor in degrees of longitude — see regionFor. Learned
  // from the first fit the SDK narrows (it grants exactly the floor), kept
  // for the session so later mounts open on the right window straight away.
  const [maxLonSpan, setMaxLonSpan] = useState(zoomFloorLon);
  const requested = useRef<Region | null>(null);

  const fit = (animated: boolean) => {
    if (!data.fitCoords.length) return;
    fitting.current = true;
    requested.current = regionFor(data.fitCoords, airportLons, maxLonSpan);
    mapRef.current?.animateToRegion(requested.current, animated ? 600 : 0);
  };

  const [ready, setReady] = useState(false);
  const mapSize = useRef({ width: 0, height: 0 });

  /** Select whichever route the tap landed on, or clear. The map's degrees-
   * per-point scale is measured live from two probe points at the view centre
   * (`coordinateForPoint`, so mapPadding can't skew it), with latitude
   * corrected to the tap's Mercator stretch. */
  const selectAt = async (tap: LatLng) => {
    const map = mapRef.current;
    const { width, height } = mapSize.current;
    if (!map || !width) return setSelectedKey(null);
    try {
      const centre = { x: width / 2, y: height / 2 };
      const [c0, c1] = await Promise.all([
        map.coordinateForPoint(centre),
        map.coordinateForPoint({ x: centre.x + SCALE_PROBE_PT, y: centre.y + SCALE_PROBE_PT }),
      ]);
      const toRad = Math.PI / 180;
      const stretch = Math.cos(tap.latitude * toRad) / Math.cos(c0.latitude * toRad);
      const scale = {
        lon: Math.abs(c1.longitude - c0.longitude) / SCALE_PROBE_PT,
        lat: (Math.abs(c1.latitude - c0.latitude) / SCALE_PROBE_PT) * stretch,
      };
      setSelectedKey(nearestRoute(data.routes, tap, scale, ROUTE_TAP_TOLERANCE));
    } catch {
      setSelectedKey(null);
    }
  };

  // The header fade and the stats card cover the map's top and bottom. Their
  // heights are derived, not measured: a padding that changes after the first
  // fit makes Google Maps re-seat the camera and shift the fitted view, and
  // the shift then reads as a user pan. Fits centre in the strip between them
  // and the SDK's legal label sits above the card.
  const insets = useSafeAreaInsets();
  // iOS: the map runs under the tab bar (iOS 26 glass) or ends at it (iOS 18),
  // and insets.bottom reflects whichever — use it. Android: the native tab
  // bar already sits above the system bar and the screen ends at the tab
  // bar, yet insets.bottom still reports the system bar; adding it would
  // float the card a nav-bar height too high.
  const footerInset = (Platform.OS === 'ios' ? insets.bottom : 0) + Spacing.three;
  const mapPadding = {
    top: insets.top + HEADER_HEIGHT,
    bottom: footerInset + STATS_CARD_HEIGHT,
    left: 0,
    right: 0,
  };
  useEffect(() => {
    if (ready && !moved) fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit on new data or view size only
  }, [ready, data, maxLonSpan]);

  const empty = journeys != null && data.routes.length === 0;

  // One plane per route; direction comes from the journeys (see routePlane).
  const planes = useMemo(
    () => data.routes.map((route) => ({ route, plane: routePlane(route) })),
    [data],
  );
  const upcoming = useMemo(() => planes.filter(({ plane }) => plane.upcoming), [planes]);

  // Tapping a plane docks a detail card in the stats card's slot; tapping the
  // map or its close button brings the stats back.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = planes.find(({ route }) => route.key === selectedKey) ?? null;

  // Animation clock for the comets and the pulsing undeparted planes. Runs
  // only while there is something to animate and the tab is on screen in a
  // foregrounded app — background polyline updates would burn battery for
  // nobody. Comets are derived from the clock, never accumulated, so pauses
  // resume seamlessly.
  const focused = useIsFocused();
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!focused || !upcoming.length) return;
    let active = AppState.currentState === 'active';
    let last = 0;
    let frame = 0;
    const tick = (t: number) => {
      if (active && t - last >= TICK_MS) {
        last = t;
        setClock(t);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const appState = AppState.addEventListener('change', (state) => {
      active = state === 'active';
    });
    return () => {
      cancelAnimationFrame(frame);
      appState.remove();
    };
  }, [focused, upcoming.length]);

  const comets = useMemo(
    () =>
      upcoming.map(({ route, plane }, i) => {
        const samples = route.segments.reduce((n, segment) => n + segment.length, 0);
        const period = cometPeriod(samples);
        // Stagger passes so several upcoming routes don't move in lockstep.
        const head = (((clock + i * 700) % period) / period) * (1 + COMET_LENGTH);
        return { key: route.key, segments: cometSegments(route.segments, plane.forward, head) };
      }),
    [upcoming, clock],
  );
  // Soft pulse between 35% and 100%, driven by the same clock so it pauses
  // with it. Marker opacity is a native prop — no view re-snapshot per frame.
  const pulse =
    Math.round((0.675 + 0.325 * Math.sin((clock / PULSE_PERIOD_MS) * 2 * Math.PI)) * 100) / 100;

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={regionFor(data.fitCoords, airportLons, maxLonSpan)}
        onMapReady={() => setReady(true)}
        // Gated on ready: the Android bridge calls GoogleMap.setPadding on a
        // null map if the prop changes between layout and onMapReady.
        mapPadding={ready ? mapPadding : undefined}
        onRegionChangeComplete={(region, details) => {
          if (fitting.current) {
            // The settle of our own animateToRegion — record what the SDK
            // actually granted (it clamps extreme spans) as the baseline.
            fitting.current = false;
            fitted.current = region;
            const asked = requested.current?.longitudeDelta ?? 0;
            if (region.longitudeDelta < asked * 0.9 && region.longitudeDelta < maxLonSpan) {
              zoomFloorLon = region.longitudeDelta;
              setMaxLonSpan(region.longitudeDelta);
            }
            return;
          }
          if (details?.isGesture) {
            setMoved(true);
            return;
          }
          const base = fitted.current;
          if (!base) return;
          const tolerance = Math.max(base.latitudeDelta, base.longitudeDelta) * 0.02;
          if (
            Math.abs(region.latitude - base.latitude) > tolerance ||
            Math.abs(region.longitude - base.longitude) > tolerance ||
            Math.abs(region.latitudeDelta - base.latitudeDelta) > tolerance ||
            Math.abs(region.longitudeDelta - base.longitudeDelta) > tolerance
          ) {
            setMoved(true);
          }
        }}
        onLayout={(e) => {
          mapSize.current = e.nativeEvent.layout;
        }}
        onPress={(e) => {
          // Android reports marker taps here too, tagged — leave those to the marker.
          if (e.nativeEvent.action !== 'marker-press') void selectAt(e.nativeEvent.coordinate);
        }}
        customMapStyle={dark ? GOOGLE_NIGHT : CLUTTER_OFF}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        showsPointsOfInterests={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}>
        {data.routes.map((route) =>
          route.segments.map((coordinates, i) => (
            <Polyline
              key={`${route.key}-${i}`}
              coordinates={coordinates}
              strokeColor={route.upcomingOnly ? `${theme.tint}${UPCOMING_ALPHA}` : theme.tint}
              strokeWidth={
                2.5 + Math.min(route.count - 1, 4) * 0.5 + (route.key === selectedKey ? 1.5 : 0)
              }
              lineCap="round"
            />
          )),
        )}
        {comets.map(({ key, segments }) =>
          segments.map((points, i) => (
            <Polyline
              key={`comet-${key}-${i}`}
              coordinates={points}
              strokeColor={theme.tint}
              strokeColors={points.map((p) => `${theme.tint}${alphaHex(p.alpha ?? 1)}`)}
              strokeWidth={3.5}
              lineCap="round"
            />
          )),
        )}
        {planes.map(({ route, plane }) => (
          <PlaneMarker
            key={route.key}
            plane={plane}
            opacity={plane.upcoming ? pulse : 1}
            onPress={() => setSelectedKey(route.key)}
          />
        ))}
        {data.airports.map((airport) => (
          <Marker
            key={airport.iata}
            coordinate={{ latitude: airport.lat, longitude: airport.lon }}
            title={airport.iata}
            description={airport.city}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}>
            <View style={[styles.dot, { borderColor: theme.tint }]} />
          </Marker>
        ))}
      </MapView>

      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <View
          pointerEvents="none"
          style={[
            styles.fade,
            {
              experimental_backgroundImage: `linear-gradient(180deg, ${theme.background} 0%, ${theme.background}D9 45%, ${theme.background}00 100%)`,
            },
          ]}
        />
        <View style={styles.header} pointerEvents="box-none">
          <View style={styles.titleBlock} pointerEvents="none">
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
              Everywhere you&apos;ve been
            </ThemedText>
            <ThemedText type="title" themeColor="heading">
              World
            </ThemedText>
          </View>
          {moved && (
            <RecenterButton
              onPress={() => {
                setMoved(false);
                fit(true);
              }}
            />
          )}
        </View>
      </SafeAreaView>

      <View
        style={[styles.footer, { paddingBottom: footerInset }]}
        pointerEvents="box-none">
        {empty ? (
          <EmptyCard />
        ) : selected ? (
          <RouteCard
            route={selected.route}
            plane={selected.plane}
            onClose={() => setSelectedKey(null)}
          />
        ) : recap.trips > 0 ? (
          <Card style={styles.stats}>
            <Stat value={recap.trips} label={recap.trips === 1 ? 'trip' : 'trips'} />
            <Stat value={recap.airports} label={recap.airports === 1 ? 'airport' : 'airports'} />
            <Stat value={recap.countries} label={recap.countries === 1 ? 'country' : 'countries'} />
            <Stat value={recap.totalKm} label="km" />
          </Card>
        ) : null}
      </View>
    </View>
  );
}

/** 0–1 → two hex digits, for appending alpha to a #RRGGBB colour. */
function alphaHex(alpha: number): string {
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

/** The plane on a route, nose along the direction of travel, in a
 * transparent 40pt frame that serves as the tap target.
 *
 * Android gets a ready bitmap plus the marker's native `rotation`: Google
 * Maps snapshots a custom marker view once, before react-native-svg has
 * drawn, which left a blank or clipped icon. Apple Maps ignores `rotation`,
 * so iOS keeps the live SVG and rotates the view itself; the heading is
 * baked into the key so a changed heading re-snapshots. */
function PlaneMarker({
  plane,
  opacity,
  onPress,
}: {
  plane: RoutePlane;
  opacity: number;
  onPress: () => void;
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
      <View style={styles.planeFrame}>
        <Svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          style={{ transform: [{ rotate: `${heading}deg` }] }}>
          {/* White halo so the glyph separates from the line and both map schemes. */}
          <Path d={PLANE_PATH} stroke="#FFFFFF" strokeWidth={3} strokeLinejoin="round" fill="none" />
          <Path d={PLANE_PATH} fill={theme.tint} />
        </Svg>
      </View>
    </Marker>
  );
}

/** Detail card for a tapped plane, docked where the stats card sits: the
 * pair, its distance, and every journey on it as a row into the journey. */
function RouteCard({
  route,
  plane,
  onClose,
}: {
  route: GeoRoute;
  plane: RoutePlane;
  onClose: () => void;
}) {
  const theme = useTheme();
  // Read the pair in the direction the plane flies.
  const [from, to] = plane.forward ? [route.from, route.to] : [route.to, route.from];
  const km = haversineKm(from.lat, from.lon, to.lat, to.lon);
  // Upcoming first (soonest at the top), then flown, most recent first.
  const legs = [...route.legs].sort((a, b) => {
    if (a.flown !== b.flown) return a.flown ? 1 : -1;
    return a.flown
      ? b.scheduledDeparture.localeCompare(a.scheduledDeparture)
      : a.scheduledDeparture.localeCompare(b.scheduledDeparture);
  });
  return (
    <Card style={styles.routeCard}>
      <View style={styles.routeHeader}>
        <View style={styles.routeTitle}>
          <ThemedText themeColor="heading" style={styles.routeCodes}>
            {from.iata} → {to.iata}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {km.toLocaleString()} km · {from.city} → {to.city}
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: theme.field }]}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={14}
            weight="bold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>
      <ScrollView
        style={styles.legs}
        contentContainerStyle={styles.legsContent}
        bounces={false}
        showsVerticalScrollIndicator={legs.length > 3}>
        {legs.map((leg) => (
          <Link key={leg.id} href={{ pathname: '/journey/[id]', params: { id: leg.id } }} asChild>
            {/* Link's asChild Slot rejects array styles — keep this one flat. */}
            <Pressable
              accessibilityRole="button"
              style={StyleSheet.flatten([styles.leg, { borderTopColor: theme.hairline }])}>
              <View style={styles.legCopy}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {leg.from.iata} → {leg.to.iata} · {leg.number}
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor={leg.flown ? 'textSecondary' : 'tint'}
                  numberOfLines={1}>
                  {leg.flown
                    ? formatDayLabelWithYear(leg.scheduledDeparture)
                    : `Upcoming · ${formatDayLabel(leg.scheduledDeparture)}`}
                  {leg.carrier ? ` · ${leg.carrier}` : ''}
                </ThemedText>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={14}
                weight="semibold"
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText themeColor="heading" style={styles.statValue}>
        {value.toLocaleString()}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/** Same footprint as the stats card (see STATS_CARD_HEIGHT), so one
 * `mapPadding` serves both states. */
function EmptyCard() {
  const theme = useTheme();
  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyCopy}>
        <ThemedText themeColor="heading" style={styles.emptyTitle}>
          Your world map awaits
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          Every route you log, drawn here.
        </ThemedText>
      </View>
      <Link href="/add-flight" asChild>
        {/* Link's asChild Slot rejects array styles — keep this one flat. */}
        <Pressable
          accessibilityRole="button"
          style={StyleSheet.flatten([styles.emptyButton, { backgroundColor: theme.tint }])}>
          <ThemedText type="smallBold" style={styles.emptyButtonLabel}>
            Add flight
          </ThemedText>
        </Pressable>
      </Link>
    </Card>
  );
}

/** Floating "fit everything back on screen" control, shown once the user has
 * panned or zoomed away from the fitted view. */
function RecenterButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Recenter the map on your travels"
      onPress={onPress}
      style={[styles.recenter, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView
        name={{
          ios: 'arrow.down.right.and.arrow.up.left',
          android: 'zoom_in_map',
          web: 'zoom_in_map',
        }}
        size={18}
        weight="semibold"
        tintColor={theme.tint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  map: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
    // Marker views render on the map surface, not our theme background — a
    // constant white core reads correctly on both map color schemes.
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Runs past the header so the fade tails off over open map, not text.
    bottom: -Spacing.six,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.half,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  recenter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // Match the Card elevation so it reads as the same floating layer.
    shadowColor: '#0B1424',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  planeFrame: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCard: {
    alignSelf: 'stretch',
    maxWidth: 480,
    gap: 0,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  routeTitle: {
    flex: 1,
    gap: Spacing.half,
  },
  routeCodes: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 700,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legs: {
    // Three rows before it scrolls, so a busy pair never swallows the map.
    maxHeight: 3 * 52,
  },
  legsContent: {
    flexGrow: 0,
  },
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  legCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  stats: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    maxWidth: 480,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    maxWidth: 480,
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  emptyCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  emptyTitle: {
    fontWeight: 700,
  },
  emptyButton: {
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  emptyButtonLabel: {
    color: '#FFFFFF',
  },
});
