import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { DataErrorState, LoadingState } from '@/components/data-state';
import { SegmentTabs } from '@/components/segment-tabs';
import { FlightRow, ListHeadline, RecordCard } from '@/components/stats-cards';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useJourneys } from '@/services/journeys';
import { formatKm, travelStats } from '@/services/timeline';
import { plural, rankFlights, type FlightSort } from '@/services/travel-recap';

const TABS: { key: FlightSort; label: string }[] = [
  { key: 'distance', label: 'Longest' },
  { key: 'duration', label: 'In the air' },
  { key: 'newest', label: 'Newest' },
];

const TAG: Record<FlightSort, string> = {
  distance: 'Longest',
  duration: 'Longest in the air',
  newest: 'Latest',
};

/** Behind the record card: every flight, ranked by distance, time in the
 * air or date. The leader keeps the globe strip; the rest are compact legs
 * with the airline's mark, the number and day, and the distance. */
export function StatsFlights() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const [sort, setSort] = useState<FlightSort>('distance');
  const [now] = useState(() => new Date());
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const ranked = useMemo(() => rankFlights(rows, sort), [rows, sort]);
  const totals = useMemo(() => travelStats(rows), [rows]);

  if (error) return <DataErrorState error={error} />;
  if (!journeys) return <LoadingState />;

  const [first, ...rest] = ranked;
  const days = totals.hoursAloft / 24;
  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        <ListHeadline
          headline={plural(ranked.length, 'flight')}
          detail={`${formatKm(totals.totalKm)} km${totals.hoursAloft > 0 ? ` · ${totals.hoursEstimated ? '≈ ' : ''}${days >= 1 ? `${days.toFixed(1)} days` : `${Math.round(totals.hoursAloft)} h`} aloft` : ''}`}
        />
        <SegmentTabs tabs={TABS} value={sort} onChange={setSort} />
        {first && (
          <RecordCard
            row={first}
            tag={TAG[sort]}
            onPress={() => router.push({ pathname: '/journey/[id]', params: { id: first.id } })}
          />
        )}
        {rest.map((row, i) => (
          <FlightRow
            key={row.id}
            row={row}
            now={now}
            badge={`#${i + 2} · ${Math.round(row.distanceKm).toLocaleString()} km`}
            onPress={() => router.push({ pathname: '/journey/[id]', params: { id: row.id } })}
          />
        ))}
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
    gap: Spacing.two,
  },
});

