import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
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
import { getFlightFacts } from '@/services/travel-day-lifecycle';
import { useTravelDay } from '@/services/travel-day-store';

const LIVE_GREEN = '#2FD68C';
const DELAY_AMBER = '#F2B441';

/** The single hero at the top of My travels — one premium navy object per
 * screen. On a travel day (T−24h through landing) the live flight and the
 * all-time stats share one night-sky card: live section on top opening the
 * journey timeline, stats below opening Travel stats. Every other day the
 * plain stats card stands alone. */
export function HomeHero({
  journeys,
  stats,
}: {
  journeys: JourneyRow[];
  stats: TravelStats;
}) {
  const router = useRouter();
  const now = useNow(60_000);
  const active = activeJourney(journeys, now);
  // Hooks stay unconditional; an empty id just reads no row.
  const state = useTravelDay(active?.id ?? '');

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
        onPress={() => router.push({ pathname: '/journey/[id]', params: { id: active.id } })}
        style={({ pressed }) => [styles.liveSection, pressed && styles.pressed]}>
        {/* Boarding-pass header: the airline's mark top-left, status top-right. */}
        <View style={styles.spacedRow}>
          <AirlineLogo number={active.number} carrier={active.carrier} size={32} />
          <View style={styles.headerRight}>
            <ThemedText type="smallBold" style={styles.microLabel}>
              {phase === 'live' ? 'Travel day' : 'Departs tomorrow'}
            </ThemedText>
            {phase === 'live' && <LiveDot />}
          </View>
        </View>

        {/* The route is the centerpiece: big codes pinned to opposite edges,
         * times beneath, a dotted contrail with the plane mid-path between. */}
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
          <RoutePath delayed={content.emphasis === 'delay'} />
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

        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              {
                // Never fully empty — a sliver of contrail shows it's alive.
                width: `${Math.max(4, Math.round(content.progress * 100))}%`,
                backgroundColor: content.emphasis === 'delay' ? DELAY_AMBER : COBALT,
              },
            ]}
          />
        </View>

        <View style={styles.spacedRow}>
          <ThemedText type="small" style={styles.factLine} numberOfLines={1}>
            {[
              content.flightLabel,
              content.gate ? `Gate ${content.gate}` : null,
              content.terminal ? `Terminal ${content.terminal}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
          {/* Same disclosure affordance as the stats footer — this opens a screen. */}
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            tintColor={WHITE_DIM}
          />
        </View>
      </Pressable>

      {!!stats.trips && (
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
    </View>
  );
}

/** The dotted contrail joining the route codes, plane mid-path — the same
 * motif the Live Activity draws, so lock screen and hero read as one. */
function RoutePath({ delayed }: { delayed: boolean }) {
  const dots = (key: string) => (
    <View key={key} style={styles.routeDots}>
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={styles.routeDot} />
      ))}
    </View>
  );
  return (
    <View style={styles.routePath}>
      <View style={styles.routeEndDot} />
      {dots('out')}
      <SymbolView
        name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
        size={16}
        tintColor={delayed ? DELAY_AMBER : COBALT}
        style={Platform.OS === 'ios' ? undefined : styles.rotated}
      />
      {dots('in')}
      <View style={styles.routeEndDot} />
    </View>
  );
}

/** Pulsing "live" marker — the quiet heartbeat that says this card updates. */
function LiveDot() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 1000 }), -1, true);
  }, [pulse]);
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // Lift the path to the codes' midline — centering against the full
    // code+time endpoint block would sag it toward the time row.
    marginBottom: 20,
  },
  routeDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
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
    backgroundColor: WHITE_DIM,
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
  subtitle: {
    color: WHITE_DIM,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: WHITE_FAINT,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  factLine: {
    color: COBALT,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: WHITE_FAINT,
  },
});
