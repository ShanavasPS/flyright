import { useAuth } from '@clerk/expo';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AirlineLogo, airlineCode } from '@/components/airline-logo';
import { DataErrorState, LoadingState } from '@/components/data-state';
import { SegmentTabs } from '@/components/segment-tabs';
import { SheenCard } from '@/components/sheen-card';
import { AirlineCard, ListHeadline, RankRow } from '@/components/stats-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { carrierCodeForName } from '@/constants/carriers';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useJourneys } from '@/services/journeys';
import { useLogoTint } from '@/services/logo-tint';
import { airlineRanks, formatStars, plural, type AirlineRank, type AirlineSort } from '@/services/travel-recap';

const TABS: { key: AirlineSort; label: string }[] = [
  { key: 'flights', label: 'Flights' },
  { key: 'distance', label: 'Distance' },
  { key: 'rating', label: 'Your rating' },
];

const LABEL: Record<AirlineSort, string> = {
  flights: 'Most flown',
  distance: 'Furthest with',
  rating: 'Rated highest',
};

/** Behind the airline card: every airline flown, ranked, each with its
 * mark, a bar for its share of the flights in its own colour, the
 * kilometres and the traveller's stars. The leader keeps its tinted card. */
export function StatsAirlines() {
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const [sort, setSort] = useState<AirlineSort>('flights');
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const ranked = useMemo(() => airlineRanks(rows, sort), [rows, sort]);

  if (error) return <DataErrorState error={error} />;
  if (!journeys) return <LoadingState />;

  const flights = ranked.reduce((n, a) => n + a.flights, 0);
  const most = Math.max(1, ...ranked.map((a) => (sort === 'distance' ? a.km : a.flights)));
  const [first] = ranked;
  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        <ListHeadline headline={plural(ranked.length, 'airline')} detail={plural(flights, 'flight')} />
        <SegmentTabs tabs={TABS} value={sort} onChange={setSort} />
        {first && (
          <AirlineCard
            airline={first}
            totalFlights={flights}
            otherAirlines={ranked.length - 1}
            label={LABEL[sort]}
            compact
          />
        )}
        {ranked.length > 0 && (
          <SheenCard style={styles.rows}>
            {ranked.map((airline, i) => (
              <AirlineRow
                key={airline.carrier}
                airline={airline}
                rank={i + 1}
                share={(sort === 'distance' ? airline.km : airline.flights) / most}
                last={i === ranked.length - 1}
              />
            ))}
          </SheenCard>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function AirlineRow({
  airline,
  rank,
  share,
  last,
}: {
  airline: AirlineRank;
  rank: number;
  share: number;
  last: boolean;
}) {
  const theme = useTheme();
  const code = carrierCodeForName(airline.carrier) ?? airlineCode(airline.number);
  const tint = useLogoTint(code);
  return (
    <RankRow
      rank={rank}
      lead={<AirlineLogo number={airline.number} carrier={airline.carrier} size={36} />}
      value={airline.flights.toLocaleString()}
      caption={`${Math.round(airline.km).toLocaleString()} km`}
      last={last}>
      <ThemedText type="smallBold" numberOfLines={1}>
        {airline.carrier}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {[code, airline.rating != null ? formatStars(airline.rating) : 'not rated'].filter(Boolean).join(' · ')}
      </ThemedText>
      <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.max(3, Math.round(share * 100))}%`, backgroundColor: tint?.base ?? theme.tint },
          ]}
        />
      </View>
    </RankRow>
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
  bar: {
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
