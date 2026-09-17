import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DataErrorState, LoadingState } from '@/components/data-state';
import {
  AircraftCard,
  AirlineCard,
  DestinationCard,
  MiniTile,
  RecordCard,
  SectionLink,
  StatsHero,
} from '@/components/stats-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useJourneys } from '@/services/journeys';
import { cityOf, travelRecap } from '@/services/timeline';
import {
  aircraftRanks,
  airlineRanks,
  destinationDetail,
  makerRanks,
  formatStars,
  plural,
} from '@/services/travel-recap';

/** The deep-dive behind the My travels summary card. A passport hero with
 * the totals, then three cards that each wear what they show and open the
 * list behind it — the record flight on the globe, the top destination
 * under its own sky, the most-flown airline in its own colour — and the
 * small facts as tiles. Everything comes from the same local journey rows. */
export function TravelStats() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const recap = useMemo(() => travelRecap(rows), [rows]);
  const airlines = useMemo(() => airlineRanks(rows), [rows]);
  const aircraft = useMemo(() => aircraftRanks(rows), [rows]);
  const makers = useMemo(() => makerRanks(aircraft), [aircraft]);
  const destination = useMemo(
    () => (recap.topDestination ? destinationDetail(rows, recap.topDestination.city) : null),
    [rows, recap.topDestination],
  );
  // Frozen per visit: the destination's sky is the hour it was when the
  // screen opened, not a clock that ticks over while reading.
  const [now] = useState(() => new Date());

  if (error) return <DataErrorState error={error} />;
  if (!journeys) return <LoadingState />;

  if (!recap.trips) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          Log a flight and your stats will start adding up here.
        </ThemedText>
      </ThemedView>
    );
  }

  const topAirline = airlines[0];
  const favourite = recap.favouriteAirline;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        <StatsHero
          totalKm={recap.totalKm}
          trips={recap.trips}
          hoursAloft={recap.hoursAloft}
          hoursEstimated={recap.hoursEstimated}
          countries={recap.countries}
          airports={recap.airports}
          since={recap.firstYear}
        />

        {recap.longest && (
          <>
            <SectionLink
              label="Longest flight"
              link="All flights"
              onPress={() => router.push('/stats/flights')}
            />
            <RecordCard row={recap.longest} tag="Longest" onPress={() => router.push('/stats/flights')} />
          </>
        )}

        {destination && (
          <>
            <SectionLink
              label="Top destination"
              link="All places"
              onPress={() => router.push('/stats/places')}
            />
            <DestinationCard destination={destination} now={now} onPress={() => router.push('/stats/places')} />
          </>
        )}

        {topAirline && (
          <>
            <SectionLink
              label="Most flown"
              link="All airlines"
              onPress={() => router.push('/stats/airlines')}
            />
            <AirlineCard
              airline={topAirline}
              totalFlights={recap.trips}
              otherAirlines={airlines.length - 1}
              onPress={() => router.push('/stats/airlines')}
            />
          </>
        )}

        {aircraft[0] && (
          <>
            <SectionLink
              label="Most flown aircraft"
              link="All aircraft"
              onPress={() => router.push('/stats/aircraft')}
            />
            <AircraftCard
              type={aircraft[0]}
              makers={makers}
              totalFlights={aircraft.reduce((n, t) => n + t.flights, 0)}
              onPress={() => router.push('/stats/aircraft')}
            />
          </>
        )}

        <View style={styles.tiles}>
          {recap.homeCity && (
            <MiniTile
              label="Home base"
              value={recap.homeCity.city}
              caption={plural(recap.homeCity.departures, 'take-off')}
            />
          )}
          {recap.busiestYear ? (
            <MiniTile
              label="Busiest year"
              value={recap.busiestYear.year}
              caption={plural(recap.busiestYear.trips, 'trip')}
            />
          ) : (
            recap.firstYear && <MiniTile label="Flying since" value={recap.firstYear} />
          )}
        </View>
        {(recap.shortest || favourite) && (
          <View style={styles.tiles}>
            {recap.shortest && (
              <MiniTile
                label="Shortest hop"
                value={`${Math.round(recap.shortest.distanceKm).toLocaleString()} km`}
                caption={`${cityOf(recap.shortest.fromCode)} to ${cityOf(recap.shortest.toCode)}`}
              />
            )}
            {favourite && (
              <MiniTile
                label="Your favourite"
                value={favourite.carrier}
                caption={`${formatStars(favourite.rating)} · ${plural(favourite.rated, 'rating')}`}
              />
            )}
          </View>
        )}
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
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
