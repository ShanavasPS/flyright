import { useAuth } from '@clerk/expo';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  Polyline,
  type Region,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { buildWorldRoutes, type LatLng } from '@/services/geo';
import { useJourneys } from '@/services/journeys';
import { travelRecap } from '@/services/timeline';

/** Region containing every coordinate, wraparound-aware. The camera is set
 * from this instead of `fitToCoordinates` because antimeridian-split routes
 * defeat a naive bounding box (their ±180° endpoints make it span the whole
 * world and the SDKs then pick an arbitrary window). The longitude window is
 * the complement of the largest empty gap between route samples — the
 * standard fix for bounds on a circle. With no coordinates it falls back to
 * a whole-world view. The 1.4/1.3 factors pad the fit clear of the header
 * and the stats card. */
function regionFor(coords: LatLng[]): Region {
  if (!coords.length) return { latitude: 30, longitude: 0, latitudeDelta: 100, longitudeDelta: 120 };
  let minLat = 90;
  let maxLat = -90;
  for (const c of coords) {
    minLat = Math.min(minLat, c.latitude);
    maxLat = Math.max(maxLat, c.latitude);
  }
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
  const lonSpan = 360 - gapSize;
  const rawCenter = gapStart + gapSize + lonSpan / 2;
  // Clamped hard: MKMapView throws NSException on longitudeDelta > 360 or a
  // span poking past the poles.
  const latitudeDelta = Math.min(120, Math.max(6, (maxLat - minLat) * 1.4));
  const maxCenterLat = 85 - latitudeDelta / 2;
  return {
    latitude: Math.min(maxCenterLat, Math.max(-maxCenterLat, (minLat + maxLat) / 2)),
    longitude: ((rawCenter % 360) + 540) % 360 - 180,
    latitudeDelta,
    longitudeDelta: Math.min(359, Math.max(6, lonSpan * 1.3)),
  };
}

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
 * with every route flown drawn as a great-circle arc between its origin and
 * destination (solid once flown, dashed while still ahead). Pan/zoom is the
 * map SDK's own. */
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

  const mapRef = useRef<MapView>(null);
  // True once the user pans/zooms away from the fitted view; new flights
  // stop re-fitting the camera the moment the user takes the wheel. Detected
  // by comparing regions against the last fit, not `details.isGesture` —
  // Apple Maps doesn't report that flag.
  const [moved, setMoved] = useState(false);
  const fitting = useRef(false);
  const fitted = useRef<Region | null>(null);

  const fit = (animated: boolean) => {
    if (!data.fitCoords.length) return;
    fitting.current = true;
    mapRef.current?.animateToRegion(regionFor(data.fitCoords), animated ? 600 : 0);
  };

  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready && !moved) fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit on new data only
  }, [ready, data]);

  const empty = journeys != null && data.routes.length === 0;

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={regionFor(data.fitCoords)}
        onMapReady={() => setReady(true)}
        onRegionChangeComplete={(region, details) => {
          if (fitting.current) {
            // The settle of our own animateToRegion — record what the SDK
            // actually granted (it clamps extreme spans) as the baseline.
            fitting.current = false;
            fitted.current = region;
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
              strokeColor={theme.tint}
              strokeWidth={2.5 + Math.min(route.count - 1, 4) * 0.5}
              lineCap="round"
              lineDashPattern={route.upcomingOnly ? [10, 8] : undefined}
            />
          )),
        )}
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
        <View style={styles.header} pointerEvents="box-none">
          <View pointerEvents="none">
            <ThemedText type="title" themeColor="heading">
              World
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Everywhere your journeys have taken you
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

      <SafeAreaView style={styles.footer} edges={['bottom']} pointerEvents="box-none">
        {empty ? (
          <EmptyCard />
        ) : recap.trips > 0 ? (
          <Card style={styles.stats}>
            <Stat value={recap.trips} label={recap.trips === 1 ? 'trip' : 'trips'} />
            <Stat value={recap.airports} label={recap.airports === 1 ? 'airport' : 'airports'} />
            <Stat value={recap.countries} label={recap.countries === 1 ? 'country' : 'countries'} />
            <Stat value={recap.totalKm} label="km" />
          </Card>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="smallBold" themeColor="heading">
        {value.toLocaleString()}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function EmptyCard() {
  const theme = useTheme();
  return (
    <Card style={styles.emptyCard}>
      <ThemedText type="subtitle" themeColor="heading">
        Your world map awaits
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyCopy}>
        Add a flight — past or future — and watch its route draw itself across the map.
      </ThemedText>
      <Link href="/add-flight" asChild>
        {/* Link's asChild Slot rejects array styles — keep this one flat. */}
        <Pressable
          accessibilityRole="button"
          style={StyleSheet.flatten([styles.emptyButton, { backgroundColor: theme.tint }])}>
          <ThemedText type="smallBold" style={styles.emptyButtonLabel}>
            Add a flight
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
    bottom: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
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
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.four,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    marginBottom: BottomTabInset + Spacing.three,
    borderRadius: Spacing.five,
  },
  stat: {
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    marginHorizontal: Spacing.five,
    marginBottom: BottomTabInset + Spacing.five,
    maxWidth: 340,
  },
  emptyCopy: {
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.five,
  },
  emptyButtonLabel: {
    color: '#FFFFFF',
  },
});
