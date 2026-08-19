import { useAuth } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelStatsHeader } from '@/components/travel-stats-header';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  countdown,
  formatDayLabel,
  formatDayLabelWithYear,
  formatTime,
} from '@/services/dates';
import { useJourneys, type JourneyRow } from '@/services/journeys';
import { groupJourneys, travelStats } from '@/services/timeline';

const YEAR_MS = 365 * 86_400_000;

export function Journeys() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);

  const now = new Date();
  const sections = useMemo(() => groupJourneys(journeys ?? [], now), [journeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => travelStats(journeys ?? []), [journeys]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" themeColor="heading">
          My travels
        </ThemedText>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Add a flight, past or future"
          onPress={() => router.push('/add-flight')}>
          <ThemedView type="backgroundElement" style={styles.searchBar}>
            <ThemedText themeColor="textSecondary">Add a flight — past or future</ThemedText>
          </ThemedView>
        </Pressable>

        {journeys?.length ? (
          <SectionList
            sections={sections}
            keyExtractor={(row) => row.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={<TravelStatsHeader stats={stats} />}
            renderSectionHeader={({ section }) => (
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
            )}
            renderItem={({ item }) => <JourneyItem row={item} now={now} />}
          />
        ) : (
          <Card>
            <ThemedText type="subtitle">Your travel journal</ThemedText>
            <ThemedText type="small">
              Log any flight — next month&apos;s trip or one from years back. Your travel
              history lives here, and if a delay ever makes you eligible for compensation,
              you&apos;ll know — and how much.
            </ThemedText>
            {/* Demo journey exercises the whole verdict flow without live data. */}
            <Link href="/journey/demo">
              <ThemedText type="link">See a demo verdict →</ThemedText>
            </Link>
          </Card>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

/** Journal entries only carry times the user typed: identical noon timestamps
 * are the "no times" placeholder (show distance), identical non-noon ones mean
 * a single entered time — never render a fabricated departure → arrival pair. */
function manualScheduleLabel(row: JourneyRow): string {
  const { scheduledDeparture: dep, scheduledArrival: arr } = row;
  if (dep === arr) {
    return dep.endsWith('T12:00:00')
      ? `${Math.round(row.distanceKm).toLocaleString()} km`
      : `${formatTime(dep)} · ${Math.round(row.distanceKm).toLocaleString()} km`;
  }
  return `${formatTime(dep)} → ${formatTime(arr)}`;
}

function JourneyItem({ row, now }: { row: JourneyRow; now: Date }) {
  // Recent and upcoming trips get the live countdown; older ones read like a
  // journal entry — a calendar tile and the full date.
  const isOld = now.getTime() - Date.parse(row.scheduledDeparture) > YEAR_MS;
  const departureDay = new Date(`${row.scheduledDeparture.slice(0, 10)}T12:00:00`);
  const timer = countdown(row.scheduledDeparture, now);

  return (
    <Link href={{ pathname: '/journey/[id]', params: { id: row.id } }} asChild>
      <Pressable>
        <ThemedView type="backgroundElement" style={styles.rowCard}>
          <View style={styles.timerColumn}>
            <ThemedText type="subtitle" themeColor="heading">
              {isOld ? departureDay.getDate() : timer.value}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.timerUnit}>
              {isOld
                ? departureDay.toLocaleDateString(undefined, { month: 'short' })
                : timer.unit}
            </ThemedText>
          </View>
          <View style={styles.rowBody}>
            <ThemedText type="small" themeColor="textSecondary">
              {row.carrier}
              {row.number ? ` ${row.number}` : ''} ·{' '}
              {isOld
                ? formatDayLabelWithYear(row.scheduledDeparture)
                : formatDayLabel(row.scheduledDeparture)}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.route}>
              {row.fromCode} to {row.toCode}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {row.source === 'manual'
                ? manualScheduleLabel(row)
                : `${formatTime(row.scheduledDeparture)} → ${formatTime(row.scheduledArrival)}`}
            </ThemedText>
          </View>
        </ThemedView>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  searchBar: {
    borderRadius: Spacing.four,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.two,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  timerColumn: {
    alignItems: 'center',
    minWidth: 56,
  },
  timerUnit: {
    textTransform: 'uppercase',
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  route: {
    fontSize: 16,
  },
});
