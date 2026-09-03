import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';

import { AirportMarker, PlaneMarker } from '@/components/map-layers';
import { RouteAtlas } from '@/components/route-atlas';
import { ThemedText } from '@/components/themed-text';
import { mapColors } from '@/components/world-map';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { buildWorldRoutes, routePlane, type RouteSource } from '@/services/geo';

import { CLUTTER_OFF, GOOGLE_NIGHT, MAX_LAT, regionFor } from '@/services/map-region';

/** Inset height: tall enough to read a long-haul arc, short enough that the
 * route hero and the verdict still land above the fold on a small phone. */
export const ROUTE_MAP_HEIGHT = 220;

/** Widest padded route, in degrees of longitude, the map SDK can still show
 * whole in the inset. Below the World tab's measured zoom-out floors (~89°
 * MapKit on an iPhone, ~72° Google on a Pixel) because the inset is narrower
 * than the tab and a static card can't be panned to recover the rest. Wider
 * routes render on the offline atlas instead, which fits anything. */
const SDK_MAX_LON_SPAN = Platform.OS === 'android' ? 60 : 80;

/** A journey's own route on a real map, framed as a static card in the
 * detail screen (the Airbnb "getting there" pattern): the great-circle arc,
 * both airports, the plane where the World tab would draw it. Not
 * interactive — the whole card is one tap target that hands the trip to the
 * World tab, so the map never fights the screen's scroll. Not Google's lite
 * mode on Android: that bitmap ignores marker `rotation` and `anchor`, so the
 * plane drew nose-up and above the arc. Renders nothing when either airport is unknown (manual entries with
 * non-IATA codes). */
export function RouteMap({ journey, onPress }: { journey: RouteSource; onPress: () => void }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const { sea } = mapColors(dark);
  // Frozen per mount, same as the World tab — the flown/upcoming cutoff
  // doesn't need to tick.
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldRoutes([journey], now), [journey, now]);
  const route = data.routes[0];
  const plane = useMemo(() => (route ? routePlane(route) : null), [route]);
  // Unclamped fit (359 = no floor) so a too-wide span is detectable. The
  // inset is much wider than tall, so the SDK fits the longitude and the
  // latitude would land the endpoint dots on the top and bottom edges — give
  // it room, and a little more longitude so the dots clear the rounded corners.
  const region = useMemo(() => {
    const fit = regionFor(data.fitCoords, data.airports.map((a) => a.lon), 359);
    return {
      ...fit,
      latitudeDelta: Math.min(2 * MAX_LAT, fit.latitudeDelta * 1.6),
      longitudeDelta: Math.min(359, fit.longitudeDelta * 1.15),
    };
  }, [data]);
  const useSdk = !!route && region.longitudeDelta <= SDK_MAX_LON_SPAN;

  if (!route || !plane) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Map of ${route.from.iata} to ${route.to.iata}. Open in World`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: theme.hairline, opacity: pressed ? 0.92 : 1 },
      ]}>
      {useSdk ? (
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
          initialRegion={region}
          // Sea-coloured placeholder until the tiles land, instead of the
          // SDK's grey grid flashing through the push transition; the
          // indicator is painted in the same colour so nothing spins.
          loadingEnabled
          loadingBackgroundColor={sea}
          loadingIndicatorColor={sea}
          pointerEvents="none"
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsPointsOfInterests={false}
          showsCompass={false}
          showsScale={false}
          showsMyLocationButton={false}
          customMapStyle={dark ? GOOGLE_NIGHT : CLUTTER_OFF}
          userInterfaceStyle={dark ? 'dark' : 'light'}>
          {route.segments.map((coordinates, i) => (
            <Polyline
              key={`${route.key}-${i}`}
              coordinates={coordinates}
              strokeColor={theme.tint}
              strokeWidth={3}
              lineCap="round"
            />
          ))}
          <PlaneMarker plane={plane} />
          {data.airports.map((airport) => (
            <AirportMarker
              key={airport.iata}
              iata={airport.iata}
              city={airport.city}
              coordinate={{ latitude: airport.lat, longitude: airport.lon }}
            />
          ))}
        </MapView>
      ) : (
        <RouteAtlas journey={journey} height={ROUTE_MAP_HEIGHT} />
      )}
      {/* Catches the tap for the Pressable on both platforms — Google Maps
          would otherwise swallow it even with gestures off. */}
      <View style={styles.shield} />
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
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shield: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
