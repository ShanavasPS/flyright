import { useAuth } from '@clerk/expo';
import { Link, useIsFocused, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { DataErrorCard } from '@/components/data-state';
import { GlobeView, globePalette } from '@/components/globe-view';
import { AirlineLogo, airlineCode } from '@/components/airline-logo';
import { ThemedText } from '@/components/themed-text';
import { useHeroTrip } from '@/components/travel-day-banner';
import { EmptyPeriodCard, PeriodButton, PeriodCard } from '@/components/world-period-card';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { airportZone, getAirport } from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { formatDayLabel, formatDayLabelWithYear } from '@/services/dates';
import { setGlobeDaylight, useGlobeDaylight } from '@/services/globe-daylight';
import {
  buildWorldRoutes,
  haversineKm,
  routePlane,
  type GeoRoute,
  type RouteLeg,
  type RoutePlane,
} from '@/services/geo';
import { useJourneys, type JourneyRow } from '@/services/journeys';
import { useGlobeTextures } from '@/services/globe-textures';
import { cityOf, formatKm, travelRecap } from '@/services/timeline';
import { focusWorldOn, useWorldFocus } from '@/services/world-focus';
import { ALL_TIME, filterByPeriod, periodKey, type WorldPeriod } from '@/services/world-period';
import { openWorldShare } from '@/services/world-share';

/** Overlay heights below the safe areas, for `mapPadding`. Header: eyebrow
 * (16) + gap (2) + title (41) + vertical padding (8 + 16). Card: numerals
 * (28) + label (20) + vertical padding (32). */
const HEADER_HEIGHT = 83;
const STATS_CARD_HEIGHT = 80;
const RECENTER_CONTROL_HEIGHT = 56;

/** Your travels on a globe — a lit earth drawn by the app itself (see
 * components/globe-view) — with every route drawn as a great-circle arc
 * between its origin and destination. Flown routes are solid with a plane
 * mid-arc showing the way the latest leg flew; upcoming ones are faint with
 * a light running toward the destination and a pulsing plane waiting by the
 * origin. Tapping a route docks its journeys where the stats card sits. A
 * period pill in the header narrows the globe to a year, a month or a
 * custom range. Drag turns the globe, pinch and double tap zoom it. */
export function World() {
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const focused = useIsFocused();

  // A journey detail can hand the tab one trip to open on; the map then
  // draws that trip alone until "All travels" or leaving the tab clears it.
  // An id that isn't in the journal (a stale hand-off, the demo) is ignored.
  const focusId = useWorldFocus();
  const focusedRow = useMemo(
    () => (focusId ? journeys?.find((row) => row.id === focusId) : undefined),
    [journeys, focusId],
  );
  useEffect(() => {
    if (!focused) focusWorldOn(null);
  }, [focused]);

  return (
    <WorldCanvas
      rows={journeys ?? []}
      focusedRow={focusedRow}
      loaded={journeys != null || !!error}
      onClearFocus={() => focusWorldOn(null)}
      shareable
      eyebrow="Everywhere you’ve been"
      title="World"
      emptyCard={error ? <DataErrorCard error={error} /> : <EmptyCard />}
    />
  );
}

/** The map itself, for whosever travel it is drawing.
 *
 * The World tab is one caller; a followed person's world (screens/person-world)
 * is the other, and it gets the same map, the same route taps, the same
 * "All travels" way back out of a single trip — because a person's travel
 * deserves the map the app already has, not a flat drawing of one. Whose
 * travel it is stays in the title, which is the only thing that differs. */
export function WorldCanvas({
  rows,
  focusedRow,
  loaded,
  onClearFocus,
  eyebrow,
  title,
  emptyCard,
  onBack,
  shareable = false,
}: {
  /** Every journey the globe may draw. The canvas narrows it itself: to the
   * focused trip while there is one, otherwise to the chosen period. */
  rows: JourneyRow[];
  /** Set when the caller arrived from one trip: the globe frames that leg
   * alone and offers "All travels" to widen back out. */
  focusedRow?: JourneyRow;
  /** False while the rows are still loading — an empty globe mid-fetch is
   * not the same as somebody with no travel. */
  loaded: boolean;
  onClearFocus: () => void;
  /** Shown when nothing is focused; the focused labels name the flight. */
  eyebrow: string;
  title: string;
  emptyCard: React.ReactNode;
  /** A pushed screen draws its own back button, since the globe runs full
   * bleed under where a header would be. The tab has none. */
  onBack?: () => void;
  /** Offers the share poster. Only for the traveller's own globe — somebody
   * else's travel is theirs to post, not the viewer's. */
  shareable?: boolean;
}) {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const theme = useTheme();
  const focused = useIsFocused();
  // The detail tiles decode once the tab is actually on screen.
  const textures = useGlobeTextures(focused);
  const appActive = useAppActive();

  // Which slice of the journal is on the globe. Kept for the session, not
  // reset on blur: tapping a flight on the route card leaves the tab, and
  // coming back to "All time" after every such trip would undo the choice
  // the traveller just made. A journey hand-off is a new subject and resets it.
  const [period, setPeriod] = useState<WorldPeriod>(ALL_TIME);
  const [choosing, setChoosing] = useState(false);
  const visible = useMemo(
    () => (focusedRow ? [focusedRow] : filterByPeriod(rows, period)),
    [rows, focusedRow, period],
  );

  // "Flown vs upcoming" cutoff, frozen per mount — a live clock would redraw
  // the globe mid-session for no visible gain.
  const [now] = useState(() => new Date());
  const data = useMemo(() => buildWorldRoutes(visible, now), [visible, now]);
  const recap = useMemo(() => travelRecap(visible), [visible]);

  // The camera frames the routes until the traveller takes it somewhere;
  // from then on new flights don't yank it back. Clearing `moved` — a
  // recenter, a hand-off, a new period, a return to the tab — animates the
  // globe back to the fit of what it shows.
  const [moved, setMoved] = useState(false);

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // The header fade and the stats card cover the globe's top and bottom.
  // Their heights are derived, not measured, so the fit lands in the strip
  // between them from the first frame.
  const insets = useSafeAreaInsets();
  // iOS: the globe runs under the tab bar (iOS 26 glass) or ends at it (iOS
  // 18), and insets.bottom reflects whichever — use it. Android: the native
  // tab bar already sits above the system bar and the screen ends at the
  // tab bar, yet insets.bottom still reports the system bar; adding it would
  // float the card a nav-bar height too high.
  const footerInset = (Platform.OS === 'ios' ? insets.bottom : 0) + Spacing.three;
  const strip = {
    top: insets.top + HEADER_HEIGHT,
    // Keep room for the recenter control so showing it doesn't shift the fit.
    bottom: footerInset + STATS_CARD_HEIGHT + RECENTER_CONTROL_HEIGHT,
  };

  // A plain return to World starts from the chosen period's overview,
  // rather than inheriting the last zoom. Keep the date selection.
  const [wasFocused, setWasFocused] = useState(focused);
  if (wasFocused !== focused) {
    setWasFocused(focused);
    if (focused) setMoved(false);
  }

  // Tapping a plane or a route docks a detail card in the stats card's slot;
  // tapping the globe elsewhere or its close button brings the stats back.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const recenter = () => setMoved(false);
  const choosePeriod = (next: WorldPeriod) => {
    setPeriod(next);
    setSelectedKey(null);
    // Selecting "All time" again is an explicit request for the overview:
    // clearing `moved` refits even though the route data hasn't changed
    // (and if it was never moved, the globe is already there).
    recenter();
  };

  // A hand-off (or its clearing) is a new subject: the camera refits even if
  // the user had panned, and the trip's route card docks straight away.
  // Reset during render (not in an effect) so the refit effect above already
  // sees `moved` false on the render that carries the new data.
  const [seenFocus, setSeenFocus] = useState(focusedRow?.id);
  if (seenFocus !== focusedRow?.id) {
    setSeenFocus(focusedRow?.id);
    setMoved(false);
    setChoosing(false);
    if (focusedRow) setPeriod(ALL_TIME);
    setSelectedKey(focusedRow ? (data.routes[0]?.key ?? null) : null);
  }
  // A new period is a new subject too: refit even after a pan. An empty
  // period has nothing to fit to, so the camera simply stays.
  const [seenPeriod, setSeenPeriod] = useState(periodKey(period));
  if (seenPeriod !== periodKey(period)) {
    setSeenPeriod(periodKey(period));
    setMoved(false);
    setSelectedKey(null);
  }

  // Nothing in the journal at all, versus nothing in the chosen period.
  const empty = loaded && rows.length === 0;
  const emptyPeriod = loaded && !empty && !focusedRow && visible.length === 0;

  // One plane per route; direction comes from the journeys (see routePlane).
  const planes = useMemo(
    () => data.routes.map((route) => ({ route, plane: routePlane(route) })),
    [data],
  );
  const selected = planes.find(({ route }) => route.key === selectedKey) ?? null;

  const daylight = useGlobeDaylight();
  // The flight whose travel day is on the home screen (T−24h through
  // landing) gets a beacon on its origin, so the globe points at what is
  // next the same way the hero card does — while that trip is on the globe.
  const heroNow = useNow();
  const hero = useHeroTrip(rows, heroNow);
  const beacon = useMemo(() => {
    if (!hero || !visible.some((row) => row.id === hero.journey.id)) return null;
    const origin = getAirport(hero.journey.fromCode);
    return origin ? { latitude: origin.lat, longitude: origin.lon } : null;
  }, [hero, visible]);

  /** What the poster shows follows what the globe shows: the tapped route's
   * legs, the handed-off trip, else the period's rows. */
  const shareVisible = () => {
    if (selected) {
      const ids = new Set(selected.route.legs.map((leg) => leg.id));
      openWorldShare({ rows: rows.filter((row) => ids.has(row.id)), period, kind: 'route' });
    } else if (focusedRow) {
      openWorldShare({ rows: [focusedRow], period, kind: 'route' });
    } else {
      openWorldShare({ rows: visible, period, kind: 'period' });
    }
    router.push('/share-world');
  };

  return (
    <View
      style={styles.flex}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setCanvasSize((size) =>
          size.width === width && size.height === height ? size : { width, height },
        );
      }}>
      {canvasSize.width > 0 && (
        <GlobeView
          routes={data.routes}
          airports={data.airports}
          selectedKey={selectedKey}
          width={canvasSize.width}
          height={canvasSize.height}
          strip={strip}
          textures={textures}
          colors={{ ...globePalette(dark), tint: theme.tint, background: theme.background }}
          holdFit={moved}
          daylight={daylight}
          beacon={beacon}
          // Comets and pulses only while the tab is on screen in a
          // foregrounded app — animation for nobody would burn battery.
          animate={focused && appActive}
          onSelect={(key) => {
            setChoosing(false);
            setSelectedKey(key);
          }}
          onMoved={() => setMoved(true)}
          testID="world-globe"
        />
      )}

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
          {onBack && <BackButton onPress={onBack} />}
          <View style={styles.titleBlock} pointerEvents="box-none">
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={styles.eyebrow}
              pointerEvents="none">
              {focusedRow
                ? `${focusedRow.number || focusedRow.carrier} · ${formatDayLabel(focusedRow.scheduledDeparture, airportZone(focusedRow.fromCode))}`
                : eyebrow}
            </ThemedText>
            <View style={styles.titleRow} pointerEvents="box-none">
              <ThemedText
                type="title"
                themeColor="heading"
                style={styles.flex}
                pointerEvents="none"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}>
                {focusedRow ? `${focusedRow.fromCode} → ${focusedRow.toCode}` : title}
              </ThemedText>
              {focusedRow && <AllTravelsButton onPress={onClearFocus} />}
              {!focusedRow && !empty && (
                <PeriodButton
                  period={period}
                  onPress={() => {
                    setSelectedKey(null);
                    setChoosing((open) => !open);
                  }}
                />
              )}
              {!empty && <DaylightButton on={daylight} />}
              {shareable && loaded && visible.length > 0 && <ShareButton onPress={shareVisible} />}
            </View>
          </View>
        </View>
      </SafeAreaView>

      <View
        style={[styles.footer, { paddingBottom: footerInset }]}
        pointerEvents="box-none">
        {!choosing && !empty && !emptyPeriod && moved && (
          <RecenterButton onPress={recenter} />
        )}
        {empty ? (
          emptyCard
        ) : choosing ? (
          <PeriodCard
            rows={rows}
            period={period}
            recap={recap}
            onChange={choosePeriod}
            onClose={() => setChoosing(false)}
          />
        ) : selected ? (
          <RouteCard
            route={selected.route}
            plane={selected.plane}
            onClose={() => setSelectedKey(null)}
          />
        ) : emptyPeriod ? (
          <EmptyPeriodCard period={period} onReset={() => choosePeriod(ALL_TIME)} />
        ) : recap.trips > 0 ? (
          <Card style={styles.stats}>
            <Stat value={recap.trips} label={recap.trips === 1 ? 'trip' : 'trips'} />
            <Stat value={recap.airports} label={recap.airports === 1 ? 'airport' : 'airports'} />
            <Stat value={recap.countries} label={recap.countries === 1 ? 'country' : 'countries'} />
            <Stat value={formatKm(recap.totalKm)} label="km" />
          </Card>
        ) : null}
      </View>
    </View>
  );
}

/** Whether the app is in the foreground — the globe's animations pause
 * otherwise. */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

/** "AY1331 · Finnair"; just the number when the carrier is only its IATA code
 * (lookup rows store the code); the carrier alone for entries without one. */
function legLabel(leg: RouteLeg): string {
  const carrier = leg.carrier.trim();
  if (!leg.number) return carrier;
  if (!carrier || carrier.toUpperCase() === airlineCode(leg.number)) return leg.number;
  return `${leg.number} · ${carrier}`;
}

/** Detail card for a tapped plane, docked where the stats card sits: the
 * pair read the way the plane flies, cities and distance, then every flight
 * on it as a row into the journey — airline logo, number, when. The codes
 * repeat on the rows only when the pair has been flown both ways, since
 * that's the one case a row's direction isn't the header's. */
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
  const bothWays = legs.some((leg) => leg.from.iata !== from.iata);
  const summary = [
    `${cityOf(from.iata)} → ${cityOf(to.iata)}`,
    `${km.toLocaleString()} km`,
    legs.length > 1 ? `${legs.length} flights` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card style={styles.routeCard}>
      <View style={styles.routeHeader}>
        <View style={styles.routeTitle}>
          <ThemedText themeColor="heading" style={styles.routeCodes}>
            {from.iata} → {to.iata}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {summary}
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
              <AirlineLogo number={leg.number} carrier={leg.carrier} size={32} />
              <View style={styles.legCopy}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {legLabel(leg)}
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor={leg.flown ? 'textSecondary' : 'tint'}
                  numberOfLines={1}>
                  {bothWays ? `${leg.from.iata} → ${leg.to.iata} · ` : ''}
                  {leg.flown
                    ? `Flown · ${formatDayLabelWithYear(leg.scheduledDeparture, airportZone(leg.from.iata))}`
                    : `Upcoming · ${formatDayLabel(leg.scheduledDeparture, airportZone(leg.from.iata))}`}
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

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText themeColor="heading" style={styles.statValue}>
        {typeof value === 'number' ? value.toLocaleString() : value}
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
      <Link href="/add" asChild>
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

/** Back out of a pushed world. The tab has no such button; a person's does,
 * because the map runs full bleed under where its header would be. */
function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      style={[styles.recenter, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView
        name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
        size={16}
        weight="semibold"
        tintColor={theme.text}
      />
    </Pressable>
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

/** Day and night on the globe, on or off — an icon that is lit when the
 * globe is. The same round button as Share, no label: the globe itself
 * shows what it does. Remembered across sessions. */
function DaylightButton({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? 'Hide day and night' : 'Show day and night'}
      testID="world-daylight-toggle"
      onPress={() => {
        setGlobeDaylight(!on);
        trackEvent('world_daylight', { on: !on });
      }}
      style={[styles.recenter, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView
        name={
          on
            ? { ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' }
            : { ios: 'sun.max', android: 'light_mode', web: 'light_mode' }
        }
        size={18}
        weight="semibold"
        tintColor={on ? theme.tint : theme.textSecondary}
      />
    </Pressable>
  );
}

/** Opens the share poster for whatever the map is showing. */
function ShareButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Share your world"
      onPress={onPress}
      style={[styles.recenter, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView
        name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
        size={18}
        weight="semibold"
        tintColor={theme.tint}
      />
    </Pressable>
  );
}

/** Restore the overview after the traveller moves the map. */
function RecenterButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Recenter the globe on your travels"
      testID="world-map-recenter"
      onPress={onPress}
      style={[styles.recenterLabel, { backgroundColor: theme.backgroundElement }]}>
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
      <ThemedText type="smallBold" style={{ color: theme.tint }}>Recenter</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
    // Runs past the header so the fade tails off over open globe, not text.
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
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
  recenterLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 48,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 24,
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
    gap: Spacing.two + Spacing.half,
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
