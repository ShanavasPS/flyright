import { useAuth } from '@clerk/expo';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { CountryDaysList, YearChips } from '@/components/country-days-list';
import { DataErrorState, LoadingState } from '@/components/data-state';
import { SegmentTabs } from '@/components/segment-tabs';
import { SheenCard } from '@/components/sheen-card';
import { CodeChips, DestinationCard, ListHeadline, RankRow } from '@/components/stats-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useHomeContext } from '@/hooks/use-home-base';
import { cityAirports } from '@/services/airports';
import { countryDays, countryDayYears } from '@/services/country-days';
import { useJourneys } from '@/services/journeys';
import { travelRecap } from '@/services/timeline';
import { destinationDetail, placeGroups, plural, type PlaceSort } from '@/services/travel-recap';

type PlaceTab = PlaceSort | 'days';

const TABS: { key: PlaceTab; label: string }[] = [
  { key: 'visits', label: 'Visits' },
  { key: 'name', label: 'A–Z' },
  { key: 'latest', label: 'Latest' },
  // Days per country per year (services/country-days), for the day counts
  // in tax rules; the Travel stats card opens straight onto it.
  { key: 'days', label: 'Days' },
];

/** Behind the destination card: every country, with its flag and code, the
 * cities, each airport as a code chip (the home base in navy), and the
 * landings there — take-offs for the home country, where landings are
 * mostly coming back. The top destination keeps its sky card up top. */
export function StatsPlaces() {
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const params = useLocalSearchParams<{ tab?: string; year?: string }>();
  const [sort, setSort] = useState<PlaceTab>(params.tab === 'days' ? 'days' : 'visits');
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const groups = useMemo(() => placeGroups(rows, sort === 'days' ? 'visits' : sort), [rows, sort]);
  const homeContext = useHomeContext(userId, rows);
  const recap = useMemo(() => travelRecap(rows, homeContext.recap), [rows, homeContext.recap]);
  const destination = useMemo(
    () => (recap.topDestination ? destinationDetail(rows, recap.topDestination.city) : null),
    [rows, recap.topDestination],
  );
  const [now] = useState(() => new Date());
  const years = useMemo(() => countryDayYears(rows, now.getTime()), [rows, now]);
  const [pickedYear, setYear] = useState(() => Number(params.year) || now.getFullYear());
  const year = years.includes(pickedYear) ? pickedYear : (years[0] ?? pickedYear);
  const days = useMemo(
    () => (sort === 'days' ? countryDays(rows, year, homeContext.homeOnDay, now.getTime()) : null),
    [sort, rows, year, homeContext.homeOnDay, now],
  );
  // Today's home base (set, or the city with most take-offs): its country
  // reads in take-offs and every airport of the city is marked.
  const homeBase = homeContext.current;
  const home = useMemo(
    () => (homeBase ? { country: homeBase.country, airports: cityAirports(homeBase.city, homeBase.country) } : null),
    [homeBase],
  );

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
        {days ? (
          <ListHeadline
            headline={plural(days.countries.length, 'country', 'countries')}
            detail={`in ${days.year}${days.partial ? ' so far' : ''}`}
          />
        ) : (
          <ListHeadline
            headline={plural(groups.length, 'country', 'countries')}
            detail={`${plural(airports, 'airport')} · ${plural(cities, 'city', 'cities')}`}
          />
        )}
        <SegmentTabs tabs={TABS} value={sort} onChange={setSort} />
        {days ? (
          <>
            <YearChips years={years} value={year} onChange={setYear} />
            <CountryDaysList year={days} />
          </>
        ) : (
          <>
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
                    <CodeChips codes={group.airports.map((a) => a.iata)} strong={home?.airports} />
                  </RankRow>
                );
              })}
            </SheenCard>
          </>
        )}
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
