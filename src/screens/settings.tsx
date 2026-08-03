import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  restorePurchases,
  useActiveSubscriptions,
  useProEntitlement,
} from '@/services/purchases';

const PLAN_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  lifetime: 'Lifetime',
};

function renewalLine(expirationDate: string | null, willRenew: boolean): string {
  if (!expirationDate) return 'Lifetime access — yours forever';
  const date = new Date(expirationDate).toLocaleDateString();
  return willRenew ? `Renews ${date}` : `Expires ${date}`;
}

const planLabel = (productId: string) =>
  PLAN_LABELS[productId.split(':')[0]] ?? productId;

export function Settings() {
  const router = useRouter();
  const pro = useProEntitlement();
  const activeSubscriptions = useActiveSubscriptions();

  const onRestore = async () => {
    const restored = await restorePurchases();
    Alert.alert(
      restored ? 'Purchases restored' : 'Nothing to restore',
      restored ? 'Owed Pro is active on this device.' : 'No previous purchases were found.'
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Settings</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          {pro ? (
            <>
              <ThemedText type="subtitle">
                Owed Pro — {planLabel(pro.productIdentifier)}
              </ThemedText>
              <ThemedText type="small">
                {renewalLine(pro.expirationDate, pro.willRenew)}
              </ThemedText>
              {activeSubscriptions.length > 1 && (
                <ThemedText type="small">
                  All active plans: {activeSubscriptions.map(planLabel).join(', ')}. The
                  longest-running one unlocks Pro; the others expire on their own.
                </ThemedText>
              )}
              {/* Plan changes live inside the Customer Center: a 'change_plan'
                  custom action configured on its management screen. */}
              <Pressable onPress={() => router.push('/customer-center')}>
                <ThemedText type="link">Manage subscription</ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText type="subtitle">Free plan</ThemedText>
              <Pressable onPress={() => router.push('/paywall')}>
                <ThemedText type="link">Get Owed Pro</ThemedText>
              </Pressable>
            </>
          )}
          <Pressable onPress={onRestore}>
            <ThemedText type="link">Restore purchases</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedText type="small">
          Owed generates claim documents for you to send yourself. It is not a law
          firm and takes no commission — you keep 100% of what you recover.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});
