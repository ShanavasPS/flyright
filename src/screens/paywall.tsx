import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import RevenueCatUI from 'react-native-purchases-ui';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { isPurchasesConfigured } from '@/services/purchases';

/**
 * The paywall itself is remote-configured in RevenueCat (Paywalls v2) and
 * rendered embedded here, inside this expo-router modal route — presenting a
 * second native modal on top of the route's own presentation is unreliable.
 * Shows a fallback when the SDK isn't configured (fresh checkout, no keys).
 */
export function Paywall() {
  const router = useRouter();

  if (isPurchasesConfigured()) {
    return (
      <RevenueCatUI.Paywall
        style={styles.container}
        onPurchaseCompleted={() => router.back()}
        onRestoreCompleted={() => router.back()}
        onDismiss={() => router.back()}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title">FlyRight Pro</ThemedText>
          <ThemedText>
            RevenueCat isn&apos;t configured in this build. Set EXPO_PUBLIC_RC_TEST_KEY
            (dev) or EXPO_PUBLIC_RC_IOS_KEY / EXPO_PUBLIC_RC_ANDROID_KEY (release) in
            .env.local, and create the &apos;FlyRight Pro&apos; entitlement and an offering
            in the RevenueCat dashboard.
          </ThemedText>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">Close</ThemedText>
          </Pressable>
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
});
