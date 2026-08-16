import { useAuth, useClerk, useUser } from '@clerk/expo';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
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

/** "1.0.0 (6)" from the installed binary; falls back to the JS config
 * version on web, where native version APIs return null. */
function versionLine(): string {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '';
  const build = Application.nativeBuildVersion;
  return `Version ${version}${build ? ` (${build})` : ''}`;
}

/** Placeholder shell shown while Clerk initializes (a network round trip on
 * fresh installs) — keeps the card's footprint so the content doesn't jump. */
function AccountCardSkeleton() {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="subtitle">Account</ThemedText>
      <ThemedView type="backgroundSelected" style={[styles.skeletonBar, { width: '55%' }]} />
      <ThemedView type="backgroundSelected" style={[styles.skeletonBar, { width: '40%' }]} />
    </ThemedView>
  );
}

function AccountCard() {
  const router = useRouter();
  // Native auth components can leave the session briefly 'pending' mid-flow;
  // don't flash the signed-out card while that resolves.
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded) return <AccountCardSkeleton />;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {isSignedIn ? (
        <>
          <ThemedText type="subtitle">
            {user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}
          </ThemedText>
          <Pressable onPress={() => router.push('/account')}>
            <ThemedText type="link">Manage account</ThemedText>
          </Pressable>
          <Pressable onPress={() => void signOut()}>
            <ThemedText type="link">Sign out</ThemedText>
          </Pressable>
        </>
      ) : (
        <>
          <ThemedText type="subtitle">Account</ThemedText>
          <ThemedText type="small">
            Keep your purchases and travel history safe across devices.
          </ThemedText>
          <Pressable onPress={() => router.push('/sign-in')}>
            <ThemedText type="link">Sign in or create account</ThemedText>
          </Pressable>
        </>
      )}
    </ThemedView>
  );
}

export function Settings() {
  const router = useRouter();
  const pro = useProEntitlement();
  const activeSubscriptions = useActiveSubscriptions();

  const onRestore = async () => {
    const restored = await restorePurchases();
    Alert.alert(
      restored ? 'Purchases restored' : 'Nothing to restore',
      restored ? 'FlyRight Pro is active on this device.' : 'No previous purchases were found.'
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Settings</ThemedText>

        <AccountCard />

        <ThemedView type="backgroundElement" style={styles.card}>
          {pro ? (
            <>
              <ThemedText type="subtitle">
                FlyRight Pro — {planLabel(pro.productIdentifier)}
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
                <ThemedText type="link">Get FlyRight Pro</ThemedText>
              </Pressable>
            </>
          )}
          <Pressable onPress={onRestore}>
            <ThemedText type="link">Restore purchases</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedText type="small">
          FlyRight generates claim documents for you to send yourself. It is not a law
          firm and takes no commission — you keep 100% of what you recover.
        </ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
          {versionLine()}
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
  skeletonBar: {
    height: 18,
    borderRadius: Spacing.two,
  },
  version: {
    marginTop: 'auto',
    textAlign: 'center',
  },
});
