import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AirlineLogo } from '@/components/airline-logo';
import { BORDER_WIDTH, RunningBorder } from '@/components/running-border';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { TravelStatsHeader, TravelStatsStrip } from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { formatTime } from '@/services/dates';
import type { JourneyRow } from '@/services/journeys';
import { cityOf, type TravelStats } from '@/services/timeline';
import {
  activeJourney,
  liveContent,
  travelWindow,
  type StagePlan,
  type TravelDayState,
  type TravelPhase,
} from '@/services/travel-day';
import { noteWarning, tapLight } from '@/services/haptics';
import { factsFor } from '@/services/travel-day-lifecycle';
import { stagePlans } from '@/services/travel-day-plan';
import { useTravelDayStates } from '@/services/travel-day-store';

const SPRING = { damping: 18, stiffness: 170 } as const;
/** The plane glyph's box on the route line — its travel is the line minus this. */
const PLANE_SIZE = 16;
/** The live card's corner radius — the running border traces it exactly. */
const BORDER_RADIUS = Spacing.four;

/** The trip the home hero is showing live, if any: the soonest flight inside
 * its travel window (T−24h through landing), with its stage state. One
 * answer for the screen and the hero both — the screen uses it to keep that
 * trip out of the list (the hero IS its row for the day) and to word the
 * eyebrow, so the same flight never shows up twice with two countdowns. */
export function useHeroTrip(
  journeys: JourneyRow[],
  now: Date,
): { journey: JourneyRow; phase: 'reminder' | 'live'; state: TravelDayState; plan: StagePlan } | null {
  // Selection needs every trip's real stamps: with the empty default, a
  // morning flight whose landed stamp already closed its window wins on
  // departure time, then fails the phase check below and collapses the hero
  // to plain stats while a later trip is genuinely live.
  const stateOf = useTravelDayStates();
  const planOf = useMemo(() => stagePlans(journeys), [journeys]);
  const active = activeJourney(journeys, now, stateOf, planOf);
  if (!active) return null;
  const state = stateOf(active.id);
  const plan = planOf(active.id);
  const phase: TravelPhase = travelWindow(active, state, now, plan).phase;
  if (phase !== 'reminder' && phase !== 'live') return null;
  return { journey: active, phase, state, plan };
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
  fallback,
}: {
  journeys: JourneyRow[];
  stats: TravelStats;
  /** 'glance' = the live card by itself, with no all-time strip under it.
   * The fold's top pane needs that (it must fit a half-screen without
   * scrolling) and so does Home, where the all-time card belongs to the
   * Flights tab next door and would otherwise appear on both. */
  variant?: 'full' | 'glance';
  /** What stands here on an ordinary day. The journal's answer is the navy
   * all-time card; Home's is its own, because the two tabs sit next to each
   * other and the same summary on both would read as one screen shown
   * twice. */
  fallback?: ReactNode;
}) {
  const router = useRouter();
  const theme = useTheme();
  const now = useNow(60_000);
  const hero = useHeroTrip(journeys, now);
  if (!hero) return <>{fallback ?? <TravelStatsHeader stats={stats} />}</>;
  const { journey: active, phase, state, plan } = hero;

  const facts = factsFor(active);
  const content = liveContent(active, state, facts, now, plan);
  const delayed = content.emphasis === 'delay';
  const statusColor = delayed ? theme.warning : theme.tint;
  const toneColor =
    content.tone === 'delay'
      ? theme.warning
      : content.tone === 'boarding' || content.tone === 'landed'
        ? theme.success
        : theme.tint;
  // What the ticket said, when the airline has moved a clock: struck through
  // under the time that now counts, as the trip screen and the rows do it.
  const depWas = movedFrom(active.scheduledDeparture, facts.estimatedDeparture, active.fromCode);
  const arrWas = movedFrom(active.scheduledArrival, facts.estimatedArrival, active.toCode);

  return (
    <View style={styles.stack}>
    {/* The border is the card's status: the brand's cobalt while the flight
        is running to plan, amber once the airline has posted a delay — the
        one colour cue a glance across the room can read. Once the flight is
        live, a light runs clockwise around it: the card is happening now. */}
    <SheenCard style={[styles.card, { borderColor: `${statusColor}59` }]}>
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
        {/* The airline's mark, and what state the card is in: the late
            chip while half an hour or more behind, the live dot. */}
        <View style={styles.spacedRow}>
          {/* Which flight, beside the airline's mark — the Lock Screen
              leaves it out for the clock's sake; here there is room. */}
          <View style={styles.flightId}>
            <AirlineLogo number={active.number} carrier={active.carrier} size={28} />
            <ThemedText type="smallBold" themeColor="heading" numberOfLines={1} style={styles.flightNumber}>
              {content.flightLabel}
            </ThemedText>
          </View>
          <View style={styles.headerRight}>
            {content.delayChip && (
              <View style={[styles.delayChip, { backgroundColor: `${theme.warning}1F` }]}>
                <ThemedText type="smallBold" style={{ color: theme.warning }}>
                  {content.delayChip}
                </ThemedText>
              </View>
            )}
            {phase === 'live' && <LiveDot />}
          </View>
        </View>

        {/* The one time fact, big, and the one place fact beside it — the
            same rule the Lock Screen card and the Dynamic Island follow
            (convex/liveShared.ts liveLead): terminal, then the check-in
            desk, the gate, the seat once on board, the belt after landing. */}
        <View style={styles.leadRow}>
          <View style={styles.clockBlock}>
            <View style={styles.clockLabelRow}>
              <SymbolView name={clockIcon(content.clockLabel)} size={12} tintColor={toneColor} />
              <ThemedText type="smallBold" style={[styles.clockLabel, { color: toneColor }]}>
                {content.clockLabel}
              </ThemedText>
            </View>
            <HeroClock
              end={content.countdownEnd}
              color={content.tone === 'delay' ? theme.warning : theme.heading}
              fallback={content.tone === 'landed' ? cityOf(active.toCode) : content.headline}
            />
          </View>
          {content.lead && (
            <View style={styles.leadFact}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.leadLabel}>
                {content.lead.label}
              </ThemedText>
              <ThemedText
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={[
                  styles.leadValue,
                  { color: content.tone === 'boarding' || content.tone === 'landed' ? theme.success : theme.heading },
                ]}>
                {content.lead.value}
              </ThemedText>
              {!!content.lead.sub && (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {content.lead.sub}
                </ThemedText>
              )}
            </View>
          )}
        </View>

        {/* The route as one line: the codes with the clocks the airline now
            says (the ticketed ones struck through when moved), and the
            contrail the plane flies as the flight goes. */}
        <View style={styles.routeRow}>
          <View style={styles.endpoint}>
            <ThemedText themeColor="heading" style={styles.code} numberOfLines={1}>
              {content.fromCode}
            </ThemedText>
            {!!content.depTime && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.codeTime}>
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
              <ThemedText type="small" themeColor="textSecondary" style={styles.codeTime}>
                {content.arrTime}
              </ThemedText>
            )}
            {arrWas && <MovedFrom clock={arrWas} />}
          </View>
        </View>

        <View style={[styles.footerRow, { borderTopColor: theme.hairline }]}>
          {/* The pass, one tap from the home screen on the day: the gate
              is where a hand reaches for the phone (screens/boarding-pass). */}
          {!!active.passCode && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show boarding pass"
              testID="hero-boarding-pass"
              hitSlop={Spacing.one}
              onPress={() => {
                tapLight();
                trackEvent('boarding_pass_opened', { from: 'home' });
                router.push({ pathname: '/boarding-pass', params: { journeyId: active.id } });
              }}
              style={({ pressed }) => [
                styles.passPill,
                { backgroundColor: `${theme.tint}1A`, opacity: pressed ? 0.7 : 1 },
              ]}>
              <SymbolView
                name={{ ios: 'qrcode', android: 'qr_code_2', web: 'qr_code_2' }}
                size={14}
                tintColor={theme.tint}
              />
              <ThemedText type="smallBold" style={[styles.passPillText, { color: theme.tint }]}>
                Pass
              </ThemedText>
            </Pressable>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.openTrip}>
            Open trip
          </ThemedText>
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
      <RunningBorder color={statusColor} radius={BORDER_RADIUS} running={phase === 'live'} />
    </SheenCard>
    {variant === 'full' && <TravelStatsStrip stats={stats} />}
    </View>
  );
}

/** The clock label's glyph: the take-off until the wheels are up, the
 * landing in the air, a tick once down. */
function clockIcon(label: string): SymbolViewProps['name'] {
  if (label.startsWith('LANDS')) return { ios: 'airplane.arrival', android: 'flight_land', web: 'flight_land' };
  if (label.startsWith('LANDED')) return { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' };
  return { ios: 'airplane.departure', android: 'flight_takeoff', web: 'flight_takeoff' };
}

/** The big countdown, hours and minutes ("2:14", "0:42") with the units
 * marked under the digits so "0:42" never reads as seconds, and the seconds
 * ticking small beside them — as the trip page and the Lock Screen show it.
 * Once the moment has passed (or there is none) it shows the fallback words
 * instead of a frozen 0:00. */
function HeroClock({ end, color, fallback }: { end: number | null; color: string; fallback: string }) {
  const now = useNow(1_000);
  const left = end === null ? NaN : end - now.getTime();
  if (!(left > 0)) {
    return (
      <ThemedText numberOfLines={1} adjustsFontSizeToFit style={[styles.clockWords, { color }]}>
        {fallback}
      </ThemedText>
    );
  }
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor(left / 1000) % 60;
  const clock = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  return (
    <View
      accessible
      accessibilityLabel={`${Math.floor(minutes / 60)} hours ${minutes % 60} minutes`}
      style={styles.clockRow}>
      <View>
        <ThemedText style={[styles.clock, { color }]}>{clock}</ThemedText>
        <View style={styles.clockUnits}>
          <ThemedText themeColor="textSecondary" style={styles.clockUnit}>
            HRS
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.clockUnit}>
            MIN
          </ThemedText>
        </View>
      </View>
      <ThemedText themeColor="textSecondary" style={styles.clockSeconds}>
        :{String(seconds).padStart(2, '0')}
      </ThemedText>
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
  // Sized to the all-time summary card it replaces on a travel day, so the
  // hero is one shape every day and only its content swaps. SheenCard's
  // Spacing.four padding is the single biggest saving; the clock below is the
  // other. Nothing is dropped — the rows are the same rows, tighter.
  card: {
    overflow: 'hidden',
    borderWidth: BORDER_WIDTH,
    padding: Spacing.three,
  },
  liveSection: {
    gap: Spacing.two - 2,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontSize: 10,
    lineHeight: 13,
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
  // The route is the supporting line now; the clock and the fact lead.
  code: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: 800,
    letterSpacing: 0.5,
  },
  flightId: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  flightNumber: {
    fontSize: 14,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  delayChip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 2,
  },
  leadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  // The clock keeps its width; a long fact beside it shrinks instead.
  clockBlock: {
    flexShrink: 0,
    gap: Spacing.one,
  },
  clockLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  clockLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.4,
  },
  clock: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: 800,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  clockSeconds: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  clockWords: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  clockUnits: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: -6,
  },
  clockUnit: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: 700,
    letterSpacing: 1,
  },
  leadFact: {
    flex: 1,
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  leadLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.3,
  },
  leadValue: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: 800,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  openTrip: {
    flex: 1,
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
  passPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
  },
  passPillText: {
    fontSize: 13,
    lineHeight: 18,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
