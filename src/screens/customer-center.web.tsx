import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** The RevenueCat Customer Center is native-only. */
export function CustomerCenter() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" themeColor="heading">
        Manage subscription
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Manage your plan in the iOS or Android app, or through your App Store /
        Google Play account settings.
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
