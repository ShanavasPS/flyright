import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AirlineLogo } from '@/components/airline-logo';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { TravelStatsHeader, TravelStatsStrip } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { formatTime } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';
import type { TravelStats } from '@/services/timeline';
import {
  activeJourney,
  liveContent,
  travelWindow,
  type TravelDayState,
  type TravelPhase,
} from '@/services/travel-day';
import { noteWarning, tapLight } from '@/services/haptics';
import { getFlightFacts } from '@/services/travel-day-lifecycle';
import { useTravelDayStates } from '@/services/travel-day-store';

const SPRING = { damping: 18, stiffness: 170 } as const;
/** The plane glyph's box on the route line — its travel is the line minus this. */
const PLANE_SIZE = 16;

/** The trip the home hero is showing live, if any: the soonest flight inside
 * its travel window (T−24h through landing), with its stage state. One
 * answer for the screen and the hero both — the screen uses it to keep that
 * trip out of the list (the hero IS its row for the day) and to word the
 * eyebrow, so the same flight never shows up twice with two countdowns. */
export function useHeroTrip(
  journeys: JourneyRow[],
  now: Date,
): { journey: JourneyRow; phase: 'reminder' | 'live'; state: TravelDayState } | null {
  // Selection needs every trip's real stamps: with the empty default, a
  // morning flight whose landed stamp already closed its window wins on
  // departure time, then fails the phase check below and collapses the hero
  // to plain stats while a later trip is genuinely live.
  const stateOf = useTravelDayStates();
  const active = activeJourney(journeys, now, stateOf);
  if (!active) return null;
  const state = stateOf(active.id);
  const phase: TravelPhase = travelWindow(active, state, now).phase;
  if (phase !== 'reminder' && phase !== 'live') return null;
  return { journey: active, phase, state };
}

/** The hero at the top of My travels. Every ordinary day it is the navy
 * all-time stats card. On a travel day (T−24h through landing) the live
 * flight takes the top of the screen as a light card — the trip rows'
 * surface, since it is today's trip — and the stats step down to a one-line
 * strip beneath it that keeps the navy, so the summary wears the same colour
 * every day and nobody has to relearn which card is which. Sharing a single
 * card used to read as one confusing object: lifetime kilometres under a
 * boarding pass. */
export function HomeHero({
  journeys,
  stats,
  variant = 'full',
}: {
  journeys: JourneyRow[];
  stats: TravelStats;
  /** 'glance' = the tabletop (Flex mode) top pane: live card only, no
   * stats strip — it must fit a half-screen without scrolling. */
  variant?: 'full' | 'glance';
}) {
  const router = useRouter();
  const theme = useTheme();
  const now = useNow(60_000);
  const hero = useHeroTrip(journeys, now);
  if (!hero) return <TravelStatsHeader stats={stats} />;
  const { journey: active, phase, state } = hero;

  const facts = getFlightFacts(active.id);
  const content = liveContent(active, state, facts, now);
  const delayed = content.emphasis === 'delay';
  // What the ticket said, when the airline has moved a clock: struck through
  // under the time that now counts, as the trip screen and the rows do it.
  const depWas = movedFrom(active.scheduledDeparture, facts.estimatedDeparture, active.fromCode);
  const arrWas = movedFrom(active.scheduledArrival, facts.estimatedArrival, active.toCode);

  return (
    <View style={styles.stack}>
    {/* The border is the card's status: the brand's cobalt while the flight
        is running to plan, amber once the airline has posted a delay — the
        one colour cue a glance across the room can read. */}
    <SheenCard style={[styles.card, { borderColor: delayed ? theme.warning : theme.tint }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open travel day for ${content.title}`}
        testID="travel-day-banner"
        onPress={() =>
          router.push({
            pathname: '/journey/[id]',
            params: { id: active.id, from: active.fromCode, to: active.toCode },
          })
        }
        style={({ pressed }) => [styles.liveSection, pressed && styles.pressed]}>
        {/* Boarding-pass header: the airline's mark top-left, status top-right. */}
        <View style={styles.spacedRow}>
          <AirlineLogo number={active.number} carrier={active.carrier} size={32} />
          <View style={styles.headerRight}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.microLabel}>
              {content.headline}
            </ThemedText>
            {phase === 'live' && <LiveDot />}
          </View>
        </View>

        {/* The route is the centerpiece: big codes pinned to opposite edges,
         * times beneath, a dotted contrail between them that doubles as the
         * flight's progress bar — the plane waits at the origin until
         * take-off, then flies the line to the destination. */}
        <View style={styles.routeRow}>
          <View style={styles.endpoint}>
            <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
              {content.fromCode}
            </ThemedText>
            {!!content.depTime && (
              <ThemedText
                type={depWas ? 'smallBold' : 'small'}
                themeColor="textSecondary"
                style={[styles.codeTime, depWas && delayed && { color: theme.warning }]}>
                {content.depTime}
              </ThemedText>
            )}
            {depWas && <MovedFrom clock={depWas} />}
          </View>
          <RoutePath progress={content.progress} delayed={delayed} />
          <View style={[styles.endpoint, styles.endpointRight]}>
            <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
              {content.toCode}
            </ThemedText>
            {!!content.arrTime && (
              <ThemedText
                type={arrWas ? 'smallBold' : 'small'}
                themeColor="textSecondary"
                style={[styles.codeTime, arrWas && delayed && { color: theme.warning }]}>
                {content.arrTime}
              </ThemedText>
            )}
            {arrWas && <MovedFrom clock={arrWas} />}
          </View>
        </View>

        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {content.subtitle}
        </ThemedText>

        <View style={styles.spacedRow}>
          {/* Re-keying on gate/terminal makes fresh airport news slide in
           * instead of silently repainting. */}
          <Animated.View
            key={`${content.gate ?? '·'}-${content.terminal ?? '·'}`}
            entering={FadeInDown.duration(300)}
            style={styles.factWrap}>
            <ThemedText type="smallBold" style={{ color: theme.tint }} numberOfLines={1}>
              {[
                content.flightLabel,
                content.gate ? `Gate ${content.gate}` : null,
                content.terminal ? `Terminal ${content.terminal}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </Animated.View>
          {/* Same disclosure affordance as the stats footer — this opens a screen. */}
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            tintColor={theme.textSecondary}
          />
        </View>
      </Pressable>

      {/* Keyed by journey so a hero handover never inherits the previous
       * flight's delay/gate memory and false-flashes. */}
      <StatusFlash key={active.id} delayLabel={content.delayLabel} gate={content.gate} />
    </SheenCard>
    {variant === 'full' && <TravelStatsStrip stats={stats} />}
    </View>
  );
}

/** The ticketed clock, formatted in its airport's zone, when the airline's
 * estimate has moved it to a different minute — null while they agree, so
 * nothing is struck through for a flight running to plan. */
function movedFrom(scheduled: string, estimated: string | null, code: string): string | null {
  if (!estimated) return null;
  const zone = airportZone(code);
  const was = formatTime(scheduled, zone);
  return was === formatTime(estimated, zone) ? null : was;
}

/** What the ticket said before the airline moved the flight — struck through
 * and quiet under the live clock, so a traveller who wrote 11:30 in their
 * calendar can see we know it said 11:30. */
function MovedFrom({ clock }: { clock: string }) {
  return (
    <ThemedText
      type="small"
      themeColor="textSecondary"
      style={styles.codeTimeWas}
      numberOfLines={1}
      accessibilityLabel={`Moved from ${clock}`}>
      {clock}
    </ThemedText>
  );
}

/** Status changes should land, not repaint: a new or grown delay washes the
 * card amber once with a warning haptic; a gate change gets a light tick (the
 * fact line's re-entry handles the visual). Mount is silent — old news. */
function StatusFlash({ delayLabel, gate }: { delayLabel: string | null; gate: string | null }) {
  const wash = useSharedValue(0);
  const prevDelay = useRef(delayLabel);
  const prevGate = useRef(gate);

  useEffect(() => {
    if (delayLabel && delayLabel !== prevDelay.current) {
      wash.value = withSequence(
        withTiming(0.16, { duration: 250 }),
        withTiming(0, { duration: 700 }),
      );
      noteWarning();
    }
    prevDelay.current = delayLabel;
  }, [delayLabel, wash]);

  useEffect(() => {
    if (gate && gate !== prevGate.current) tapLight();
    prevGate.current = gate;
  }, [gate]);

  const theme = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: wash.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wash, { backgroundColor: theme.warning }, style]}
    />
  );
}

/** The dotted contrail joining the route codes, with the plane riding it as
 * the flight-progress indicator — the same motif the Live Activity draws, so
 * lock screen and hero read as one. The flown part turns solid behind the
 * plane; the first measurement snaps, later changes spring. */
function RoutePath({ progress, delayed }: { progress: number; delayed: boolean }) {
  const [width, setWidth] = useState(0);
  const planeX = useSharedValue(0);
  const settled = useRef(false);
  const travel = Math.max(0, width - PLANE_SIZE);

  useEffect(() => {
    if (!width) return;
    const target = progress * travel;
    if (!settled.current) {
      settled.current = true;
      planeX.value = target;
      return;
    }
    planeX.value = withSpring(target, SPRING);
  }, [width, progress, travel, planeX]);

  const planeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: planeX.value }] }));
  const flownStyle = useAnimatedStyle(() => ({ width: planeX.value + PLANE_SIZE / 2 }));
  const theme = useTheme();
  const tint = delayed ? theme.warning : theme.tint;

  return (
    <View style={styles.routePath} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.routeDots}>
        {Array.from({ length: 9 }, (_, i) => (
          <View
            key={i}
            style={[
              styles.routeDot,
              { backgroundColor: theme.textSecondary },
              (i === 0 || i === 8) && styles.routeEndDot,
            ]}
          />
        ))}
      </View>
      <Animated.View style={[styles.routeFlown, { backgroundColor: tint }, flownStyle]} />
      <Animated.View style={[styles.plane, planeStyle]}>
        <SymbolView
          name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
          size={PLANE_SIZE}
          tintColor={tint}
          style={Platform.OS === 'ios' ? undefined : styles.rotated}
        />
      </Animated.View>
    </View>
  );
}

/** Pulsing "live" marker — the quiet heartbeat that says this card updates. */
function LiveDot() {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(0.35, { duration: 1000 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);
  const theme = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.liveRow}>
      <Animated.View style={[styles.liveDot, { backgroundColor: theme.success }, style]} />
      <ThemedText type="smallBold" style={[styles.liveLabel, { color: theme.success }]}>
        Live
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.9,
  },
  stack: {
    gap: Spacing.two,
  },
  // The wash overlay is clipped to the rounded corners; SheenCard supplies
  // the surface, border and radius.
  card: {
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  liveSection: {
    gap: Spacing.two,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  microLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  liveLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  routeRow: {
    flexDirection: 'row',
    // Top-aligned so the path sits on the codes' midline however many clock
    // lines hang under them (a moved flight shows two).
    alignItems: 'flex-start',
    gap: Spacing.three,
    marginTop: Spacing.one,
    // On wide windows (tablet, unfolded foldable) an unclamped contrail
    // strands the airport codes at the card's far edges — cap the route to a
    // boarding-pass-plausible width. No-op on phones.
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  endpoint: {
    gap: Spacing.half,
  },
  endpointRight: {
    alignItems: 'flex-end',
  },
  code: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 700,
    letterSpacing: 1,
  },
  codeTime: {
    fontVariant: ['tabular-nums'],
  },
  codeTimeWas: {
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'line-through',
  },
  routePath: {
    flex: 1,
    height: PLANE_SIZE,
    justifyContent: 'center',
    // (40pt code line − 16pt plane) / 2: the path on the codes' midline.
    marginTop: 12,
  },
  routeDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.55,
  },
  routeEndDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 1,
  },
  routeFlown: {
    position: 'absolute',
    left: 0,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
  plane: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PLANE_SIZE,
    height: PLANE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
  factWrap: {
    flexShrink: 1,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
