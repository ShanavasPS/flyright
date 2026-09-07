import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { WorldCanvas } from '@/screens/world';
import { getAirport } from '@/services/airports';
import { haversineKm } from '@/services/geo';
import type { JourneyRow } from '@/services/journeys';

/**
 * A followed person's travel, on the same map the traveller sees.
 *
 * It is the World tab's map, not a drawing of one — the routes, the plane
 * mid-arc, the tap-a-route card, the recenter, and "All travels" to widen
 * back out of a single leg. A person's travel deserved the map the app
 * already had rather than a flat picture beside it (screens/world exports
 * WorldCanvas for exactly this).
 *
 * It lives on the person and not as a mode of the World tab, which is the
 * whole design. That tab means "everywhere I have been"; its countries and
 * kilometres are the viewer's own. Put a person switcher in it and every
 * visit starts by working out whose map this is before the numbers mean
 * anything. Here the answer is in the title and cannot drift.
 */
export function PersonWorld({ userId, focusJourneyId }: { userId: string; focusJourneyId?: string }) {
  const router = useRouter();
  const data = useQuery(api.circle.person, { userId });
  // Arriving from one of their trips opens on that leg; "All travels" clears
  // it, exactly as it does for your own. Local state, not the module store
  // the tab uses — two maps must not fight over one focus.
  const [cleared, setCleared] = useState(false);

  const person = data && !('gone' in data) ? data : null;
  const rows: JourneyRow[] = useMemo(
    () => (person ? [...person.upcoming, ...person.past].map(asRow) : []),
    [person],
  );
  const focusedRow =
    !cleared && focusJourneyId ? rows.find((r) => r.id === focusJourneyId) : undefined;

  if (data === undefined) {
    return (
      <ThemedView style={styles.centre}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
  if (!person || !person.theyShare) {
    return (
      <ThemedView style={styles.centre}>
        <View style={styles.card}>
          <Card>
            <ThemedText type="subtitle">Nothing to show</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              You either stopped following them, or they stopped sharing their trips.
            </ThemedText>
          </Card>
        </View>
      </ThemedView>
    );
  }

  return (
    <WorldCanvas
      rows={rows}
      focusedRow={focusedRow}
      loaded
      onClearFocus={() => setCleared(true)}
      eyebrow={`Everywhere ${person.name} has been`}
      title={`${person.name}'s world`}
      onBack={() => router.back()}
      emptyCard={
        <Card>
          <ThemedText type="subtitle">No trips yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {person.name} hasn&apos;t added a flight. You&apos;ll hear when they do.
          </ThemedText>
        </Card>
      }
    />
  );
}

/** A shared trip in the shape the map and the stats card read.
 *
 * The countries and the distance are derived from the airport table rather
 * than sent: a follower is given codes and times and nothing else, and the
 * map has always turned codes into coordinates itself. Leaving them out
 * showed "0 countries" and "NaN km" under somebody's travel, which is worse
 * than not showing the card at all. */
function asRow(t: {
  journeyId: string;
  carrier: string;
  number: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
}): JourneyRow {
  const from = getAirport(t.fromCode);
  const to = getAirport(t.toCode);
  return {
    id: t.journeyId,
    mode: 'flight',
    source: 'lookup',
    fromCode: t.fromCode,
    toCode: t.toCode,
    fromCountry: from?.country ?? '',
    toCountry: to?.country ?? '',
    number: t.number,
    carrier: t.carrier,
    carrierCountry: '',
    distanceKm:
      from && to ? Math.round(haversineKm(from.lat, from.lon, to.lat, to.lon)) : 0,
    scheduledDeparture: t.scheduledDeparture,
    scheduledArrival: t.scheduledArrival,
  } as JourneyRow;
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: Spacing.four, width: '100%' },
});
