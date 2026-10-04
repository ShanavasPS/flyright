import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { appBadgePermission } from '@/services/app-badge';
import { OptionPicker } from '@/components/option-picker';
import { SectionLabel } from '@/components/grouped-list';
import { ThemedSwitch } from '@/components/themed-switch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CONVEX_URL } from '@/constants/config';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useHomeContext } from '@/hooks/use-home-base';
import { useTheme } from '@/hooks/use-theme';
import { useJourneys } from '@/services/journeys';
import { getMembershipLock, setMembershipLock, unlockLabel } from '@/services/memberships';
import { planLabel } from '@/services/plan-label';
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
import { VISIBILITY_LABEL, VISIBILITY_ORDER, type TripVisibility } from '@/services/trip-visibility';
import { getDefaultTripVisibility, setDefaultTripVisibility } from '@/services/trip-visibility-default';
import {
  billingAvailable,
  restorePurchases,
  useActiveSubscriptions,
  useProEntitlement,
} from '@/services/purchases';

function renewalLine(expirationDate: string | null, willRenew: boolean): string {
  if (!expirationDate) return 'Lifetime access — yours forever';
  const date = new Date(expirationDate).toLocaleDateString();
  return willRenew ? `Renews ${date}` : `Expires ${date}`;
}

/** Inset hairline between rows of a grouped card. */
function RowSeparator() {
  return <ThemedView type="backgroundSelected" style={styles.separator} />;
}

/** Where trips start and end (docs/home-base.md): today's home, and the
 * way into its screen. */
function HomeBaseRow() {
  const router = useRouter();
  const theme = useTheme();
  const { userId } = useAuth();
  const { data: journeys } = useJourneys(userId);
  const { current } = useHomeContext(userId, journeys);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/home-base')}
        testID="settings-home-base"
        style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}>
        <View style={styles.rowLabel}>
          <ThemedText>Home base</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Where your trips start and end</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {current ? `${current.city}${current.source === 'auto' ? ' · Auto' : ''}` : 'Not set'}
        </ThemedText>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          weight="bold"
          tintColor={theme.textSecondary}
        />
      </Pressable>
      <RowSeparator />
    </>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function AppearanceRow() {
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
        <OptionPicker value={preference} options={THEME_OPTIONS} onSelect={select} />
      </View>
      <RowSeparator />
    </>
  );
}

const VISIBILITY_OPTIONS: { value: TripVisibility; label: string }[] = VISIBILITY_ORDER.map(
  (value) => ({ value, label: VISIBILITY_LABEL[value] }),
);

/** Seeds hiddenFromCircle on every trip added from now on (see addJourney).
 * Existing trips keep whatever their menu says — this is a default, not a
 * bulk switch, so nobody's followers lose a trip they already got a push
 * about. Needs the circle backend to mean anything. */
/** Settings → "Let people find me by email": whether "add someone" matches
 * this account by address. A name search still works; the address is the
 * one thing a stranger could try in bulk. Signed-in only (there is no
 * profile to find otherwise); the server holds the value. */
function DiscoverableRow() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const settings = useQuery(api.users.myDiscoverability, isSignedIn ? {} : 'skip');
  const setDiscoverable = useMutation(api.users.setDiscoverableByEmail);
  const [pending, setPending] = useState<boolean | null>(null);

  if (!CONVEX_URL || !isSignedIn || Platform.OS === 'web') return null;
  const value = pending ?? settings?.byEmail ?? true;

  const onToggle = (byEmail: boolean) => {
    setPending(byEmail);
    setDiscoverable({ byEmail })
      .catch(() => {})
      .finally(() => setPending(null));
  };

  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText>Let people find me by email</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Off: only your invite links and a search for your name reach you.
          </ThemedText>
        </View>
        <ThemedSwitch testID="discoverable-toggle" value={value} disabled={settings === undefined} onValueChange={onToggle} />
      </View>
      <RowSeparator />
    </>
  );
}

function TripVisibilityRow() {
  const [visibility, setVisibility] = useState(getDefaultTripVisibility);

  const select = (value: TripVisibility) => {
    setVisibility(value);
    setDefaultTripVisibility(value);
  };

  if (!CONVEX_URL || Platform.OS === 'web') return null;

  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText>Show new trips to</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Who follows a trip you add. Change any trip from its menu.
          </ThemedText>
        </View>
        <OptionPicker value={visibility} options={VISIBILITY_OPTIONS} onSelect={select} />
      </View>
      <RowSeparator />
    </>
  );
}

function PushNotificationsRow() {
  const [enabled, setEnabled] = useState(false);
  const [badgesAllowed, setBadgesAllowed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refresh = () =>
      Promise.all([getPushEnabled(), appBadgePermission()]).then(([value, badges]) => {
        if (mounted) { setEnabled(value); setBadgesAllowed(badges); }
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
        'Allow notifications in system settings for shared updates, plus your own flight alerts and claim reminders with Pro.',
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
            Flight alerts, Friends activity, support replies and app updates.
          </ThemedText>
          {Platform.OS === 'ios' && enabled && !badgesAllowed && (
            <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()}>
              <ThemedText type="small" themeColor="tint">
                App icon badges are off. Enable Badges in system settings.
              </ThemedText>
            </Pressable>
          )}
        </View>
        <ThemedSwitch testID="push-toggle" value={enabled} disabled={busy} onValueChange={onToggle} />
      </View>
      <RowSeparator />
    </>
  );
}

/** Governs the live travel-day surfaces (the updating trip notification, and
 * later the lock-screen widget) independently of alert-style pushes. */
function TravelDayRow() {
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
        <ThemedSwitch testID="travel-day-toggle" value={enabled} onValueChange={onToggle} />
      </View>
      <RowSeparator />
    </>
  );
}

/** One rounded group; the hairline every row draws under itself is
 * clipped off the last one. */
function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      <View style={styles.groupInner}>{children}</View>
    </ThemedView>
  );
}

/** "Face ID for memberships": membership numbers stay masked until the
 * phone's own lock passes (services/memberships). */
function MembershipLockRow() {
  const [enabled, setEnabled] = useState(getMembershipLock);
  const [label, setLabel] = useState(Platform.OS === 'ios' ? 'Face ID' : 'Screen lock');
  useEffect(() => {
    void unlockLabel().then((l) => setLabel(l === 'passcode' ? (Platform.OS === 'ios' ? 'Passcode' : 'Screen lock') : l[0].toUpperCase() + l.slice(1)));
  }, []);
  if (Platform.OS === 'web') return null;
  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <ThemedText>{label} for memberships</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Needed to show or copy a membership number.
          </ThemedText>
        </View>
        <ThemedSwitch
          testID="membership-lock-toggle"
          value={enabled}
          onValueChange={(on) => {
            setEnabled(on);
            setMembershipLock(on);
          }}
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
      {/* The navigation bar already clears the status bar and the notch, and
          the scroll view insets itself under it — taking the top edge here
          as well left a second gap the height of a header above the title. */}
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        {/* The settings stack is taller than small windows (iPad
            compatibility mode, small phones) — it must scroll. */}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
        {/* Reached from Profile: the switches. Who you are, Pro and help
            live on Profile (screens/profile). */}
        <SectionLabel>Notifications</SectionLabel>
        <SettingsGroup>
          <PushNotificationsRow />
          <TravelDayRow />
        </SettingsGroup>

        <SectionLabel>Privacy</SectionLabel>
        <SettingsGroup>
          <TripVisibilityRow />
          <DiscoverableRow />
          <MembershipLockRow />
          {isSignedIn && (
            <>
              <Pressable
                testID="blocked-people"
                onPress={() => router.push('/blocked')}
                style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}>
                <View style={styles.rowLabel}>
                  <ThemedText>Blocked people</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    People who can&apos;t find you or follow your trips.
                  </ThemedText>
                </View>
                {chevron}
              </Pressable>
              <RowSeparator />
            </>
          )}
        </SettingsGroup>

        <SectionLabel>Preferences</SectionLabel>
        <SettingsGroup>
          <HomeBaseRow />
          <AppearanceRow />
        </SettingsGroup>

        {billingAvailable && (
          <>
            <SectionLabel>Purchases</SectionLabel>
            <SettingsGroup>
              <Pressable
                testID="restore-purchases"
                onPress={onRestore}
                style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}>
                <View style={styles.rowLabel}>
                  <ThemedText themeColor="tint">Restore purchases</ThemedText>
                  {pro && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {renewalLine(pro.expirationDate, pro.willRenew)}
                    </ThemedText>
                  )}
                </View>
              </Pressable>
              <RowSeparator />
            </SettingsGroup>
          </>
        )}

        {pro && activeSubscriptions.length > 1 && (
          <ThemedText type="small" themeColor="textSecondary">
            All active plans: {activeSubscriptions.map(planLabel).join(', ')}. The
            longest-running one unlocks Pro; the others expire on their own.
          </ThemedText>
        )}
        </ScrollView>
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
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
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
    overflow: 'hidden',
  },
  groupInner: {
    marginBottom: -StyleSheet.hairlineWidth,
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
  /** A value beside a row's label never takes the label's room. */
  rowValue: {
    flexShrink: 1,
    maxWidth: '45%',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.four,
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
