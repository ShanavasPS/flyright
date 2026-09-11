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

import { CLUTTER_OFF, GOOGLE_NIGHT, frameInset, regionFor, regionHolds } from '@/services/map-region';

/** Inset height: tall enough to read a long-haul arc, short enough that the
 * route hero and the verdict still land above the fold on a small phone. */
export const ROUTE_MAP_HEIGHT = 220;

/** A journey's own route on a real map, framed as a static card in the
 * detail screen (the Airbnb "getting there" pattern): the great-circle arc,
 * both airports, the plane where the World tab would draw it. Not
 * interactive — the whole card is one tap target that hands the trip to the
 * World tab, so the map never fights the screen's scroll. Not Google's lite
 * mode on Android: that bitmap ignores marker `rotation` and `anchor`, so the
 * plane drew nose-up and above the arc. A route a map SDK can't hold —
 * wider than its lowest zoom, or arcing over the pole, where Mercator gives
 * out — is drawn on the offline atlas instead, whose flat projection fits
 * anything (see `frameInset`). Renders nothing when either airport is
 * unknown (manual entries with non-IATA codes). */
/** `onPress` is optional: a followed person's trip shows the same map, but
 * the World tab draws the viewer's OWN journal and has nothing to open it
 * on — so there the card is a picture, not a button, and does not pretend
 * otherwise by staying pressable. */
export function RouteMap({
  journey,
  onPress,
}: {
  journey: RouteSource;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const { sea } = mapColors(dark);
  // Frozen per mount, same as the World tab — the flown/upcoming cutoff
  // doesn't need to tick.
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldRoutes([journey], now), [journey, now]);
  const route = data.routes[0];
  const plane = useMemo(() => (route ? routePlane(route) : null), [route]);
  // How much of the world a map SDK can show here depends on how wide the
  // card came out, so the card is measured before either renderer is chosen —
  // the sea-coloured background covers the frame before the width lands.
  const [width, setWidth] = useState(0);
  // Unclamped fit (359 = no floor): `frameInset` does the clamping, and needs
  // to see the route's true span to know whether it fits at all.
  const frame = useMemo(() => {
    if (!width) return null;
    const fit = regionFor(data.fitCoords, data.airports.map((a) => a.lon), 359);
    return frameInset(fit, data.fitCoords.map((c) => c.latitude), width, ROUTE_MAP_HEIGHT);
  }, [data, width]);
  // The frame the SDK settled on but didn't honour, which only its own
  // callback can tell us. Held as the frame itself rather than a flag, so a
  // new route or a re-measured card is asked afresh instead of inheriting a
  // refusal that was about something else.
  const [refused, setRefused] = useState<object | null>(null);
  const useSdk = !!route && !!frame?.fits && refused !== frame;

  if (!route || !plane) return null;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={
        onPress
          ? `Map of ${route.from.iata} to ${route.to.iata}. Open in World`
          : `Map of ${route.from.iata} to ${route.to.iata}`
      }
      onPress={onPress}
      disabled={!onPress}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: sea, borderColor: theme.hairline, opacity: pressed ? 0.92 : 1 },
      ]}>
      {!frame ? null : useSdk ? (
        <MapView
          // One map per route: `initialRegion` is honoured on mount only, so
          // a map instance carried from one journey to the next would keep
          // the old window and show none of the new route.
          key={route.key}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
          initialRegion={frame.region}
          // The SDK has the last word on what it framed; a window that ended
          // up somewhere other than the route hands over to the atlas.
          onRegionChangeComplete={(granted) => {
            if (!regionHolds(granted, data.fitCoords)) setRefused(frame);
          }}
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
        <RouteAtlas journeys={[journey]} height={ROUTE_MAP_HEIGHT} />
      )}
      {/* Catches the tap for the Pressable on both platforms — Google Maps
          would otherwise swallow it even with gestures off. Still wanted
          without an onPress: it stops the map panning under a finger on a
          card that isn't meant to be interactive either. */}
      <View style={styles.shield} />
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
