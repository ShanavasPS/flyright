import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  OFFERING_CHANGE_PLAN,
  beginRefundRequest,
  getAppUserId,
  restorePurchases,
  useProEntitlement,
} from '@/services/purchases';

/**
 * Our own manage-subscription screen, in the app's design system. It replaces
 * RevenueCat's Customer Center, whose main screen renders in iOS system
 * colors that can't be themed (only its accent is configurable) — see
 * https://www.revenuecat.com/docs/tools/customer-center/customer-center-configuration.
 * Trade-off: no RC cancel surveys or retention offers; none are configured,
 * and cancellation itself always lives in the store, which we link to.
 */

const STORE_LABELS: Record<string, string> = {
  APP_STORE: 'App Store',
  MAC_APP_STORE: 'Mac App Store',
  PLAY_STORE: 'Google Play',
  AMAZON: 'Amazon Appstore',
  RC_BILLING: 'Web',
  STRIPE: 'Web',
  TEST_STORE: 'Test Store',
};

/** "Monthly" from any store's product id shape ('monthly',
 * 'flyright_pro_monthly', 'flyright_pro:monthly'). */
function planLabel(productId: string): string {
  const id = productId.toLowerCase();
  if (id.includes('lifetime')) return 'Lifetime';
  if (id.includes('year')) return 'Yearly';
  if (id.includes('month')) return 'Monthly';
  return productId;
}

function statusLine(expirationDate: string | null, willRenew: boolean): string {
  if (!expirationDate) return 'Lifetime access — yours forever.';
  const date = new Date(expirationDate).toLocaleDateString();
  return willRenew ? `Renews on ${date}.` : `Active until ${date}, then expires.`;
}

/** The store's own subscription manager — cancellation always happens there. */
const MANAGE_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
});

function ActionRow({
  label,
  detail,
  onPress,
  danger,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowLabel}>
        <ThemedText style={danger ? { color: theme.danger } : { color: theme.tint }}>
          {label}
        </ThemedText>
        {detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

function RowSeparator() {
  return <ThemedView type="backgroundSelected" style={styles.separator} />;
}

export function ManageSubscription() {
  const router = useRouter();
  const theme = useTheme();
  const pro = useProEntitlement();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    getAppUserId().then(setUserId);
  }, []);

  const onRestore = async () => {
    const restored = await restorePurchases();
    Alert.alert(
      restored ? 'Purchases restored' : 'Nothing to restore',
      restored ? 'FlyRight Pro is active on this device.' : 'No previous purchases were found.',
    );
  };

  const onRefund = async () => {
    const outcome = await beginRefundRequest();
    if (outcome === 'unavailable') {
      Alert.alert(
        'Refunds are handled by the store',
        Platform.OS === 'ios'
          ? 'The refund sheet could not be opened. You can request a refund at reportaproblem.apple.com.'
          : 'Request a refund from your Google Play order history, or contact Play support.',
      );
    } else if (outcome === 'submitted') {
      Alert.alert('Refund requested', 'Apple has received your request and will follow up.');
    }
  };

  if (!pro) {
    return (
      <ThemedView style={styles.container}>
        <Card>
          <ThemedText type="subtitle">No active subscription</ThemedText>
          <ThemedText type="small">
            FlyRight Pro unlocks claim generation and deadline tracking for every
            disrupted flight.
          </ThemedText>
          <View style={styles.cta}>
            <PrimaryButton label="See FlyRight Pro →" onPress={() => router.push('/paywall')} />
          </View>
        </Card>
      </ThemedView>
    );
  }

  const isLifetime = !pro.expirationDate;

  return (
    <ThemedView style={styles.container}>
      <Card>
        <View style={styles.planHeader}>
          <ThemedText type="subtitle">FlyRight Pro</ThemedText>
          <ThemedView type="backgroundSelected" style={styles.activePill}>
            <ThemedText type="smallBold" style={{ color: theme.success }}>
              Active
            </ThemedText>
          </ThemedView>
        </View>
        <ThemedText>
          {planLabel(pro.productIdentifier)} plan · {STORE_LABELS[pro.store] ?? pro.store}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {statusLine(pro.expirationDate, pro.willRenew)}
        </ThemedText>
      </Card>

      <ThemedView type="backgroundElement" style={styles.group}>
        {!isLifetime && (
          <>
            <ActionRow
              label="Change plan"
              detail="Switch between monthly, yearly, and lifetime."
              onPress={() =>
                router.push({
                  pathname: '/paywall',
                  params: { offering: OFFERING_CHANGE_PLAN },
                })
              }
            />
            <RowSeparator />
            <ActionRow
              label={`Manage or cancel in ${Platform.OS === 'ios' ? 'the App Store' : 'Google Play'}`}
              detail="Cancellation always happens in the store — no hoops here."
              onPress={() => Linking.openURL(MANAGE_URL)}
            />
            <RowSeparator />
          </>
        )}
        <ActionRow label="Restore purchases" onPress={onRestore} />
        <RowSeparator />
        <ActionRow label="Request a refund" danger onPress={onRefund} />
      </ThemedView>

      {userId && (
        <ThemedText type="small" themeColor="textSecondary" selectable>
          Support ID: {userId}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activePill: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  group: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  row: {
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
  rowLabel: {
    gap: Spacing.half,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  cta: {
    marginTop: Spacing.two,
  },
});
