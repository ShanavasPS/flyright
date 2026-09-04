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
import { ThemedText } from '@/components/themed-text';
import {
  COBALT,
  NIGHT_SKY,
  TravelStatsBody,
  TravelStatsHeader,
  WHITE,
  WHITE_DIM,
  WHITE_FAINT,
} from '@/components/travel-stats-header';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import type { JourneyRow } from '@/services/journeys';
import type { TravelStats } from '@/services/timeline';
import {
  activeJourney,
  liveContent,
  travelWindow,
} from '@/services/travel-day';
import { noteWarning, tapLight } from '@/services/haptics';
import { getFlightFacts } from '@/services/travel-day-lifecycle';
import { useTravelDayStates } from '@/services/travel-day-store';

const LIVE_GREEN = '#2FD68C';
const DELAY_AMBER = '#F2B441';
const SPRING = { damping: 18, stiffness: 170 } as const;
/** The plane glyph's box on the route line — its travel is the line minus this. */
const PLANE_SIZE = 16;

/** The single hero at the top of My travels — one premium navy object per
 * screen. On a travel day (T−24h through landing) the live flight and the
 * all-time stats share one night-sky card: live section on top opening the
 * journey timeline, stats below opening Travel stats. Every other day the
 * plain stats card stands alone. */
export function HomeHero({
  journeys,
  stats,
  variant = 'full',
}: {
  journeys: JourneyRow[];
  stats: TravelStats;
  /** 'glance' = the tabletop (Flex mode) top pane: live section only, no
   * stats footer — it must fit a half-screen without scrolling. */
  variant?: 'full' | 'glance';
}) {
  const router = useRouter();
  const now = useNow(60_000);
  // Selection needs every trip's real stamps: with the empty default, a
  // morning flight whose landed stamp already closed its window wins on
  // departure time, then fails the phase check below and collapses the hero
  // to plain stats while a later trip is genuinely live.
  const stateOf = useTravelDayStates();
  const active = activeJourney(journeys, now, stateOf);
  const state = stateOf(active?.id ?? '');

  const phase = active ? travelWindow(active, state, now).phase : null;
  if (!active || (phase !== 'reminder' && phase !== 'live')) {
    return <TravelStatsHeader stats={stats} />;
  }

  const facts = getFlightFacts(active.id);
  const content = liveContent(active, state, facts, now);

  return (
    <View style={[styles.card, { experimental_backgroundImage: NIGHT_SKY }]}>
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
            <ThemedText type="smallBold" style={styles.microLabel}>
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
            <ThemedText style={styles.code} numberOfLines={1}>
              {content.fromCode}
            </ThemedText>
            {!!content.depTime && (
              <ThemedText type="small" style={styles.codeTime}>
                {content.depTime}
              </ThemedText>
            )}
          </View>
          <RoutePath progress={content.progress} delayed={content.emphasis === 'delay'} />
          <View style={[styles.endpoint, styles.endpointRight]}>
            <ThemedText style={styles.code} numberOfLines={1}>
              {content.toCode}
            </ThemedText>
            {!!content.arrTime && (
              <ThemedText type="small" style={styles.codeTime}>
                {content.arrTime}
              </ThemedText>
            )}
          </View>
        </View>

        <ThemedText type="small" style={styles.subtitle} numberOfLines={1}>
          {content.subtitle}
        </ThemedText>

        <View style={styles.spacedRow}>
          {/* Re-keying on gate/terminal makes fresh airport news slide in
           * instead of silently repainting. */}
          <Animated.View
            key={`${content.gate ?? '·'}-${content.terminal ?? '·'}`}
            entering={FadeInDown.duration(300)}
            style={styles.factWrap}>
            <ThemedText type="small" style={styles.factLine} numberOfLines={1}>
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
            tintColor={WHITE_DIM}
          />
        </View>
      </Pressable>

      {!!stats.trips && variant === 'full' && (
        <>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your travel stats"
            onPress={() => router.push('/stats')}
            style={({ pressed }) => pressed && styles.pressed}>
            <TravelStatsBody stats={stats} />
          </Pressable>
        </>
      )}

      {/* Keyed by journey so a hero handover never inherits the previous
       * flight's delay/gate memory and false-flashes. */}
      <StatusFlash key={active.id} delayLabel={content.delayLabel} gate={content.gate} />
    </View>
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

  const style = useAnimatedStyle(() => ({ opacity: wash.value }));
  return <Animated.View pointerEvents="none" style={[styles.wash, style]} />;
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
  const tint = delayed ? DELAY_AMBER : COBALT;

  return (
    <View style={styles.routePath} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.routeDots}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={[styles.routeDot, (i === 0 || i === 8) && styles.routeEndDot]} />
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
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.liveRow}>
      <Animated.View style={[styles.liveDot, style]} />
      <ThemedText type="smallBold" style={styles.liveLabel}>
        Live
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.9,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'rgba(242,246,251,0.08)',
    shadowColor: '#0B1520',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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
    color: WHITE_DIM,
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
    backgroundColor: LIVE_GREEN,
  },
  liveLabel: {
    color: LIVE_GREEN,
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
    alignItems: 'center',
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
    color: WHITE,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 700,
    letterSpacing: 1,
  },
  codeTime: {
    color: WHITE_DIM,
    fontVariant: ['tabular-nums'],
  },
  routePath: {
    flex: 1,
    height: PLANE_SIZE,
    justifyContent: 'center',
    // Lift the path to the codes' midline — centering against the full
    // code+time endpoint block would sag it toward the time row.
    marginBottom: 20,
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
    backgroundColor: WHITE_DIM,
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
  subtitle: {
    color: WHITE_DIM,
  },
  factWrap: {
    flexShrink: 1,
  },
  factLine: {
    color: COBALT,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Spacing.four,
    backgroundColor: DELAY_AMBER,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: WHITE_FAINT,
  },
});
