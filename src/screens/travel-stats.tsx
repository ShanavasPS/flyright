import { useAuth } from '@clerk/expo';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { IconBadge, SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLabelWithYear } from '@/services/dates';
import { useJourneys, type JourneyRow } from '@/services/journeys';
import { airlineOf, cityOf, earthComparison, travelRecap } from '@/services/timeline';

/** The deep-dive behind the My travels summary card: records, places,
 * airlines, and logbook facts computed from the same local journey rows. */
export function TravelStats() {
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);
  const recap = useMemo(() => travelRecap(journeys ?? []), [journeys]);

  if (!recap.trips) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          Log a flight and your stats will start adding up here.
        </ThemedText>
      </ThemedView>
    );
  }

  const orbit = earthComparison(recap.totalKm);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.list}>
        <View style={styles.hero}>
          <ThemedText type="title" themeColor="heading">
            {recap.totalKm.toLocaleString()}
          </ThemedText>
          <ThemedText themeColor="textSecondary">kilometres flown</ThemedText>
          {orbit && (
            <ThemedView type="backgroundSelected" style={styles.orbitPill}>
              <ThemedText type="smallBold" themeColor="heading">
                {orbit}
              </ThemedText>
            </ThemedView>
          )}
        </View>

        {recap.longest && (
          <>
            <SectionLabel>Records</SectionLabel>
            <RecordCard label="Longest flight" row={recap.longest} />
            {recap.shortest && <RecordCard label="Shortest hop" row={recap.shortest} />}
          </>
        )}

        <SectionLabel>Places</SectionLabel>
        <SheenCard>
          {recap.topDestination && (
            <Headline
              icon={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
              value={recap.topDestination.city}
              caption={`top destination · ${plural(recap.topDestination.landings, 'landing')}`}
            />
          )}
          {recap.homeCity && (
            <InfoRow
              label="Home base"
              value={`${recap.homeCity.city} · ${plural(recap.homeCity.departures, 'take-off')}`}
            />
          )}
          <InfoRow label="Countries" value={`${recap.countries}`} />
          <InfoRow label="Airports" value={`${recap.airports}`} />
        </SheenCard>

        {recap.topAirline && (
          <>
            <SectionLabel>Airlines</SectionLabel>
            <SheenCard>
              <Headline
                icon={{ ios: 'airplane', android: 'flight', web: 'flight' }}
                climbing
                value={recap.topAirline.carrier}
                caption={`most flown · ${plural(recap.topAirline.flights, 'flight')}`}
              />
              <InfoRow label="Airlines flown" value={`${recap.airlines}`} />
            </SheenCard>
          </>
        )}

        <SectionLabel>Logbook</SectionLabel>
        <SheenCard>
          <InfoRow label="Trips logged" value={`${recap.trips}`} />
          {recap.firstYear && <InfoRow label="Flying since" value={recap.firstYear} />}
          {recap.busiestYear && (
            <InfoRow
              label="Busiest year"
              value={`${recap.busiestYear.year} · ${plural(recap.busiestYear.trips, 'trip')}`}
            />
          )}
          {recap.hoursAloft > 0 && <InfoRow label="Time in the air" value={`≈ ${recap.hoursAloft} h`} />}
        </SheenCard>
      </ScrollView>
    </ThemedView>
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
      {children}
    </ThemedText>
  );
}

/** A record rendered as the boarding-pass moment it was: codes joined by a
 * dotted contrail (the app icon's motif), cities beneath, receipt line below. */
function RecordCard({ label, row }: { label: string; row: JourneyRow }) {
  const theme = useTheme();
  const airline = airlineOf(row);
  const when = formatDayLabelWithYear(row.scheduledDeparture);
  return (
    <SheenCard>
      <View style={styles.spacedRow}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
          {label}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          {Math.round(row.distanceKm).toLocaleString()} km
        </ThemedText>
      </View>
      <View style={styles.routeRow}>
        <ThemedText type="subtitle" themeColor="heading">
          {row.fromCode}
        </ThemedText>
        <Contrail />
        <ThemedText type="subtitle" themeColor="heading">
          {row.toCode}
        </ThemedText>
      </View>
      <View style={styles.spacedRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {cityOf(row.fromCode)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {cityOf(row.toCode)}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {airline ? `${airline} · ${when}` : when}
      </ThemedText>
    </SheenCard>
  );
}

function Contrail() {
  const theme = useTheme();
  const dots = (side: string) =>
    Array.from({ length: 4 }, (_, i) => (
      <View key={`${side}${i}`} style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
    ));
  return (
    <View style={styles.contrail}>
      {dots('out')}
      <SymbolView
        name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
        size={16}
        tintColor={theme.tint}
        // SF's airplane already points along the route; Material's points up.
        style={Platform.OS === 'ios' ? undefined : styles.rotated}
      />
      {dots('in')}
    </View>
  );
}

/** The one big fact in a card — a name, not a number, gets the display size,
 * anchored by the same tint-washed icon badge the journey rows use. */
function Headline({
  icon,
  climbing,
  value,
  caption,
}: {
  icon: SymbolViewProps['name'];
  climbing?: boolean;
  value: string;
  caption: string;
}) {
  return (
    <View style={styles.headline}>
      <IconBadge symbol={icon} size={44} climbing={climbing} />
      <View style={styles.headlineBody}>
        <ThemedText type="subtitle" themeColor="heading" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {caption}
        </ThemedText>
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.spacedRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
  },
  orbitPill: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.two,
  },
  caps: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  spacedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  contrail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  rotated: {
    transform: [{ rotate: '90deg' }],
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  headlineBody: {
    flex: 1,
    gap: Spacing.half,
  },
});
