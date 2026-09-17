import { useAuth } from '@clerk/expo';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { DataErrorState, LoadingState } from '@/components/data-state';
import { SegmentTabs } from '@/components/segment-tabs';
import { SheenCard } from '@/components/sheen-card';
import { CodeChips, DestinationCard, ListHeadline, RankRow } from '@/components/stats-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useJourneys } from '@/services/journeys';
import { travelRecap } from '@/services/timeline';
import { destinationDetail, placeGroups, plural, type PlaceSort } from '@/services/travel-recap';

const TABS: { key: PlaceSort; label: string }[] = [
  { key: 'visits', label: 'Most visited' },
  { key: 'name', label: 'A–Z' },
  { key: 'latest', label: 'Latest' },
];

/** Behind the destination card: every country, with its flag and code, the
 * cities, each airport as a code chip (the home base in navy), and the
 * landings there — take-offs for the home country, where landings are
 * mostly coming back. The top destination keeps its sky card up top. */
export function StatsPlaces() {
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const [sort, setSort] = useState<PlaceSort>('visits');
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const groups = useMemo(() => placeGroups(rows, sort), [rows, sort]);
  const recap = useMemo(() => travelRecap(rows), [rows]);
  const destination = useMemo(
    () => (recap.topDestination ? destinationDetail(rows, recap.topDestination.city) : null),
    [rows, recap.topDestination],
  );
  const [now] = useState(() => new Date());
  // The airport most departed from is home; its country reads in take-offs.
  const home = useMemo(() => {
    let best: { iata: string; country: string; takeoffs: number } | null = null;
    for (const group of groups) {
      for (const airport of group.airports) {
        if (!best || airport.takeoffs > best.takeoffs) {
          best = { iata: airport.iata, country: group.country, takeoffs: airport.takeoffs };
        }
      }
    }
    return best;
  }, [groups]);

  if (error) return <DataErrorState error={error} />;
  if (!journeys) return <LoadingState />;

  const airports = groups.reduce((n, g) => n + g.airports.length, 0);
  const cities = new Set(groups.flatMap((g) => g.cities)).size;
  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        <ListHeadline
          headline={plural(groups.length, 'country', 'countries')}
          detail={`${plural(airports, 'airport')} · ${plural(cities, 'city', 'cities')}`}
        />
        <SegmentTabs tabs={TABS} value={sort} onChange={setSort} />
        {destination && <DestinationCard destination={destination} now={now} compact />}
        <SheenCard style={styles.rows}>
          {groups.map((group, i) => {
            const isHome = group.country === home?.country;
            const count = isHome ? group.takeoffs : group.landings;
            return (
              <RankRow
                key={group.country || `unknown-${i}`}
                lead={
                  <Text style={styles.flag} accessibilityLabel={group.name}>
                    {group.flag || '🏳️'}
                  </Text>
                }
                value={count.toLocaleString()}
                caption={isHome ? (count === 1 ? 'take-off' : 'take-offs') : count === 1 ? 'landing' : 'landings'}
                last={i === groups.length - 1}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {group.name}{' '}
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {group.country}
                  </ThemedText>
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {group.cities.join(' · ')}
                  {isHome ? ' · your home base' : ''}
                </ThemedText>
                <CodeChips codes={group.airports.map((a) => a.iata)} strong={home?.iata} />
              </RankRow>
            );
          })}
        </SheenCard>
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
  rows: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  flag: {
    fontSize: 26,
    lineHeight: 32,
    width: 34,
    textAlign: 'center',
  },
});
