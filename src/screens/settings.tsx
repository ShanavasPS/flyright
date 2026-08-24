import { useAuth, useUser } from '@clerk/expo';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { reconcileNotifications } from '@/services/notification-lifecycle';
import {
  getTravelDayEnabled,
  reconcileTravelDay,
  setTravelDayEnabled,
} from '@/services/travel-day-lifecycle';
import {
  addPushStateListener,
  getPushEnabled,
  setPushEnabled,
} from '@/services/notifications';
import {
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@/services/theme';
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
    <ThemedView type="backgroundElement" style={[styles.card, styles.profileRow]}>
      <ThemedView type="backgroundSelected" style={styles.avatar} />
      <View style={styles.profileText}>
        <ThemedView type="backgroundSelected" style={[styles.skeletonBar, { width: '55%' }]} />
        <ThemedView type="backgroundSelected" style={[styles.skeletonBar, { width: '40%' }]} />
      </View>
    </ThemedView>
  );
}

function AccountCard() {
  const router = useRouter();
  const theme = useTheme();
  // Native auth components can leave the session briefly 'pending' mid-flow;
  // don't flash the signed-out card while that resolves.
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();

  if (!isLoaded) return <AccountCardSkeleton />;

  if (!isSignedIn) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">Account</ThemedText>
        <ThemedText type="small">
          Keep your purchases and travel history safe across devices.
        </ThemedText>
        <Pressable onPress={() => router.push('/sign-in')}>
          <ThemedText type="link">Sign in or create account</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  // Email-OTP users have no name yet, so the email becomes the title line.
  // Clerk's imageUrl always resolves — initials placeholder when no photo.
  const email = user?.primaryEmailAddress?.emailAddress;
  const name = user?.fullName;

  return (
    <Pressable
      onPress={() => router.push('/account')}
      style={({ pressed }) => pressed && styles.pressedRow}>
      <ThemedView type="backgroundElement" style={[styles.card, styles.profileRow]}>
        <Image source={user?.imageUrl} style={styles.avatar} />
        <View style={styles.profileText}>
          <ThemedText numberOfLines={1}>{name ?? email ?? 'Signed in'}</ThemedText>
          {name && email && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {email}
            </ThemedText>
          )}
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          weight="bold"
          tintColor={theme.textSecondary}
        />
      </ThemedView>
    </Pressable>
  );
}

/** Inset hairline between rows of a grouped card. */
function RowSeparator() {
  return <ThemedView type="backgroundSelected" style={styles.separator} />;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function AppearanceRow() {
  const theme = useTheme();
  const [preference, setPreference] = useState(getThemePreference);

  const select = (value: ThemePreference) => {
    setPreference(value);
    setThemePreference(value);
  };

  // Web can't override the scheme (no Appearance.setColorScheme there);
  // it follows prefers-color-scheme without a row.
  if (Platform.OS === 'web') return null;

  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText>Appearance</ThemedText>
        </View>
        <View style={[styles.segments, { backgroundColor: theme.background }]}>
          {THEME_OPTIONS.map(({ value, label }) => (
            <Pressable
              key={value}
              onPress={() => select(value)}
              style={[
                styles.segment,
                value === preference && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText
                type="small"
                themeColor={value === preference ? 'text' : 'textSecondary'}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>
      <RowSeparator />
    </>
  );
}

function PushNotificationsRow() {
  const theme = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refresh = () =>
      getPushEnabled().then((value) => {
        if (mounted) setEnabled(value);
      });
    refresh();
    // State changes behind our back two ways: OneSignal events (the
    // first-journey permission prompt, subscription changes) and the user
    // flipping the permission in system settings — the latter arrives only
    // as an app foreground, so listen for both.
    const unsubscribe = addPushStateListener(refresh);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      mounted = false;
      unsubscribe();
      appState.remove();
    };
  }, []);

  const onToggle = async (value: boolean) => {
    setBusy(true);
    setEnabled(value);
    // Enabling can bounce through the OS permission prompt — settle on
    // whatever actually stuck.
    const result = await setPushEnabled(value);
    setEnabled(result === 'on');
    setBusy(false);
    // The toggle governs local reminders too: off empties the schedule,
    // on rebuilds it from the journal. Travel-day surfaces ride the same
    // permission, so they reconcile alongside.
    void reconcileNotifications();
    void reconcileTravelDay();
    if (result === 'blocked') {
      Alert.alert(
        'Notifications are off for FlyRight',
        'Allow notifications in system settings to get disruption alerts and claim reminders.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  // Web has no push channel — the row disappears along with its separator.
  if (Platform.OS === 'web') return null;

  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText>Push notifications</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Disruption alerts and claim reminders for your flights.
          </ThemedText>
        </View>
        <Switch
          testID="push-toggle"
          value={enabled}
          disabled={busy}
          onValueChange={onToggle}
          trackColor={{ true: theme.tint }}
        />
      </View>
      <RowSeparator />
    </>
  );
}

/** Governs the live travel-day surfaces (the updating trip notification, and
 * later the lock-screen widget) independently of alert-style pushes. */
function TravelDayRow() {
  const theme = useTheme();
  const [enabled, setEnabled] = useState(() => getTravelDayEnabled());

  const onToggle = (value: boolean) => {
    setEnabled(value);
    setTravelDayEnabled(value); // fires its own reconcile
  };

  if (Platform.OS === 'web') return null;

  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText>Travel day live updates</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            A live trip card in your notifications from 24 hours before departure.
          </ThemedText>
        </View>
        <Switch
          testID="travel-day-toggle"
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: theme.tint }}
        />
      </View>
      <RowSeparator />
    </>
  );
}

export function Settings() {
  const router = useRouter();
  const theme = useTheme();
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const pro = useProEntitlement();
  const activeSubscriptions = useActiveSubscriptions();

  const onRestore = async () => {
    const restored = await restorePurchases();
    if (restored) {
      Alert.alert('Purchases restored', 'FlyRight Pro is active on this device.');
      return;
    }
    // Web-funnel purchases live on the buyer's account (Clerk id), not this
    // device's store receipts — signing in is the "restore" that finds them.
    if (!isSignedIn) {
      Alert.alert(
        'Nothing to restore',
        'No previous purchases were found on this device. Bought Pro on getflyright.com? Sign in with that account instead.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/sign-in') },
        ]
      );
      return;
    }
    Alert.alert('Nothing to restore', 'No previous purchases were found.');
  };

  const chevron = (
    <SymbolView
      name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
      size={14}
      weight="bold"
      tintColor={theme.textSecondary}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" themeColor="heading">
          Settings
        </ThemedText>

        <AccountCard />

        <ThemedView type="backgroundElement" style={styles.group}>
          <PushNotificationsRow />
          <TravelDayRow />

          <AppearanceRow />

          <Pressable
            onPress={() => router.push(pro ? '/manage-subscription' : '/paywall')}
            style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}>
            <View style={styles.rowLabel}>
              <ThemedText>{pro ? 'FlyRight Pro' : 'Get FlyRight Pro'}</ThemedText>
              {pro && (
                <ThemedText type="small" themeColor="textSecondary">
                  {renewalLine(pro.expirationDate, pro.willRenew)}
                </ThemedText>
              )}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {pro ? planLabel(pro.productIdentifier) : 'Free plan'}
            </ThemedText>
            {chevron}
          </Pressable>

          <RowSeparator />

          <Pressable
            onPress={onRestore}
            style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}>
            <ThemedText themeColor="tint">Restore purchases</ThemedText>
          </Pressable>
        </ThemedView>

        {pro && activeSubscriptions.length > 1 && (
          <ThemedText type="small" themeColor="textSecondary">
            All active plans: {activeSubscriptions.map(planLabel).join(', ')}. The
            longest-running one unlocks Pro; the others expire on their own.
          </ThemedText>
        )}

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
  group: {
    borderRadius: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  rowLabel: {
    flex: 1,
    gap: Spacing.half,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.four,
  },
  segments: {
    flexDirection: 'row',
    padding: Spacing.half,
    borderRadius: Spacing.two + Spacing.half,
    gap: Spacing.half,
  },
  segment: {
    paddingHorizontal: Spacing.two + Spacing.one,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressedRow: {
    opacity: 0.7,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  profileText: {
    flex: 1,
    gap: Spacing.half,
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
