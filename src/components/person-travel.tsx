import { Pressable, StyleSheet, View } from 'react-native';

import { RouteAtlas } from '@/components/route-atlas';
import { RouteLeg } from '@/components/route-leg';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { TripRow } from '@/components/trip-row';
import { mapColors } from '@/components/world-map';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { PublicSession } from '../../convex/liveShared';

import type { RouteSource } from '@/services/geo';
import { followerStatus, liveTimes, movedClocks, sessionProgress } from '@/services/public-session';

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

/** The live session as a follower is shown it — the server's public
 * whitelist, which is exactly what the card and its countdown read. */
export type LiveSessionView = PublicSession;

export type PersonTravelData = {
  live: { session: LiveSessionView } | null;
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
  const { sea } = mapColors(useColorScheme() === 'dark');
  const routes = routesOf(p);
  const { liveJourneyId } = p;
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
        <LiveNow
          session={p.live.session}
          now={now}
          onPress={liveJourneyId && onOpenTrip ? () => onOpenTrip(liveJourneyId) : undefined}
        />
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

/** The trip in flight, as a follower reads it: the stage, then the leg with
 * the clocks the airline now says, and how long until it leaves or lands. */
function LiveNow({
  session,
  now,
  onPress,
}: {
  session: LiveSessionView;
  now: Date;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const times = liveTimes(session);
  const { headline, detail, delayed } = followerStatus(session, now);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={styles.liveCard}>
        <View style={styles.liveHeader}>
          <View style={[styles.dot, { backgroundColor: theme.tint }]} />
          <ThemedText type="smallBold" style={[styles.liveLabel, { color: theme.tint }]}>
            TRAVELLING NOW
          </ThemedText>
          {/* "Departs in 2h 15m", "Lands in 45m", "Landed 8:55" — the
              header's right slot, where the journal's rows keep their
              countdown too. */}
          <ThemedText
            type="smallBold"
            themeColor="heading"
            style={delayed && { color: theme.warning }}>
            {headline}
          </ThemedText>
        </View>
        {detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        )}
        {/* The plane where the flight is, the timetable struck through under
            a moved clock, and the landing time on the reader's own clock —
            the traveller's hero, read from the other end. */}
        <RouteLeg
          progress={sessionProgress(session, now)}
          yourTime
          leg={{
            fromCode: session.fromCode,
            toCode: session.toCode,
            ...times,
            ...movedClocks(session),
          }}
        />
      </SheenCard>
    </Pressable>
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
  liveLabel: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pressed: { opacity: 0.6 },
  dimmed: { opacity: 0.45 },
});
