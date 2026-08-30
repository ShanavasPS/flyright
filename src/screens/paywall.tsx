import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { PurchasesOffering } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { entitledToPro, getOfferingByIdentifier, isPurchasesConfigured } from '@/services/purchases';

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
 *
 * Pass ?next=<href> to continue somewhere after an unlock (purchase or
 * entitling restore) — the caller's original destination, e.g. the claim
 * wizard — instead of bouncing back for a second tap. Cancel/close always
 * just goes back.
 */
export function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { offering: offeringId, next } = useLocalSearchParams<{
    offering?: string;
    next?: string;
  }>();

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

  // A successful purchase fires onPurchaseCompleted AND onDismiss (RevenueCatUI
  // requests dismissal itself after a purchase), so every exit funnels through
  // this once-guard — a second router.back() would pop the screen under the
  // sheet too, dropping the buyer on the wrong screen.
  const exited = useRef(false);
  const exitOnce = (go: () => void) => {
    if (exited.current) return;
    exited.current = true;
    go();
  };
  const continueTo = typeof next === 'string' && next.length > 0 ? (next as Href) : null;
  const unlocked = () =>
    exitOnce(() => (continueTo ? router.replace(continueTo) : router.back()));

  if (isPurchasesConfigured()) {
    if (resolving) {
      return (
        <ThemedView style={[styles.container, styles.centered]}>
          <ActivityIndicator />
        </ThemedView>
      );
    }
    return (
      <ThemedView style={styles.container}>
        <RevenueCatUI.Paywall
          style={styles.paywall}
          options={{ offering }}
          onPurchaseCompleted={unlocked}
          // A restore can complete without granting Pro (nothing to restore) —
          // only an entitling one continues; otherwise the paywall stays up.
          onRestoreCompleted={({ customerInfo }) => {
            if (entitledToPro(customerInfo)) unlocked();
          }}
          onDismiss={() => exitOnce(() => router.back())}
        />
        {/* App Review 3.1.2: subscription paywalls must carry functional
            privacy policy + Terms of Use links in the app itself. The in-app
            browser presents fine over this form sheet. The row pads itself
            past the system bottom inset — edge-to-edge Android draws the
            nav bar over the sheet, and the sheet reaches the home indicator
            on iOS. */}
        <View
          style={[styles.legalRow, { paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
          <Pressable
            accessibilityRole="link"
            hitSlop={Spacing.two}
            onPress={() => void openBrowserAsync('https://getflyright.com/privacy')}>
            <ThemedText type="small" themeColor="textSecondary">
              Privacy policy
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            ·
          </ThemedText>
          <Pressable
            accessibilityRole="link"
            hitSlop={Spacing.two}
            onPress={() => void openBrowserAsync('https://getflyright.com/terms')}>
            <ThemedText type="small" themeColor="textSecondary">
              Terms of Use
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
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
  paywall: {
    flex: 1,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
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
