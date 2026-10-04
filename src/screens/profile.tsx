import { useAuth, useClerk, useUser } from '@clerk/expo';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Group, GroupRow, GroupSeparator, SectionLabel } from '@/components/grouped-list';
import { SupportUnreadBadge } from '@/components/support-unread-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UpdateAvailableCard } from '@/components/update-available-card';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSignedOutNotice } from '@/hooks/use-signed-out-notice';
import { useTheme } from '@/hooks/use-theme';
import { describeMembership } from '@/services/loyalty-programmes';
import { useMemberships, type MembershipRow } from '@/services/memberships';
import { planLabel } from '@/services/plan-label';
import { billingAvailable, useHasPro, useProEntitlement } from '@/services/purchases';

/** "1.0.0 (6)" from the installed binary; the JS config version on web. */
function versionLine(): string {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '';
  const build = Application.nativeBuildVersion;
  return `FlyRight · version ${version}${build ? ` (${build})` : ''}`;
}

/** The avatar's door: who you are, your memberships, and the way to
 * everything about the account. Settings holds the switches. */
export function Profile() {
  const router = useRouter();
  const { isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const { signOut } = useClerk();
  const pro = useProEntitlement();
  const memberships = useMemberships(userId);

  const onSignOut = () => {
    Alert.alert('Sign out?', 'Your trips stay on this phone. Sign back in to keep syncing them.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <UpdateAvailableCard />

          {!isLoaded ? <HeaderSkeleton /> : isSignedIn ? <ProfileHeader /> : <SignedOutCard />}

          <SectionLabel>Memberships</SectionLabel>
          <MembershipsCard rows={memberships} onPress={() => router.push('/memberships')} />

          <SectionLabel>General</SectionLabel>
          <Group>
            <GroupRow
              testID="profile-settings"
              icon={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
              label="Settings"
              value="Notifications, privacy"
              onPress={() => router.push('/settings')}
            />
            {isSignedIn && (
              <>
                <GroupSeparator />
                {/* The sign-in email, Apple and Google, signed-in devices
                    and deleting the account (screens/account). */}
                <GroupRow
                  testID="profile-account"
                  icon={{ ios: 'person.badge.key', android: 'manage_accounts', web: 'manage_accounts' }}
                  label="Account & security"
                  value="Email, devices"
                  onPress={() => router.push('/account')}
                />
              </>
            )}
            {billingAvailable && (
              <>
                <GroupSeparator />
                <GroupRow
                  testID="profile-pro"
                  icon={{ ios: 'star', android: 'star', web: 'star' }}
                  tone="pro"
                  label={pro ? 'FlyRight Pro' : 'Get FlyRight Pro'}
                  value={pro ? planLabel(pro.productIdentifier) : 'Free plan'}
                  onPress={() => router.push(pro ? '/manage-subscription' : '/pro-offer')}
                />
              </>
            )}
            <GroupSeparator />
            {/* Signed in it opens the conversations (replies land there and
                by email); anonymous it is the form itself. */}
            <GroupRow
              testID="contact-support"
              icon={{ ios: 'questionmark.circle', android: 'help', web: 'help' }}
              label="Help & support"
              onPress={() => router.push(isSignedIn ? '/messages' : '/contact')}
              accessory={<SupportUnreadBadge />}
            />
          </Group>

          {isSignedIn && (
            <Group>
              <GroupRow
                testID="sign-out"
                icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
                tone="danger"
                label="Sign out"
                chevron={false}
                onPress={onSignOut}
              />
            </Group>
          )}

          <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
            FlyRight generates claim documents for you to send yourself. It is not a law firm and
            takes no commission — you keep 100% of what you recover.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
            {versionLine()}
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ProfileHeader() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useUser();
  const hasPro = useHasPro();
  const email = user?.primaryEmailAddress?.emailAddress;
  const name = user?.fullName?.trim() || null;
  return (
    <View style={styles.header}>
      <View>
        <Avatar name={name ?? email ?? ''} imageUrl={user?.imageUrl ?? null} size={96} pro={hasPro} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change photo"
          onPress={() => router.push('/edit-profile')}
          style={[styles.cameraButton, { backgroundColor: theme.backgroundSelected, borderColor: theme.background }]}>
          <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} size={15} tintColor={theme.tint} />
        </Pressable>
      </View>
      <ThemedText type="subtitle" style={styles.name} numberOfLines={1}>
        {name ?? email ?? 'Signed in'}
      </ThemedText>
      {name && email ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {email}
        </ThemedText>
      ) : null}
      <Pressable
        testID="edit-profile"
        accessibilityRole="button"
        onPress={() => router.push('/edit-profile')}
        style={({ pressed }) => [styles.editButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
        <ThemedText type="smallBold">Edit profile</ThemedText>
      </Pressable>
    </View>
  );
}

function HeaderSkeleton() {
  return (
    <View style={styles.header}>
      <ThemedView type="backgroundSelected" style={styles.skeletonAvatar} />
      <ThemedView type="backgroundSelected" style={[styles.skeletonBar, { width: '45%' }]} />
      <ThemedView type="backgroundSelected" style={[styles.skeletonBar, { width: '60%' }]} />
    </View>
  );
}

function SignedOutCard() {
  const router = useRouter();
  const notice = useSignedOutNotice();
  return (
    <ThemedView type="backgroundElement" style={styles.signedOut}>
      <ThemedText type="subtitle">{notice ? 'You were signed out' : 'Your account'}</ThemedText>
      <ThemedText type="small">
        {notice
          ? `Your sign-in ran out${notice.email ? ` for ${notice.email}` : ''}. Your trips are still on this phone — sign back in to keep syncing.`
          : 'Keep your purchases and travel history safe across devices.'}
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')}>
        <ThemedText type="link">{notice ? 'Sign back in' : 'Sign in or create account'}</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

/** The memberships door: a small stack of the cards themselves, how many,
 * and their tiers in a line. */
function MembershipsCard({ rows, onPress }: { rows: MembershipRow[] | undefined; onPress: () => void }) {
  const theme = useTheme();
  const count = rows?.length ?? 0;
  const summary = (rows ?? [])
    .map((m) => {
      const d = describeMembership(m);
      return m.tier ? `${d.short} ${m.tier}` : d.short;
    })
    .join(' · ');
  const stack = (rows ?? []).slice(0, 3).map((m) => describeMembership(m).card);
  // Stacked as on the Memberships screen: the cards behind peek out above.
  const shown = stack.length ? stack : [{ from: theme.backgroundSelected, to: theme.backgroundSelected, accent: theme.tint }];
  return (
    <Pressable
      testID="profile-memberships"
      accessibilityRole="button"
      accessibilityLabel={count ? `Memberships, ${count} programmes, ${summary}` : 'Add a frequent flyer membership'}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.membershipsCard}>
        <View style={[styles.miniStack, { height: MINI_HEIGHT + (shown.length - 1) * MINI_PEEK }]}>
          {shown.map((card, i) => {
            // How far behind the front card this one sits: each step back
            // is narrower and fainter, so the edges show on any background.
            const depth = shown.length - 1 - i;
            return (
              <View
                key={i}
                style={[
                  styles.miniCard,
                  {
                    top: i * MINI_PEEK,
                    left: depth * MINI_INSET,
                    width: MINI_WIDTH - depth * MINI_INSET * 2,
                    opacity: 1 - depth * 0.35,
                    boxShadow: i ? '0 -1px 3px rgba(0, 0, 0, 0.3)' : undefined,
                    backgroundColor: card.from,
                    experimental_backgroundImage: `linear-gradient(135deg, ${card.from} 0%, ${card.to} 100%)`,
                  },
                ]}>
                <View style={[styles.miniStripe, { backgroundColor: card.accent }]} />
              </View>
            );
          })}
        </View>
        <View style={styles.membershipsText}>
          <ThemedText style={styles.membershipsTitle}>
            {count ? `${count} ${count === 1 ? 'programme' : 'programmes'}` : 'Add your frequent flyer cards'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
            {count ? summary : 'Membership numbers, tiers and miles in one place. They stay on this phone.'}
          </ThemedText>
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

const MINI_WIDTH = 64;
const MINI_HEIGHT = 42;
const MINI_PEEK = 7;
const MINI_INSET = 6;

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
  header: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  cameraButton: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: Spacing.two,
  },
  editButton: {
    marginTop: Spacing.two,
    minHeight: 40,
    paddingHorizontal: Spacing.four,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  skeletonAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  skeletonBar: {
    height: 16,
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
  },
  signedOut: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  membershipsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  miniStack: {
    width: MINI_WIDTH,
  },
  miniCard: {
    position: 'absolute',
    left: 0,
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    padding: 8,
  },
  miniStripe: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  membershipsText: {
    flex: 1,
    gap: Spacing.half,
  },
  membershipsTitle: {
    fontSize: 17,
    fontWeight: 700,
  },
  footnote: {
    marginTop: Spacing.two,
  },
  version: {
    textAlign: 'center',
  },
});
