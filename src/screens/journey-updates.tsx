import { useAuth } from '@clerk/expo';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { DataErrorState, LoadingState } from '@/components/data-state';
import { OwnUpdatesCard } from '@/components/own-updates-card';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useJourney } from '@/services/journeys';
import { useTravelDay } from '@/services/travel-day-store';

/** Every update the traveller has posted from one trip, opened from "See all"
 * on the trip page: the full list with the take-down and the names behind
 * each heart, on a screen of its own so the back button returns to the trip. */
export function JourneyUpdates({ journeyId }: { journeyId: string }) {
  const { userId } = useAuth();
  const { row, loaded, error } = useJourney(journeyId, userId);
  const travel = useTravelDay(journeyId);
  // "2h ago" labels and the sharing window move with the clock.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <DataErrorState error={error} />;
  if (!loaded) return <LoadingState />;
  if (!row) return null;
  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        <OwnUpdatesCard row={row} travel={travel} now={now} full />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
  },
});
