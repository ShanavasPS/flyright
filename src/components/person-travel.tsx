import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AirlineLogo } from '@/components/airline-logo';
import { LayoverMark } from '@/components/layover-mark';
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
import { cityOf } from '@/services/timeline';
import { layoverLabel } from '../../convex/itineraryShared';

import {
  connectionBetween,
  connectionLabel,
  connectionsInto,
  legInstant,
  onwardLine,
  scheduledProgress,
  splitByItinerary,
} from '@/services/connections';
import {
  followerStatus,
  liveTimes,
  movedClocks,
  sessionProgress,
  spanLabel,
  tripDone,
} from '@/services/public-session';

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

/** A connecting leg after the live one, as the server whitelists it. */
export type OnwardLegView = {
  journeyId: string;
  number: string;
  carrier: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
};

export type PersonTravelData = {
  live: { session: LiveSessionView; onward?: OnwardLegView[] } | null;
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
  const allLegs = [...p.upcoming, ...p.past].map((t) => ({ ...t, id: t.journeyId }));
  const links = connectionsInto(allLegs);
  const connections = links;
  // The journey under way is shown as one block: the live card, then each
  // remaining leg under it with the layover between — so those legs appear
  // there and only there, not again under Upcoming or Flown.
  const onwardAhead = (p.live?.onward ?? []).filter(
    (leg) => legInstant(leg.scheduledDeparture, leg.fromCode) > now.getTime(),
  );
  // The blue belongs to what the follower should look at now: the live leg
  // until it lands, then the leg that leaves next.
  const landed = !!p.live && tripDone(p.live.session, now);
  // Legs of the same journey already flown before the live one — the block
  // reads top to bottom as the trip happened: landed, landed, live, next.
  const priorLegs: PersonTrip[] = [];
  for (let id = liveJourneyId ? links.get(liveJourneyId)?.prevId : undefined; id; id = links.get(id)?.prevId) {
    const leg = allLegs.find((t) => t.id === id);
    if (!leg) break;
    priorLegs.unshift(leg);
  }
  const inLiveBlock = new Set([
    liveJourneyId,
    ...priorLegs.map((leg) => leg.journeyId),
    ...onwardAhead.map((leg) => leg.journeyId),
  ]);
  // Filed by itinerary, not by leg: a journey stays ahead until its last leg
  // departs, then moves to Flown whole — legs in flying order either way.
  // The server splits per leg; a connecting trip straddling now is re-filed
  // here, where both halves are in hand.
  const { upcoming, past } = splitByItinerary(
    [...p.upcoming, ...p.past].filter((t) => !inLiveBlock.has(t.journeyId)),
    now,
  );
  /** "2h 35m in London": from the arrival the airline now says (or the
   * previous leg's timetable) to the next leg's departure. */
  const jointBefore = (i: number): string | null => {
    const leg = onwardAhead[i]!;
    const from =
      i === 0 && p.live
        ? Date.parse(liveTimes(p.live.session).arrival)
        : legInstant(onwardAhead[i - 1]!.scheduledArrival, onwardAhead[i - 1]!.toCode);
    const gap = legInstant(leg.scheduledDeparture, leg.fromCode) - from;
    return Number.isFinite(gap) && gap > 0 ? `${layoverLabel(gap)} in ${cityOf(leg.fromCode)}` : null;
  };
  const trip = (t: PersonTrip, i: number, list: PersonTrip[]) => (
    <Fragment key={t.journeyId}>
      {(() => {
        const prev = list[i - 1];
        const joint = connectionBetween(connections, prev && { id: prev.journeyId }, { id: t.journeyId });
        return joint ? <LayoverMark label={connectionLabel(joint)} /> : null;
      })()}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.number || t.carrier}, ${t.fromCode} to ${t.toCode}`}
      disabled={!onOpenTrip}
      onPress={() => onOpenTrip?.(t.journeyId)}
      style={({ pressed }) => [dimFor?.(t.journeyId) && styles.dimmed, pressed && styles.pressed]}>
      <TripRow trip={t} now={now} badge={badgeFor?.(t.journeyId)} />
    </Pressable>
    </Fragment>
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

      {/* Legs of this journey already behind them, in black, each joined to
          the next by its layover — so the live card below is read as one
          stop on a longer trip. */}
      {p.live &&
        priorLegs.map((leg, i) => {
          const joint = links.get(i + 1 < priorLegs.length ? priorLegs[i + 1]!.journeyId : liveJourneyId!);
          return (
            <Fragment key={leg.journeyId}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${leg.number || leg.carrier}, ${leg.fromCode} to ${leg.toCode}, landed`}
                disabled={!onOpenTrip}
                onPress={() => onOpenTrip?.(leg.journeyId)}
                style={({ pressed }) => pressed && styles.pressed}>
                <TripRow trip={leg} now={now} eyebrow="Landed" eyebrowTone="heading" progress={1} />
              </Pressable>
              {joint && <LayoverMark label={connectionLabel(joint)} />}
            </Fragment>
          );
        })}
      {p.live && (
        <LiveNow
          session={p.live.session}
          // The remaining legs are drawn as rows right below, so the card
          // itself doesn't also describe the connection.
          onward={[]}
          now={now}
          onPress={liveJourneyId && onOpenTrip ? () => onOpenTrip(liveJourneyId) : undefined}
        />
      )}
      {/* The rest of the journey under way: each remaining leg under the
          live card, the layover between, and how long until it leaves —
          the one line a follower at the other end wants to read. */}
      {p.live &&
        onwardAhead.map((leg, i) => {
          const joint = jointBefore(i);
          const untilMs = legInstant(leg.scheduledDeparture, leg.fromCode) - now.getTime();
          return (
            <Fragment key={leg.journeyId}>
              {joint && <LayoverMark label={joint} />}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${leg.number || leg.carrier}, ${leg.fromCode} to ${leg.toCode}, departs in ${spanLabel(untilMs)}`}
                disabled={!onOpenTrip}
                onPress={() => onOpenTrip?.(leg.journeyId)}
                style={({ pressed }) => pressed && styles.pressed}>
                <TripRow
                  trip={leg}
                  now={now}
                  eyebrow={`Departs in ${spanLabel(untilMs)}`}
                  eyebrowTone={landed && i === 0 ? 'tint' : 'heading'}
                  progress={scheduledProgress(leg, now)}
                />
              </Pressable>
            </Fragment>
          );
        })}

      <Section label="Upcoming" />
      {upcoming.length ? (
        upcoming.map(trip)
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          Nothing booked yet. You&apos;ll hear when {name} adds a trip.
        </ThemedText>
      )}
      {afterUpcoming}

      {p.past.length > 0 && (
        <>
          <Section label="Flown" />
          {past.map(trip)}
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
  onward,
  now,
  onPress,
}: {
  session: LiveSessionView;
  onward: OnwardLegView[];
  now: Date;
  onPress?: () => void;
}) {
  const connecting = onwardLine(session, onward, now);
  const theme = useTheme();
  const times = liveTimes(session);
  const { headline, detail, delayed } = followerStatus(session, now);
  // The headline IS the header: "DEPARTS IN 2H 6M", "LANDS IN 45M",
  // "LANDED 8:55 AM" — the one fact a follower is here for, in the card's
  // own voice. Blue while there is travelling left in it (amber once late),
  // black once landed so the eye moves on to the leg that departs next.
  const landed = tripDone(session, now);
  const labelColor = landed ? theme.heading : delayed ? theme.warning : theme.tint;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={styles.liveCard}>
        {/* The airline's mark in the same left column the trip rows keep, so
            the card and the legs under it read as one list. */}
        <AirlineLogo number={session.number} carrier={session.carrier} />
        <View style={styles.liveBody}>
        <View style={styles.liveHeader}>
          <View style={[styles.dot, { backgroundColor: labelColor }]} />
          <ThemedText type="smallBold" style={[styles.liveLabel, { color: labelColor }]}>
            {headline.toUpperCase()}
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
        {/* This leg isn't the end of the trip: where they change, how long
            they have, and the flight that takes them on. */}
        {connecting && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {connecting}
          </ThemedText>
        )}
        </View>
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
  liveCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  liveBody: { flex: 1, gap: Spacing.half },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  liveLabel: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pressed: { opacity: 0.6 },
  dimmed: { opacity: 0.45 },
});
