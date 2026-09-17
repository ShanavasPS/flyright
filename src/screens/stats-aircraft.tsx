import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DataErrorState, LoadingState } from '@/components/data-state';
import { SegmentTabs } from '@/components/segment-tabs';
import { SheenCard } from '@/components/sheen-card';
import { AircraftCard, ListHeadline, RankRow, makerColours } from '@/components/stats-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useJourneys } from '@/services/journeys';
import { aircraftRanks, makerRanks, plural, type AircraftSort } from '@/services/travel-recap';

type View_ = 'types' | 'makers';

const TABS: { key: View_ | 'distance'; label: string }[] = [
  { key: 'types', label: 'Types' },
  { key: 'distance', label: 'By distance' },
  { key: 'makers', label: 'Makers' },
];

/** Behind the aircraft card: every type flown, ranked by flights or by
 * distance, each in its maker's colour with the airframes seen; or the
 * makers themselves, with how many of their types the traveller has sat in.
 * Only flights found by number know their aircraft, and the headline says
 * how many of the trips that is. */
export function StatsAircraft() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const [tab, setTab] = useState<View_ | 'distance'>('types');
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const sort: AircraftSort = tab === 'distance' ? 'distance' : 'flights';
  const types = useMemo(() => aircraftRanks(rows, sort), [rows, sort]);
  const makers = useMemo(() => makerRanks(types), [types]);

  if (error) return <DataErrorState error={error} />;
  if (!journeys) return <LoadingState />;

  const known = types.reduce((n, t) => n + t.flights, 0);
  const most = Math.max(1, ...types.map((t) => (sort === 'distance' ? t.km : t.flights)));
  const [first] = types;
  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        <ListHeadline
          headline={plural(types.length, 'aircraft type')}
          detail={`${plural(makers.length, 'maker')} · known for ${known} of ${plural(rows.length, 'flight')}`}
        />
        <SegmentTabs tabs={TABS} value={tab} onChange={setTab} />
        {first && tab !== 'makers' && (
          <AircraftCard
            type={first}
            makers={makers}
            totalFlights={known}
            label={sort === 'distance' ? 'Furthest in' : 'Most flown aircraft'}
            compact
            onPress={() => router.push({ pathname: '/stats/aircraft/[model]', params: { model: first.model } })}
          />
        )}
        {tab === 'makers' ? (
          <SheenCard style={styles.rows}>
            {makers.map((maker, i) => (
              <MakerRow key={maker.maker} maker={maker} rank={i + 1} share={maker.flights / Math.max(1, makers[0].flights)} last={i === makers.length - 1} />
            ))}
          </SheenCard>
        ) : (
          types.length > 0 && (
            <SheenCard style={styles.rows}>
              {types.map((type, i) => (
                <TypeRow
                  key={type.model}
                  type={type}
                  rank={i + 1}
                  share={(sort === 'distance' ? type.km : type.flights) / most}
                  last={i === types.length - 1}
                  onPress={() => router.push({ pathname: '/stats/aircraft/[model]', params: { model: type.model } })}
                />
              ))}
            </SheenCard>
          )
        )}
        {!types.length && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            The aircraft is recorded for flights found by their number. Add one and its type shows up here.
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** A square in the maker's colour with its initial — the mark a type has
 * when there is no logo to show. */
function MakerMark({ maker }: { maker: string }) {
  const theme = useTheme();
  const colours = makerColours(maker, theme.tint);
  return (
    <View style={[styles.mark, { backgroundColor: colours.base }]}>
      <Text style={styles.markText}>{maker.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function TypeRow({
  type,
  rank,
  share,
  last,
  onPress,
}: {
  type: ReturnType<typeof aircraftRanks>[number];
  rank: number;
  share: number;
  last: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const colours = makerColours(type.maker, theme.tint);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${type.model}, ${plural(type.flights, 'flight')}. Open its flights`}
      testID={`aircraft-${type.model}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
    <RankRow
      rank={rank}
      lead={<MakerMark maker={type.maker} />}
      value={type.flights.toLocaleString()}
      caption={`${Math.round(type.km).toLocaleString()} km`}
      last={last}>
      <ThemedText type="smallBold" numberOfLines={1}>
        {type.model}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {[type.maker, type.airframes > 1 ? `${type.airframes} different aircraft` : type.airframes === 1 ? '1 aircraft' : null]
          .filter(Boolean)
          .join(' · ')}
      </ThemedText>
      <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${Math.max(3, Math.round(share * 100))}%`, backgroundColor: colours.light }]} />
      </View>
    </RankRow>
    </Pressable>
  );
}

function MakerRow({
  maker,
  rank,
  share,
  last,
}: {
  maker: ReturnType<typeof makerRanks>[number];
  rank: number;
  share: number;
  last: boolean;
}) {
  const theme = useTheme();
  const colours = makerColours(maker.maker, theme.tint);
  return (
    <RankRow
      rank={rank}
      lead={<MakerMark maker={maker.maker} />}
      value={maker.flights.toLocaleString()}
      caption={`${Math.round(maker.km).toLocaleString()} km`}
      last={last}>
      <ThemedText type="smallBold" numberOfLines={1}>
        {maker.maker}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {plural(maker.models, 'type')}
      </ThemedText>
      <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${Math.max(3, Math.round(share * 100))}%`, backgroundColor: colours.light }]} />
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
  empty: {
    textAlign: 'center',
    padding: Spacing.four,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 800,
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
