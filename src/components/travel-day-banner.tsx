import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

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
        <View style={styles.spacedRow}>
          <ThemedText type="smallBold" style={styles.microLabel}>
            {phase === 'live' ? 'Travel day' : 'Departs tomorrow'}
          </ThemedText>
          {phase === 'live' && <LiveDot />}
        </View>

        <View style={styles.bodyRow}>
          <View style={styles.body}>
            <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
              {content.title}
            </ThemedText>
            <ThemedText type="small" style={styles.subtitle} numberOfLines={1}>
              {content.subtitle}
            </ThemedText>
          </View>
          {/* Same disclosure affordance as the stats footer — this opens a screen. */}
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            tintColor={WHITE_DIM}
          />
        </View>

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

        {(content.gate || content.delayLabel) && (
          <ThemedText type="small" style={styles.factLine} numberOfLines={1}>
            {[
              content.gate ? `Gate ${content.gate}` : null,
              content.terminal ? `Terminal ${content.terminal}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        )}
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
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    color: WHITE,
    fontSize: 18,
    lineHeight: 24,
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
