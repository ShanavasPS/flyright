import { Link, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { countdown, formatDayLabel, formatTime } from '@/services/dates';
import { useJourneys, type JourneyRow } from '@/services/journeys';

export function Journeys() {
  const router = useRouter();
  const { data: journeys } = useJourneys();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" themeColor="heading">
          Journeys
        </ThemedText>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search to add flights"
          onPress={() => router.push('/add-flight')}>
          <ThemedView type="backgroundElement" style={styles.searchBar}>
            <ThemedText themeColor="textSecondary">Search to add flights</ThemedText>
          </ThemedView>
        </Pressable>

        {journeys?.length ? (
          <FlatList
            data={journeys}
            keyExtractor={(row) => row.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <JourneyItem row={item} />}
          />
        ) : (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">No journeys yet</ThemedText>
            <ThemedText type="small">
              Add a flight and we&apos;ll watch it. The moment a delay makes you eligible
              for compensation, you&apos;ll know — and how much.
            </ThemedText>
            {/* Demo journey exercises the whole verdict flow without live data. */}
            <Link href="/journey/demo">
              <ThemedText type="link">See a demo verdict →</ThemedText>
            </Link>
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function JourneyItem({ row }: { row: JourneyRow }) {
  const timer = countdown(row.scheduledDeparture, new Date());

  return (
    <Link href={{ pathname: '/journey/[id]', params: { id: row.id } }} asChild>
      <Pressable>
        <ThemedView type="backgroundElement" style={styles.rowCard}>
          <View style={styles.timerColumn}>
            <ThemedText type="subtitle" themeColor="heading">
              {timer.value}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.timerUnit}>
              {timer.unit}
            </ThemedText>
          </View>
          <View style={styles.rowBody}>
            <ThemedText type="small" themeColor="textSecondary">
              {row.carrier} {row.number} · {formatDayLabel(row.scheduledDeparture)}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.route}>
              {row.fromCode} to {row.toCode}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatTime(row.scheduledDeparture)} → {formatTime(row.scheduledArrival)}
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
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
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
