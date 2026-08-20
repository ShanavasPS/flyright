import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TravelStats } from '@/services/timeline';

/** The rewarding little flex at the top of My travels. Renders nothing until
 * there's at least one trip. Tapping it opens the full Travel stats screen.
 * Signed-out users get the backup pitch — the trips they just logged are the
 * reason to make an account. */
export function TravelStatsHeader({ stats }: { stats: TravelStats }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  if (!stats.trips) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your travel stats"
      onPress={() => router.push('/stats')}>
      <Card>
        <View style={styles.row}>
          <Stat value={stats.trips} label={stats.trips === 1 ? 'trip' : 'trips'} />
          <Stat value={stats.totalKm.toLocaleString()} label="km flown" />
          <Stat value={stats.countries} label={stats.countries === 1 ? 'country' : 'countries'} />
          <View style={styles.chevron}>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={14}
              tintColor={theme.textSecondary}
            />
          </View>
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
    </Pressable>
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
  chevron: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  cta: {
    textAlign: 'center',
  },
});
