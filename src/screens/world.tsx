import { useAuth } from '@clerk/expo';
import { Link, useIsFocused } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT, PROVIDER_GOOGLE, Polyline, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { airlineCode } from '@/components/airline-logo';
import { AirportMarker, PlaneMarker, alphaHex } from '@/components/map-layers';
import { ThemedText } from '@/components/themed-text';
import { mapColors } from '@/components/world-map';
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
import {
  CLUTTER_OFF,
  GOOGLE_NIGHT,
  getZoomFloorLon,
  learnZoomFloor,
  regionFor,
} from '@/services/map-region';
import { travelRecap } from '@/services/timeline';
import { focusWorldOn, useWorldFocus } from '@/services/world-focus';

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
/** How long after requesting a fit its settle events are still "ours". iOS
 * can report the same animation twice (once for the camera, once after a
 * layout pass); a flag cleared on the first would read the second as a pan. */
const FIT_SETTLE_MS = 1200;

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
  const { sea } = mapColors(dark);
  const focused = useIsFocused();

  // A journey detail can hand the tab one trip to open on; the map then
  // draws that trip alone until "All travels" or leaving the tab clears it.
  // An id that isn't in the journal (a stale hand-off, the demo) is ignored.
  const focusId = useWorldFocus();
  const focusedRow = useMemo(
    () => (focusId ? journeys?.find((row) => row.id === focusId) : undefined),
    [journeys, focusId],
  );
  const rows = useMemo(
    () => (focusedRow ? [focusedRow] : (journeys ?? [])),
    [focusedRow, journeys],
  );
  useEffect(() => {
    if (!focused) focusWorldOn(null);
  }, [focused]);

  // "Flown vs upcoming" cutoff, frozen per mount — a live clock would redraw
  // the map mid-session for no visible gain.
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldRoutes(rows, now), [rows, now]);
  const recap = useMemo(() => travelRecap(rows), [rows]);
  const airportLons = useMemo(() => data.airports.map((a) => a.lon), [data]);

  const mapRef = useRef<MapView>(null);
  // True once the user pans/zooms away from the fitted view; new flights
  // stop re-fitting the camera the moment the user takes the wheel. Detected
  // by comparing regions against the last fit, not `details.isGesture` —
  // Apple Maps doesn't report that flag.
  const [moved, setMoved] = useState(false);
  // Timestamp of the latest fit request; settles within FIT_SETTLE_MS are its own.
  const fitStarted = useRef(0);
  const fitted = useRef<Region | null>(null);

  // The SDK's zoom-out floor in degrees of longitude — see regionFor and
  // map-region's seed. Refined from whatever the SDK grants for the initial
  // region and for fits, kept for the session.
  const [maxLonSpan, setMaxLonSpan] = useState(getZoomFloorLon);
  const initial = useMemo(
    () => regionFor(data.fitCoords, airportLons, maxLonSpan),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time camera only
    [],
  );
  const requested = useRef<Region>(initial);

  const fit = useCallback(
    (animated: boolean) => {
      if (!data.fitCoords.length) return;
      fitStarted.current = Date.now();
      requested.current = regionFor(data.fitCoords, airportLons, maxLonSpan);
      mapRef.current?.animateToRegion(requested.current, animated ? 600 : 0);
    },
    [data, airportLons, maxLonSpan],
  );

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

  // Tapping a plane docks a detail card in the stats card's slot; tapping the
  // map or its close button brings the stats back.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // A hand-off (or its clearing) is a new subject: the camera refits even if
  // the user had panned, and the trip's route card docks straight away.
  // Reset during render (not in an effect) so the fit effect below already
  // sees `moved` false on the render that carries the new data.
  const [seenFocus, setSeenFocus] = useState(focusedRow?.id);
  if (seenFocus !== focusedRow?.id) {
    setSeenFocus(focusedRow?.id);
    setMoved(false);
    setSelectedKey(focusedRow ? (data.routes[0]?.key ?? null) : null);
  }

  const empty = journeys != null && data.routes.length === 0;

  // One plane per route; direction comes from the journeys (see routePlane).
  const planes = useMemo(
    () => data.routes.map((route) => ({ route, plane: routePlane(route) })),
    [data],
  );
  const upcoming = useMemo(() => planes.filter(({ plane }) => plane.upcoming), [planes]);

  const selected = planes.find(({ route }) => route.key === selectedKey) ?? null;

  // Animation clock for the comets and the pulsing undeparted planes. Runs
  // only while there is something to animate and the tab is on screen in a
  // foregrounded app — background polyline updates would burn battery for
  // nobody. Comets are derived from the clock, never accumulated, so pauses
  // resume seamlessly.
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
        initialRegion={initial}
        // Sea-coloured placeholder while the first tiles load, instead of the
        // SDK's grey grid; the indicator is painted the same so nothing spins.
        loadingEnabled
        loadingBackgroundColor={sea}
        loadingIndicatorColor={sea}
        onMapReady={() => setReady(true)}
        // Gated on ready: the Android bridge calls GoogleMap.setPadding on a
        // null map if the prop changes between layout and onMapReady.
        mapPadding={ready ? mapPadding : undefined}
        onRegionChangeComplete={(region, details) => {
          if (details?.isGesture) {
            setMoved(true);
            return;
          }
          // The settle of the initial region or of our own animateToRegion —
          // record what the SDK actually granted (it clamps extreme spans) as
          // the baseline, and learn its floor from the clamp.
          if (!fitted.current || Date.now() - fitStarted.current < FIT_SETTLE_MS) {
            fitted.current = region;
            const floor = learnZoomFloor(requested.current.longitudeDelta, region.longitudeDelta);
            if (floor != null) setMaxLonSpan(floor);
            return;
          }
          const base = fitted.current;
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
          <AirportMarker
            key={airport.iata}
            iata={airport.iata}
            city={airport.city}
            coordinate={{ latitude: airport.lat, longitude: airport.lon }}
          />
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
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={styles.eyebrow}
              numberOfLines={1}>
              {focusedRow
                ? `${focusedRow.number || focusedRow.carrier} · ${formatDayLabel(focusedRow.scheduledDeparture)}`
                : 'Everywhere you’ve been'}
            </ThemedText>
            <ThemedText
              type="title"
              themeColor="heading"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}>
              {focusedRow ? `${focusedRow.fromCode} → ${focusedRow.toCode}` : 'World'}
            </ThemedText>
          </View>
          {focusedRow && <AllTravelsButton onPress={() => focusWorldOn(null)} />}
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
          <Link
            key={leg.id}
            href={{
              pathname: '/journey/[id]',
              params: { id: leg.id, from: leg.from.iata, to: leg.to.iata },
            }}
            asChild>
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
                  {/* Lookup rows store the carrier as its IATA code — already in the number. */}
                  {leg.carrier && leg.carrier.toUpperCase() !== airlineCode(leg.number)
                    ? ` · ${leg.carrier}`
                    : ''}
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

/** Clears a journey hand-off: back to every route on the map. */
function AllTravelsButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Show all travels"
      onPress={onPress}
      style={[styles.allTravels, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView
        name={{ ios: 'globe', android: 'public', web: 'public' }}
        size={16}
        weight="semibold"
        tintColor={theme.tint}
      />
      <ThemedText type="smallBold" style={{ color: theme.tint }}>
        All travels
      </ThemedText>
    </Pressable>
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
  allTravels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    height: 40,
    paddingLeft: Spacing.two + Spacing.half,
    paddingRight: Spacing.three,
    borderRadius: 20,
    shadowColor: '#0B1424',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
