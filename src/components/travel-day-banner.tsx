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
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import type { JourneyRow } from '@/services/journeys';
import {
  activeJourney,
  liveContent,
  travelWindow,
} from '@/services/travel-day';
import { getFlightFacts } from '@/services/travel-day-lifecycle';
import { useTravelDay } from '@/services/travel-day-store';

// TravelStatsHeader is the night sky (all-time, memories); travel day is
// broad daylight. The card flips to the brand's two tint blues — deep action
// cobalt easing to day-sky blue low on the horizon — and the progress line
// reads as a white contrail across it. Fixed in both themes for the same
// reason as the stats card: it's the one live object on the page.
const DAY_SKY = 'linear-gradient(150deg, #1E6BE0 40%, #4E9BF5 100%)';
const WHITE = '#F2F6FB';
// Brighter ground than the navy cards, so dimmed text keeps more alpha here.
const WHITE_DIM = 'rgba(242,246,251,0.78)';
const WHITE_FAINT = 'rgba(242,246,251,0.22)';
const LIVE_GREEN = '#2FD68C';
const DELAY_AMBER = '#F2B441';

/** The travel-day moment at the top of My travels: appears T−24h before the
 * next flight, ticks through the stages, and opens the journey's live
 * timeline. Renders nothing when no trip is in its window. */
export function TravelDayBanner({ journeys }: { journeys: JourneyRow[] }) {
  const router = useRouter();
  const now = useNow(60_000);
  const active = activeJourney(journeys, now);
  // Hooks stay unconditional; an empty id just reads no row.
  const state = useTravelDay(active?.id ?? '');

  if (!active) return null;
  const { phase } = travelWindow(active, state, now);
  if (phase !== 'reminder' && phase !== 'live') return null;

  const facts = getFlightFacts(active.id);
  const content = liveContent(active, state, facts, now);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open travel day for ${content.title}`}
      testID="travel-day-banner"
      onPress={() => router.push({ pathname: '/journey/[id]', params: { id: active.id } })}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}>
      <View style={[styles.card, { experimental_backgroundImage: DAY_SKY }]}>
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
          {/* Same disclosure affordance as the stats card — this opens a screen. */}
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
                backgroundColor: content.emphasis === 'delay' ? DELAY_AMBER : WHITE,
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
      </View>
    </Pressable>
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
  wrapper: {
    marginBottom: Spacing.two,
  },
  pressed: {
    opacity: 0.9,
  },
  card: {
    gap: Spacing.two,
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
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  microLabel: {
    // Full white — dimmed tones lose too much contrast on the cobalt ground.
    color: WHITE,
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
    // White for legibility on cobalt; the pulsing dot carries the green.
    color: WHITE,
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
    color: WHITE,
  },
});
