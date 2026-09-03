import { useAuth } from '@clerk/expo';
import { Link, useIsFocused } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { WorldMap, mapColors } from '@/components/world-map';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { WORLD, buildWorldMap, fitViewBox, type ViewBox } from '@/services/geo';
import { useJourneys } from '@/services/journeys';
import { formatDayLabel } from '@/services/dates';
import { travelRecap } from '@/services/timeline';
import { focusWorldOn, useWorldFocus } from '@/services/world-focus';

/** Deepest zoom-in: 1/16 of the world across the screen — enough to separate
 * co-located city airports without outrunning the 1:110m coastline data. */
const MIN_BOX_WIDTH = WORLD.width / 16;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Your travels on a world map: every airport visited, every route flown as
 * a great-circle arc — solid once flown, dashed while still ahead. */
export function World() {
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);

  // A journey detail can hand the tab one trip to open on (see the native
  // World for the full treatment); cleared on "All travels" or leaving.
  const focused = useIsFocused();
  const focusId = useWorldFocus();
  const focusedRow = focusId ? journeys?.find((row) => row.id === focusId) : undefined;
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
  const data = useMemo(() => buildWorldMap(rows, now), [rows, now]);
  const recap = useMemo(() => travelRecap(rows), [rows]);

  const { sea } = mapColors(useColorScheme() === 'dark');
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const aspect = layout ? layout.width / layout.height : 0;
  const fitted = useMemo(() => fitViewBox(data.fitPoints, aspect), [data, aspect]);

  // Where the user panned/zoomed to; null means "follow the fitted view"
  // (so new flights re-fit the map until the user takes the wheel).
  const [userBox, setUserBox] = useState<ViewBox | null>(null);
  const box = userBox ?? fitted;

  // Live gesture state, applied as a plain view transform while fingers are
  // down. On release it's committed into the SVG viewBox (a crisp vector
  // re-render at the new zoom) and the transform resets to identity.
  const scale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const pinchActive = useSharedValue(false);
  const panActive = useSharedValue(false);

  const commit = (s: number, tx: number, ty: number, fx: number, fy: number) => {
    if (!layout) return;
    const width = clamp(box.width / s, MIN_BOX_WIDTH, WORLD.width);
    const sEff = box.width / width; // s after the zoom clamps
    const k = layout.width / box.width; // px per map unit
    // Screen-space offset of the gesture transform: p' = sEff·p + o.
    const ox = (1 - sEff) * fx + tx;
    const oy = (1 - sEff) * fy + ty;
    const height = width / (layout.width / layout.height);
    const x = clamp(box.x - ox / (sEff * k), 0, Math.max(0, WORLD.width - width));
    const y =
      height >= WORLD.height
        ? (WORLD.height - height) / 2
        : clamp(box.y - oy / (sEff * k), 0, WORLD.height - height);
    // Commit the gesture into the viewBox (a crisp vector re-render) and zero
    // the live transform in the same JS task, so both land on the same frame.
    // A commit the clamping reduced to a no-op (panning at full zoom-out) keeps
    // following the fitted view instead of pinning a stale userBox.
    const moved =
      Math.abs(x - box.x) > 0.01 ||
      Math.abs(y - box.y) > 0.01 ||
      Math.abs(width - box.width) > 0.01;
    if (moved) setUserBox({ x, y, width, height });
    scale.value = 1;
    focalX.value = 0;
    focalY.value = 0;
    panX.value = 0;
    panY.value = 0;
  };

  const settle = () => {
    'worklet';
    if (pinchActive.value || panActive.value) return;
    runOnJS(commit)(scale.value, panX.value, panY.value, focalX.value, focalY.value);
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinchActive.value = true;
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      scale.value = e.scale;
    })
    .onFinalize(() => {
      pinchActive.value = false;
      settle();
    });

  const pan = Gesture.Pan()
    .maxPointers(2)
    .onStart(() => {
      panActive.value = true;
    })
    .onUpdate((e) => {
      panX.value = e.translationX;
      panY.value = e.translationY;
    })
    .onFinalize(() => {
      panActive.value = false;
      settle();
    });

  const centerX = (layout?.width ?? 0) / 2;
  const centerY = (layout?.height ?? 0) / 2;
  const animatedStyle = useAnimatedStyle(() => {
    const s = scale.value;
    return {
      transform: [
        { translateX: (1 - s) * (focalX.value - centerX) + panX.value },
        { translateY: (1 - s) * (focalY.value - centerY) + panY.value },
        { scale: s },
      ],
    };
  });

  const empty = journeys != null && data.routes.length === 0;

  return (
    <GestureHandlerRootView style={styles.flex}>
      {/* Sea-colored root, not the page background: the map letterboxes on
          tall screens and shrinks during pinch-out, and every exposed sliver
          must read as ocean (the mismatch showed as a "white status bar"). */}
      <View style={[styles.flex, { backgroundColor: sea }]}>
        <View
          style={styles.map}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setLayout(width && height ? { width, height } : null);
          }}>
          {layout && (
            <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
              <Animated.View style={[styles.flex, animatedStyle]}>
                <WorldMap
                  box={box}
                  pxWidth={layout.width}
                  routes={data.routes}
                  airports={data.airports}
                />
              </Animated.View>
            </GestureDetector>
          )}
        </View>

        <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
          <View style={styles.header} pointerEvents="box-none">
            <View pointerEvents="none">
              <ThemedText type="title" themeColor="heading">
                {focusedRow ? `${focusedRow.fromCode} → ${focusedRow.toCode}` : 'World'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {focusedRow
                  ? `${focusedRow.number || focusedRow.carrier} · ${formatDayLabel(focusedRow.scheduledDeparture)}`
                  : 'Everywhere your journeys have taken you'}
              </ThemedText>
            </View>
            {focusedRow && <AllTravelsButton onPress={() => focusWorldOn(null)} />}
            {userBox && <RecenterButton onPress={() => setUserBox(null)} />}
          </View>
        </SafeAreaView>

        <SafeAreaView style={styles.footer} edges={['bottom']} pointerEvents="box-none">
          {empty ? (
            <EmptyCard />
          ) : recap.trips > 0 ? (
            <Card style={styles.stats}>
              <Stat value={recap.trips} label={recap.trips === 1 ? 'trip' : 'trips'} />
              <Stat value={recap.airports} label={recap.airports === 1 ? 'airport' : 'airports'} />
              <Stat
                value={recap.countries}
                label={recap.countries === 1 ? 'country' : 'countries'}
              />
              <Stat value={recap.totalKm} label="km" />
            </Card>
          ) : null}
        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
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

/** Clears a journey hand-off: back to every route on the map. */
function AllTravelsButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Show all travels"
      onPress={onPress}
      style={[styles.allTravels, { backgroundColor: theme.backgroundElement }]}>
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
    overflow: 'hidden',
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
  allTravels: {
    height: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    justifyContent: 'center',
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
