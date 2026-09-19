import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, ZoomIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { factTiles } from '@/services/flight-facts';
import { hasLanded, type FlightFacts, type TravelStage } from '@/services/travel-day';

/**
 * Gate, terminal, check-in and boarding as their own strip high on a trip
 * page — right under the map, above the flight — so they are what the
 * traveller sees the moment the page opens, not something inside a card to
 * expand. A tracked flight with nothing posted yet says where they will
 * appear; a journal trip with no feed shows nothing.
 */
export function FlightFactsStrip({
  facts,
  stage,
  departureZone,
  tracked,
}: {
  facts: FlightFacts;
  stage: TravelStage | null;
  departureZone: string | null;
  /** A looked-up flight, whose facts come from the airport's feed. */
  tracked: boolean;
}) {
  const theme = useTheme();
  // What is already known when the page opens is simply there; the pop-in
  // is for a gate or delay that lands while the page is on screen.
  const [quiet, setQuiet] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setQuiet(false), 600);
    return () => clearTimeout(timer);
  }, []);
  const tiles = factTiles(facts, stage, departureZone);

  if (!tiles.length) {
    // Nothing to wait for once the flight has left.
    return tracked && stage !== 'departed' && !hasLanded(stage) ? (
      <ThemedText type="small" themeColor="textSecondary" style={styles.waiting}>
        Gate, terminal and check-in appear here as the airport posts them.
      </ThemedText>
    ) : null;
  }
  return (
    <View style={styles.row}>
      {tiles.map((tile) => (
        <Animated.View
          key={tile.label}
          entering={quiet ? undefined : ZoomIn.springify().damping(16)}
          layout={LinearTransition.springify().damping(18)}
          style={styles.cell}>
          <ThemedView type="backgroundElement" style={[styles.tile, { borderColor: theme.hairline }]}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {tile.label}
            </ThemedText>
            <ThemedText
              themeColor="heading"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.value, tile.tone === 'danger' && { color: theme.danger }]}>
              {tile.value}
            </ThemedText>
          </ThemedView>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // Up to three to a line, each as wide as the line allows.
  cell: {
    flexGrow: 1,
    flexBasis: '28%',
  },
  tile: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    gap: Spacing.half,
  },
  value: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 800,
  },
  waiting: {
    paddingHorizontal: Spacing.one,
  },
});
