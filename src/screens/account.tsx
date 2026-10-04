import { isClerkAPIResponseError, useAuth, useUser } from '@clerk/expo';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Group, GroupRow, GroupSeparator, SectionLabel } from '@/components/grouped-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import {
  activeLabel,
  deviceKind,
  deviceLabel,
  otherSessions,
  placeLabel,
  type SessionActivity,
} from '@/services/account-security';

type UserResource = NonNullable<ReturnType<typeof useUser>['user']>;
type SessionWithActivity = Awaited<ReturnType<UserResource['getSessions']>>[number];

/** The other devices shown before "Show all". */
const FIRST_DEVICES = 4;

const PROVIDERS = [
  {
    provider: 'apple',
    strategy: 'oauth_apple',
    label: 'Apple',
    icon: { ios: 'apple.logo', android: 'phone_iphone', web: 'phone_iphone' },
  },
  {
    provider: 'google',
    strategy: 'oauth_google',
    label: 'Google',
    icon: { ios: 'g.circle', android: 'account_circle', web: 'account_circle' },
  },
] as const;

/** Clerk's message when it has one, else ours. */
function failure(title: string, error: unknown) {
  const detail = isClerkAPIResponseError(error) ? error.errors[0]?.longMessage || error.errors[0]?.message : null;
  Alert.alert(title, detail ?? 'Check your connection and try again.');
}

/**
 * Account & security, in the Profile area's style: how you sign in (the
 * email, changed with a code on /change-email, and Apple or Google), the
 * devices signed in to the account, and deleting it. Built on Clerk's user
 * API — Clerk's prebuilt UserProfileView repeated the Profile screen's
 * photo, name and Sign out and could not be styled.
 *
 * If the session ends while this is open (signed out on another device),
 * the route pops back to Profile, which explains the state.
 */
export function Account() {
  const router = useRouter();
  const theme = useTheme();
  const now = useNow(60_000);
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const { user } = useUser();
  const [sessions, setSessions] = useState<SessionWithActivity[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn && router.canGoBack()) router.back();
  }, [isLoaded, isSignedIn, router]);

  // Bumped after a device is signed out, to read the list again.
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const loadSessions = () => setSessionsVersion((v) => v + 1);

  useEffect(() => {
    if (!user) return;
    let live = true;
    user.getSessions().then(
      (list) => live && setSessions(list),
      () => live && setSessions([]),
    );
    return () => {
      live = false;
    };
  }, [user, sessionsVersion]);

  if (!user) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.loading} />
      </ThemedView>
    );
  }

  const email = user.primaryEmailAddress?.emailAddress ?? 'No email';
  const verified = user.primaryEmailAddress?.verification?.status === 'verified';
  const current = sessions?.find((s) => s.id === sessionId) ?? null;
  const others = otherSessions(sessions ?? [], sessionId ?? null);
  const shownOthers = showAll ? others : others.slice(0, FIRST_DEVICES);
  const thisDevice = Platform.OS === 'ios' ? 'This iPhone' : Platform.OS === 'android' ? 'This phone' : 'This browser';

  const connect = async (strategy: 'oauth_apple' | 'oauth_google', label: string) => {
    setBusy(strategy);
    try {
      const redirectUrl = Linking.createURL('sso-callback');
      const account = await user.createExternalAccount({ strategy, redirectUrl });
      const url = account.verification?.externalVerificationRedirectURL;
      if (!url) throw new Error('No sign-in page');
      await WebBrowser.openAuthSessionAsync(url.toString(), redirectUrl);
      await user.reload();
      // An abandoned attempt leaves an unverified account behind; clear it
      // so the row reads "Connect" again.
      const left = user.externalAccounts.find((a) => a.id === account.id);
      if (left && left.verification?.status !== 'verified') await left.destroy();
    } catch (error) {
      failure(`Couldn't connect ${label}`, error);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = (accountId: string, label: string) => {
    Alert.alert(
      `Disconnect ${label}?`,
      `You won't be able to sign in with ${label} any more. You can still sign in with a code sent to ${email}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setBusy(accountId);
            try {
              await user.externalAccounts.find((a) => a.id === accountId)?.destroy();
              await user.reload();
            } catch (error) {
              failure(`Couldn't disconnect ${label}`, error);
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const signOutDevice = (session: SessionWithActivity) => {
    const label = deviceLabel(session.latestActivity as SessionActivity);
    Alert.alert(`Sign out of ${label}?`, 'That device will need to sign in again to sync trips.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setBusy(session.id);
          try {
            await session.revoke();
            loadSessions();
          } catch (error) {
            failure("Couldn't sign that device out", error);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const signOutOthers = () => {
    Alert.alert(
      `Sign out of ${others.length} other ${others.length === 1 ? 'device' : 'devices'}?`,
      'You stay signed in here. The others will need to sign in again to sync trips.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setBusy('others');
            try {
              await Promise.all(others.map((s) => s.revoke()));
            } catch (error) {
              failure("Couldn't sign every device out", error);
            } finally {
              loadSessions();
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <SectionLabel>Sign-in</SectionLabel>
          <Group>
            <GroupRow
              testID="account-email"
              icon={{ ios: 'envelope', android: 'mail', web: 'mail' }}
              label="Email"
              value={email}
              onPress={() => router.push('/change-email')}
            />
            {PROVIDERS.map(({ provider, strategy, label, icon }) => {
              const account = user.externalAccounts.find(
                (a) => a.provider === provider && a.verification?.status === 'verified',
              );
              const working = busy === strategy || (!!account && busy === account.id);
              return (
                <View key={provider}>
                  <GroupSeparator />
                  <GroupRow
                    testID={`account-${provider}`}
                    icon={icon}
                    label={label}
                    value={account ? account.emailAddress || 'Connected' : 'Not connected'}
                    chevron={false}
                    accessory={
                      working ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <ThemedText type="smallBold" style={{ color: account ? theme.textSecondary : theme.tint }}>
                          {account ? 'Remove' : 'Connect'}
                        </ThemedText>
                      )
                    }
                    onPress={() =>
                      working ? undefined : account ? disconnect(account.id, label) : void connect(strategy, label)
                    }
                  />
                </View>
              );
            })}
          </Group>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            {verified
              ? 'You sign in with a code sent to this email, or with a connected account.'
              : 'This email is not verified yet. Change it to get a new code.'}
          </ThemedText>

          <SectionLabel>Signed in on</SectionLabel>
          <Group>
            <DeviceRow
              kind={Platform.OS === 'ios' ? 'iphone' : Platform.OS === 'android' ? 'android' : 'computer'}
              title={thisDevice}
              detail={['Active now', placeLabel(current?.latestActivity as SessionActivity)].filter(Boolean).join(' · ')}
              badge="This device"
            />
            {sessions === null ? (
              <>
                <GroupSeparator />
                <ActivityIndicator style={styles.devicesLoading} />
              </>
            ) : (
              shownOthers.map((session) => {
                const activity = session.latestActivity as SessionActivity;
                return (
                  <View key={session.id}>
                    <GroupSeparator />
                    <DeviceRow
                      testID={`account-session-${session.id}`}
                      kind={deviceKind(activity)}
                      title={deviceLabel(activity)}
                      detail={[activeLabel(session.lastActiveAt, now), placeLabel(activity)].filter(Boolean).join(' · ')}
                      busy={busy === session.id}
                      onPress={() => signOutDevice(session)}
                    />
                  </View>
                );
              })
            )}
            {others.length > FIRST_DEVICES && (
              <>
                <GroupSeparator />
                <GroupRow
                  testID="account-devices-toggle"
                  icon={{ ios: showAll ? 'chevron.up' : 'ellipsis', android: showAll ? 'expand_less' : 'more_horiz', web: 'more_horiz' }}
                  label={showAll ? 'Show fewer' : `Show all ${others.length}`}
                  chevron={false}
                  onPress={() => setShowAll((v) => !v)}
                />
              </>
            )}
          </Group>
          {others.length > 0 && (
            <Group>
              <GroupRow
                testID="account-sign-out-others"
                icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
                tone="danger"
                label="Sign out of other devices"
                chevron={false}
                accessory={busy === 'others' ? <ActivityIndicator size="small" /> : undefined}
                onPress={busy === 'others' ? undefined : signOutOthers}
              />
            </Group>
          )}

          <SectionLabel>Your data</SectionLabel>
          <Group>
            <GroupRow
              testID="account-delete"
              icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
              tone="danger"
              label="Delete account"
              onPress={() => router.push('/delete-account')}
            />
          </Group>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Deleting removes your account and the trips synced to it. Trips and memberships on this phone stay
            until you delete the app.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const DEVICE_ICONS: Record<ReturnType<typeof deviceKind>, SymbolViewProps['name']> = {
  iphone: { ios: 'iphone', android: 'phone_iphone', web: 'phone_iphone' },
  android: { ios: 'smartphone', android: 'phone_android', web: 'phone_android' },
  phone: { ios: 'smartphone', android: 'smartphone', web: 'smartphone' },
  computer: { ios: 'laptopcomputer', android: 'computer', web: 'computer' },
};

/** A signed-in device: what it is, where and when; tapping one that isn't
 * this device offers to sign it out. */
function DeviceRow({
  kind,
  title,
  detail,
  badge,
  busy,
  onPress,
  testID,
}: {
  kind: ReturnType<typeof deviceKind>;
  title: string;
  detail: string;
  badge?: string;
  busy?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[title, badge, detail].filter(Boolean).join(', ')}
      accessibilityHint={onPress ? 'Signs this device out' : undefined}
      disabled={!onPress || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.device, pressed && styles.pressed]}>
      <View style={[styles.deviceIcon, { backgroundColor: `${theme.tint}1F` }]}>
        <SymbolView name={DEVICE_ICONS[kind]} size={18} tintColor={theme.tint} />
      </View>
      <View style={styles.deviceText}>
        <View style={styles.deviceTitleRow}>
          <ThemedText style={styles.deviceTitle} numberOfLines={1}>
            {title}
          </ThemedText>
          {badge && (
            <View style={[styles.badge, { backgroundColor: `${theme.success}24` }]}>
              <ThemedText type="smallBold" style={[styles.badgeText, { color: theme.success }]}>
                {badge}
              </ThemedText>
            </View>
          )}
        </View>
        {!!detail && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {detail}
          </ThemedText>
        )}
      </View>
      {busy ? (
        <ActivityIndicator size="small" />
      ) : onPress ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          Sign out
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loading: {
    marginTop: Spacing.six,
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six * 2,
    gap: Spacing.three,
  },
  note: {
    marginTop: -Spacing.one,
    marginHorizontal: Spacing.two,
  },
  devicesLoading: {
    paddingVertical: Spacing.three,
  },
  device: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  deviceIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  deviceTitle: {
    flexShrink: 1,
    fontWeight: 600,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
  },
});
