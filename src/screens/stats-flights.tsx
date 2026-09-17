import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { AirlineLogo } from '@/components/airline-logo';
import { DataErrorState, LoadingState } from '@/components/data-state';
import { RouteLeg } from '@/components/route-leg';
import { SegmentTabs } from '@/components/segment-tabs';
import { SheenCard } from '@/components/sheen-card';
import { ListHeadline, RankRow, RecordCard } from '@/components/stats-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { airportZone } from '@/services/airports';
import { formatDayLabelWithYear } from '@/services/dates';
import { useJourneys, type JourneyRow } from '@/services/journeys';
import { airlineOf, formatKm, travelStats } from '@/services/timeline';
import { formatMinutes, plural, rankFlights, rowMinutes, type FlightSort } from '@/services/travel-recap';

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
        {rest.length > 0 && (
          <SheenCard style={styles.rows}>
            {rest.map((row, i) => (
              <FlightRow
                key={row.id}
                row={row}
                rank={i + 2}
                last={i === rest.length - 1}
                onPress={() => router.push({ pathname: '/journey/[id]', params: { id: row.id } })}
              />
            ))}
          </SheenCard>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function FlightRow({
  row,
  rank,
  last,
  onPress,
}: {
  row: JourneyRow;
  rank: number;
  last: boolean;
  onPress: () => void;
}) {
  const minutes = rowMinutes(row);
  const airline = airlineOf(row);
  const when = formatDayLabelWithYear(row.scheduledDeparture, airportZone(row.fromCode));
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <RankRow
        rank={rank}
        lead={<AirlineLogo number={row.number} carrier={row.carrier} size={36} />}
        value={`${Math.round(row.distanceKm).toLocaleString()} km`}
        caption={minutes ? formatMinutes(minutes) : undefined}
        last={last}>
        <RouteLeg
          compact
          leg={{
            fromCode: row.fromCode,
            toCode: row.toCode,
            departure: row.scheduledDeparture,
            arrival: row.scheduledArrival,
            distanceKm: row.distanceKm,
          }}
        />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {[row.number || airline, when].filter(Boolean).join(' · ')}
        </ThemedText>
      </RankRow>
    </Pressable>
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
  rows: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
});

