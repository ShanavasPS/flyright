import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import type { TravelStats } from '@/services/timeline';

/** The rewarding little flex at the top of My travels. Renders nothing until
 * there's at least one trip.
 *
 * Future sign-up CTA slot: a "Keep your history safe across devices" line
 * under the figures, linking to /sign-in, belongs here once account sync ships. */
export function TravelStatsHeader({ stats }: { stats: TravelStats }) {
  if (!stats.trips) return null;

  return (
    <Card style={styles.row}>
      <Stat value={stats.trips} label={stats.trips === 1 ? 'trip' : 'trips'} />
      <Stat value={stats.totalKm.toLocaleString()} label="km flown" />
      <Stat value={stats.countries} label={stats.countries === 1 ? 'country' : 'countries'} />
    </Card>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="subtitle" themeColor="heading">
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  stat: {
    alignItems: 'center',
  },
});
