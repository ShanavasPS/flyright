import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** RevenueCat paywalls are native-only; the web page just points at the apps. */
export function Paywall() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" themeColor="heading">
        Owed Pro
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Subscriptions are available in the iOS and Android apps.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
