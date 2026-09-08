import { Pressable, StyleSheet, View } from 'react-native';

import { RouteAtlas } from '@/components/route-atlas';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { TripRow } from '@/components/trip-row';
import { mapColors } from '@/components/world-map';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { RouteSource } from '@/services/geo';
import { STAGE_LABELS, type TravelStage } from '@/services/travel-day';

/** Tall enough to read a long-haul arc, short enough that the trips below
 * still start on the first screen. */
const PERSON_MAP_HEIGHT = 170;

export type PersonTrip = {
  journeyId: string;
  carrier: string;
  number: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
};

export type PersonTravelData = {
  live: {
    session: {
      fromCode: string;
      toCode: string;
      currentStage: string | null;
      delayMinutes: number | null;
      gate: string | null;
    };
  } | null;
  liveJourneyId: string | null;
  upcoming: PersonTrip[];
  past: PersonTrip[];
  ahead: number;
  flown: number;
};

/** Every trip they share, in the shape the map draws. */
export function routesOf(p: { upcoming: PersonTrip[]; past: PersonTrip[] }): RouteSource[] {
  return [...p.upcoming, ...p.past].map((t) => ({
    id: t.journeyId,
    fromCode: t.fromCode,
    toCode: t.toCode,
    number: t.number,
    carrier: t.carrier,
    scheduledDeparture: t.scheduledDeparture,
  }));
}

/** Somebody's travel the way a circle member is shown it: their world in
 * miniature, the two totals, the trip in flight, then what's ahead and what's
 * flown. One component for the person page AND the owner's "how others see
 * you" preview — the preview is truthful precisely because it is this same
 * rendering of the same server shape, not a mock of it. Handlers are
 * optional: without them the rows are inert (the preview's case). `badgeFor`
 * lets the preview mark rows the member never sees marked; `afterUpcoming`
 * is where it explains what is missing. */
export function PersonTravel({
  name,
  data: p,
  now,
  onOpenWorld,
  onOpenTrip,
  badgeFor,
  dimFor,
  afterUpcoming,
  showStats = true,
}: {
  name: string;
  data: PersonTravelData;
  now: Date;
  /** Off when the page draws the two totals itself (the person page puts
   * them beside the avatar); the preview keeps them here. */
  showStats?: boolean;
  onOpenWorld?: () => void;
  onOpenTrip?: (journeyId: string) => void;
  badgeFor?: (journeyId: string) => React.ReactNode;
  /** Rows to fade — the preview's "this member isn't shown this one". */
  dimFor?: (journeyId: string) => boolean;
  afterUpcoming?: React.ReactNode;
}) {
  const theme = useTheme();
  const { sea } = mapColors(useColorScheme() === 'dark');
  const routes = routesOf(p);
  const trip = (t: PersonTrip) => (
    <Pressable
      key={t.journeyId}
      accessibilityRole="button"
      accessibilityLabel={`${t.number || t.carrier}, ${t.fromCode} to ${t.toCode}`}
      disabled={!onOpenTrip}
      onPress={() => onOpenTrip?.(t.journeyId)}
      style={({ pressed }) => [dimFor?.(t.journeyId) && styles.dimmed, pressed && styles.pressed]}>
      <TripRow trip={t} now={now} badge={badgeFor?.(t.journeyId)} />
    </Pressable>
  );

  return (
    <>
      {/* Their travel, before the list of it. Opens the same map full
          screen — on the person, never as a mode of the viewer's own World
          tab (see screens/person-world). */}
      {routes.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}'s world`}
          disabled={!onOpenWorld}
          onPress={onOpenWorld}
          style={({ pressed }) => pressed && styles.pressed}>
          <View style={[styles.map, { backgroundColor: sea }]}>
            <RouteAtlas journeys={routes} height={PERSON_MAP_HEIGHT} />
          </View>
        </Pressable>
      )}

      {showStats && (
        <View style={styles.stats}>
          <Stat label={p.ahead === 1 ? 'Trip ahead' : 'Trips ahead'} value={p.ahead} />
          <Stat label={p.flown === 1 ? 'Trip flown' : 'Trips flown'} value={p.flown} />
        </View>
      )}

      {p.live && (
        <Pressable
          accessibilityRole="button"
          disabled={!onOpenTrip || !p.liveJourneyId}
          onPress={() => (p.liveJourneyId ? onOpenTrip?.(p.liveJourneyId) : undefined)}
          style={({ pressed }) => pressed && styles.pressed}>
          <SheenCard style={styles.liveCard}>
            <View style={styles.liveHeader}>
              <View style={[styles.dot, { backgroundColor: theme.tint }]} />
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                TRAVELLING NOW
              </ThemedText>
            </View>
            <ThemedText type="subtitle" themeColor="heading">
              {p.live.session.fromCode} → {p.live.session.toCode}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {p.live.session.currentStage
                ? STAGE_LABELS[p.live.session.currentStage as TravelStage]
                : 'Getting ready'}
              {p.live.session.delayMinutes != null && p.live.session.delayMinutes >= 30
                ? ` · ${p.live.session.delayMinutes} min late`
                : p.live.session.gate
                  ? ` · Gate ${p.live.session.gate}`
                  : ''}
            </ThemedText>
          </SheenCard>
        </Pressable>
      )}

      <Section label="Upcoming" />
      {p.upcoming.length ? (
        p.upcoming.map(trip)
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          Nothing booked yet. You&apos;ll hear when {name} adds a trip.
        </ThemedText>
      )}
      {afterUpcoming}

      {p.past.length > 0 && (
        <>
          <Section label="Flown" />
          {p.past.map(trip)}
          {p.flown > p.past.length && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              Showing the last {p.past.length} of {p.flown}.
            </ThemedText>
          )}
        </>
      )}
    </>
  );
}

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="title" themeColor="heading">
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

export function Section({ label }: { label: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
      {label.toUpperCase()}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  centered: { textAlign: 'center', alignSelf: 'center' },
  stats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.six,
    paddingBottom: Spacing.two,
  },
  stat: { alignItems: 'center', gap: Spacing.half },
  section: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
    paddingTop: Spacing.three,
  },
  map: { height: PERSON_MAP_HEIGHT, borderRadius: Spacing.four, overflow: 'hidden' },
  liveCard: { gap: Spacing.half, padding: Spacing.three },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pressed: { opacity: 0.6 },
  dimmed: { opacity: 0.45 },
});
