import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { TravelStats } from '@/services/timeline';

/** The rewarding little flex at the top of My travels. Renders nothing until
 * there's at least one trip. Signed-out users get the backup pitch — the trips
 * they just logged are the reason to make an account. */
export function TravelStatsHeader({ stats }: { stats: TravelStats }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  if (!stats.trips) return null;

  return (
    <Card>
      <View style={styles.row}>
        <Stat value={stats.trips} label={stats.trips === 1 ? 'trip' : 'trips'} />
        <Stat value={stats.totalKm.toLocaleString()} label="km flown" />
        <Stat value={stats.countries} label={stats.countries === 1 ? 'country' : 'countries'} />
      </View>
      {isLoaded && !isSignedIn && (
        <Pressable
          accessibilityRole="button"
          hitSlop={Spacing.two}
          onPress={() => router.push('/sign-in')}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.cta}>
            Keep your history safe across devices — <ThemedText type="link">Sign in</ThemedText>
          </ThemedText>
        </Pressable>
      )}
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
  cta: {
    textAlign: 'center',
  },
});
