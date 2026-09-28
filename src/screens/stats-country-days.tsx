import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { dayCount, inCountry } from '@/components/country-days-card';
import { daySpan, YearChips } from '@/components/country-days-list';
import { DataErrorState, LoadingState } from '@/components/data-state';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useHomeContext } from '@/hooks/use-home-base';
import { countryName } from '@/services/airports';
import { countryDays, countryDayYears, type CountryStay } from '@/services/country-days';
import { useJourneys, type JourneyRow } from '@/services/journeys';

/** One country's days in a year, stay by stay, each with the flights that
 * began and ended it. A stay opens its trip. */
export function StatsCountryDays({ country, initialYear }: { country: string; initialYear: number }) {
  const router = useRouter();
  const { userId } = useAuth();
  const { data: journeys, error } = useJourneys(userId);
  const rows = useMemo(() => journeys ?? [], [journeys]);
  const home = useHomeContext(userId, rows);
  const [now] = useState(() => Date.now());
  const years = useMemo(() => countryDayYears(rows, now), [rows, now]);
  const [year, setYear] = useState(initialYear);
  const data = useMemo(() => countryDays(rows, year, home.homeOnDay, now), [rows, year, home.homeOnDay, now]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  if (error) return <DataErrorState error={error} />;
  if (!journeys) return <LoadingState />;

  const entry = data.countries.find((c) => c.country === country);
  const days = entry?.days ?? 0;
  const stays = entry?.stays ?? [];
  const name = countryName(country);
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        <View style={styles.headline}>
          <ThemedText type="display" themeColor="heading">{dayCount(days)}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            in {inCountry(country, name)} in {year}{data.partial ? ' so far' : ''}
            {stays.length > 1 ? `, over ${stays.length} stays` : ''}
            {entry?.home ? ' · your home base' : ''}
          </ThemedText>
          {country === 'GB' && entry && (
            <ThemedText type="small" themeColor="textSecondary">
              {entry.midnights} {entry.midnights === 1 ? 'midnight' : 'midnights'}, the count the UK&apos;s residence test uses
            </ThemedText>
          )}
        </View>
        {years.length > 1 && <YearChips years={years} value={year} onChange={setYear} />}
        {stays.map((stay) => (
          <StayCard
            key={`${stay.from}:${stay.arrivalId ?? ''}`}
            stay={stay}
            arrival={stay.arrivalId ? byId.get(stay.arrivalId) : undefined}
            departure={stay.departureId ? byId.get(stay.departureId) : undefined}
            onOpen={(id) => router.push({ pathname: '/journey/[id]', params: { id } })}
          />
        ))}
        {!stays.length && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            No days in {inCountry(country, name)} in {year}.
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          The landing and take-off days both count. From your logged flights. Not tax advice.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

function StayCard({ stay, arrival, departure, onOpen }: {
  stay: CountryStay;
  arrival: JourneyRow | undefined;
  departure: JourneyRow | undefined;
  onOpen: (id: string) => void;
}) {
  const open = arrival?.id ?? departure?.id;
  const leg = (row: JourneyRow | undefined, verb: string, day: string) =>
    row ? (
      <ThemedText type="small" numberOfLines={1}>
        <ThemedText type="smallBold">{row.number || row.carrier || 'Flight'}</ThemedText> {row.fromCode} → {row.toCode} · {verb} {daySpan(day, day)}
      </ThemedText>
    ) : null;
  return (
    <Pressable accessibilityRole="button" disabled={!open} onPress={() => open && onOpen(open)}>
      {({ pressed }) => (
        <SheenCard style={[styles.stay, pressed && styles.pressed]}>
          <View style={styles.stayHead}>
            <View style={styles.grow}>
              <ThemedText type="smallBold" themeColor="heading" style={styles.city} numberOfLines={1}>{stay.city}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{daySpan(stay.from, stay.to)}</ThemedText>
            </View>
            <ThemedText type="subtitle" themeColor="heading">{stay.days}</ThemedText>
          </View>
          {leg(arrival, 'lands', stay.from)}
          {leg(departure, 'leaves', stay.to)}
          {!departure && !arrival && (
            <ThemedText type="small" themeColor="textSecondary">At home before the first flight in your journal</ThemedText>
          )}
        </SheenCard>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  headline: { gap: Spacing.half },
  stay: { gap: Spacing.two },
  stayHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
  city: { fontSize: 18, lineHeight: 24 },
  pressed: { opacity: 0.8 },
  empty: { paddingHorizontal: Spacing.one },
  note: { paddingHorizontal: Spacing.one },
});
