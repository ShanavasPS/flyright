import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import type { PurchasesOffering } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getOfferingByIdentifier, isPurchasesConfigured } from '@/services/purchases';

/**
 * The paywall itself is remote-configured in RevenueCat (Paywalls v2) and
 * rendered embedded here, inside this expo-router modal route — presenting a
 * second native modal on top of the route's own presentation is unreliable.
 * Shows a fallback when the SDK isn't configured (fresh checkout, no keys).
 *
 * Pass ?offering=<identifier> to show a specific offering's paywall — the
 * Customer Center's change-plan action uses this to show subscriber copy
 * ("Switch plan") instead of the acquisition pitch. Unknown identifiers fall
 * back to the default offering.
 */
export function Paywall() {
  const router = useRouter();
  const { offering: offeringId } = useLocalSearchParams<{ offering?: string }>();

  const wantsOffering = typeof offeringId === 'string' && offeringId.length > 0;
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [resolving, setResolving] = useState(wantsOffering);

  useEffect(() => {
    if (!wantsOffering) return;
    let live = true;
    getOfferingByIdentifier(offeringId).then((found) => {
      if (!live) return;
      setOffering(found);
      setResolving(false);
    });
    return () => {
      live = false;
    };
  }, [wantsOffering, offeringId]);

  if (isPurchasesConfigured()) {
    if (resolving) {
      return (
        <ThemedView style={[styles.container, styles.centered]}>
          <ActivityIndicator />
        </ThemedView>
      );
    }
    return (
      <RevenueCatUI.Paywall
        style={styles.container}
        options={{ offering }}
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
  centered: {
    alignItems: 'center',
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
