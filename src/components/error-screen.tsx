import { Observe } from 'expo-observe';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SUPPORT_EMAIL } from '@/constants/config';
import { Spacing } from '@/constants/theme';

/** What a screen shows when its render threw. Reports the error to Observe
 * once, then gives the traveler a way back — Try again re-mounts the route,
 * which clears any transient failure (a query that raced auth, a bad frame
 * of state); a repeat is worth a support message, so the address is here. */
export function ErrorScreen({
  error,
  retry,
  title = 'Something went wrong',
}: {
  error: Error;
  retry?: () => void | Promise<void>;
  title?: string;
}) {
  useEffect(() => {
    Observe.reportError(error);
  }, [error]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title">{title}</ThemedText>
          <ThemedText>
            This screen hit a problem it couldn&apos;t recover from. Your trips and claims are
            safe on this device.
          </ThemedText>
          {!!error.message && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.detail}>
              {error.message}
            </ThemedText>
          )}
          {retry && <PrimaryButton label="Try again" onPress={() => void retry()} />}
          <ThemedText type="small" themeColor="textSecondary">
            If it keeps happening, write to us at {SUPPORT_EMAIL}.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  safeArea: {
    paddingHorizontal: Spacing.four,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  detail: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
