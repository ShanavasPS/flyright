import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** RevenueCat paywalls are native-only; on web the /go-pro funnel step is the
 * checkout surface, so this page just forwards there. */
export function Paywall() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" themeColor="heading">
        FlyRight Pro
      </ThemedText>
      <Link href="/go-pro">
        <ThemedText type="link">Get Pro on the web →</ThemedText>
      </Link>
      <ThemedText type="small" themeColor="textSecondary">
        Also available inside the iOS and Android apps.
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
