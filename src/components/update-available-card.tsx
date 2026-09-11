import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAppVersion } from '@/hooks/use-app-version';
import { useTheme } from '@/hooks/use-theme';
import { markUpdateSeen } from '@/services/update-seen';

/** The Settings row that says a newer FlyRight is on the store — the app
 * icon, the version, a red count, like iOS's own Software Update row. Renders
 * nothing while the running build is the newest one the store serves. */
export function UpdateAvailableCard() {
  const router = useRouter();
  const theme = useTheme();
  const { update } = useAppVersion();
  // Seen once this row has been on screen: the app icon stops counting the
  // update (attention-provider), while the row keeps its own count until
  // the update is installed, like iOS's Software Update row.
  const focused = useIsFocused();
  const latest = update?.latest;
  useEffect(() => {
    if (focused && latest) markUpdateSeen(latest);
  }, [focused, latest]);
  if (!update) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Update available: FlyRight ${update.latest}`}
      testID="update-available"
      onPress={() => router.push('/whats-new')}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.icon}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.copy}>
          <ThemedText numberOfLines={1}>FlyRight {update.latest}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            Update available
          </ThemedText>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.danger }]}>
          <ThemedText type="smallBold" style={styles.badgeText}>
            1
          </ThemedText>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          weight="bold"
          tintColor={theme.textSecondary}
        />
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  copy: {
    flex: 1,
    gap: Spacing.half,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
  },
});
