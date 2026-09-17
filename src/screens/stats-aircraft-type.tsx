import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DataErrorState, LoadingState } from '@/components/data-state';
import { SheenCard } from '@/components/sheen-card';
import { AircraftCard, CodeChips, FlightRow, ListHeadline } from '@/components/stats-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useJourneys } from '@/services/journeys';
import { aircraftRanks, makerRanks, plural, rankFlights } from '@/services/travel-recap';

/** Behind a type in the Aircraft list: the type's card, the airframes the
 * traveller has actually sat in (by registration, most flown first), and
 * every flight flown on the type, newest first, each opening its trip. */
export function StatsAircraftType({ model }: { model: string }) {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const [now] = useState(() => new Date());
  const flights = useMemo(
    () => rankFlights(rows.filter((row) => row.aircraftModel?.trim() === model), 'newest'),
    [rows, model],
  );
  const type = useMemo(() => aircraftRanks(flights).find((t) => t.model === model) ?? null, [flights, model]);
  const makers = useMemo(() => (type ? makerRanks([type]) : []), [type]);
  // Registrations, most flown first; a flight the provider gave no
  // registration for still counts for the type, just not for an airframe.
  const airframes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of flights) if (row.aircraftReg) counts.set(row.aircraftReg, (counts.get(row.aircraftReg) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([reg]) => reg);
  }, [flights]);

  if (error) return <DataErrorState error={error} />;
  if (!journeys) return <LoadingState />;

  if (!type) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          No flights on this aircraft any more.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        <AircraftCard type={type} makers={makers} totalFlights={type.flights} label={type.maker} compact />
        {airframes.length > 0 && (
          <SheenCard style={styles.airframes}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
              {airframes.length === 1 ? 'The aircraft' : `${airframes.length} different aircraft`}
            </ThemedText>
            <CodeChips codes={airframes} strong={airframes.length > 1 ? airframes[0] : null} />
            <ThemedText type="small" themeColor="textSecondary">
              {airframes.length === 1
                ? `Registration ${airframes[0]} — every flight on this type was this one airframe.`
                : `By registration, the one you've flown most first.`}
            </ThemedText>
          </SheenCard>
        )}
        <View style={styles.headline}>
          <ListHeadline headline={plural(flights.length, 'flight')} detail="Newest first" />
        </View>
        {flights.map((row) => (
          <FlightRow
            key={row.id}
            row={row}
            now={now}
            badge={row.aircraftReg}
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
  empty: {
    padding: Spacing.four,
    textAlign: 'center',
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
  airframes: {
    gap: Spacing.one,
  },
  caps: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headline: {
    marginTop: Spacing.one,
  },
});
