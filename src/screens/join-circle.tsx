import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Observe } from 'expo-observe';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { CIRCLE_FULL } from '../../convex/circleShared';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { DETOUR_LINK_BASE } from '@/constants/config';
import { STORE_URLS } from '@/constants/store-links';
import { trackEvent } from '@/services/analytics';
import { INVITE_URL } from '@/services/circle';
import { appLink, storeLink } from '@/services/deferred-links';
import { requestPushPermission } from '@/services/notifications';
import { clearPendingFollow, markPendingFollow, pendingFollowFor } from '@/services/pending-follow';
import { useProLocked } from '@/services/purchases';

const APP_STORE_ID = STORE_URLS.ios.match(/id(\d+)/)?.[1] ?? '';

/** The invite page behind getflyright.com/i/<token>: "Sam invited you to
 * follow their trips". Accepting joins Sam's circle; the follow-up offers to
 * share back, Find My style. Reactive on web for anyone (store pitch). */
export function JoinCircle({ token }: { token: string }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  // Clerk knows the account before Convex holds a token for it; the invite is
  // redeemed with a Convex identity, so that is the signal to wait for.
  const { isAuthenticated } = useConvexAuth();
  const invite = useQuery(api.circle.inviteByToken, { token });
  const accept = useMutation(api.circle.accept);
  const shareBack = useMutation(api.circle.shareBack);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ ownerId: string; sharingBack: boolean } | null>(null);
  // Owner hit the free cap between minting the link and this tap — the
  // reactive query normally catches it first (invite.full).
  const [ownerFull, setOwnerFull] = useState(false);
  // A follow that didn't land (offline, invite redeemed elsewhere). Shown
  // rather than swallowed: a button that does nothing when tapped is how an
  // invite dies silently, which is exactly what used to happen here.
  const [failed, setFailed] = useState(false);
  // This invite is the one they tapped "Sign in to follow" on — set on that
  // tap, and re-read from storage on mount so it survives a screen the
  // sign-in sheet re-created (or an app the OAuth round trip relaunched).
  const [pending, setPending] = useState(() => pendingFollowFor(token));
  // One automatic redemption per visit — accept() also spends one of the
  // invite's uses, so a re-entrant effect must not double-tap it.
  const redeeming = useRef(false);
  const proLocked = useProLocked();

  // Back to the People tab, wherever this page was pushed from.
  const done = useCallback(() => router.replace('/(tabs)/(people)/people'), [router]);

  const onAccept = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await accept({ token });
      clearPendingFollow();
      setPending(false);
      Observe.logEvent('circle.joined');
      trackEvent('circle_joined');
      // Land on "you're following" before the OS prompt covers it — the
      // reactive query flips relation to 'member' the moment the mutation
      // commits, and that branch would otherwise win the race and swallow
      // the share-back offer.
      setJoined(result);
      // The whole point of following is the pushes, and someone who only
      // follows may never hit the app's other permission moments — ask now,
      // while "you'll get a heads-up" is still on screen. One-shot OS prompt;
      // a no here is respected like everywhere else (Settings can flip it).
      await requestPushPermission();
      if (result.sharingBack) done();
    } catch (e) {
      if (e instanceof ConvexError && e.data === CIRCLE_FULL) setOwnerFull(true);
      // Otherwise offline, or expired mid-view (the reactive query flips to
      // gone). Either way the traveller gets a reason and a retry.
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [accept, done, token]);

  // "Sign in to follow" has to mean follow: with an account and a Convex
  // identity in hand, redeem the invite they already said yes to. Without
  // this the traveller comes back to a screen that looks like the one they
  // left, its button quietly relabelled, and the follow waits on a second
  // tap nobody made (see services/pending-follow).
  useEffect(() => {
    if (redeeming.current || !pending || !isAuthenticated || busy || joined || failed) return;
    if (invite === undefined || 'gone' in invite) return;
    if (invite.relation !== 'none' || invite.full) {
      // Their own link, already following, or the circle filled up while
      // they signed in — nothing left to redeem, so drop the intent (the
      // flag alone decides nothing on screen).
      clearPendingFollow();
      return;
    }
    redeeming.current = true;
    // The busy/failed flags this sets are the point — the traveller watches
    // the invite redeem itself, and sees it if that fails.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: signing in *is* the tap
    void onAccept();
  }, [pending, isAuthenticated, busy, joined, failed, invite, onAccept]);

  const onShareBack = async () => {
    if (!joined) return;
    setBusy(true);
    try {
      await shareBack({ userId: joined.ownerId });
      trackEvent('circle_shared_back');
    } catch (e) {
      // My own circle is at the free cap. Offer Pro; the paywall lands on
      // People either way, which is where `done` was heading.
      if (e instanceof ConvexError && e.data === CIRCLE_FULL && proLocked) {
        setBusy(false);
        router.replace({ pathname: '/paywall', params: { next: '/people' } });
        return;
      }
      // Otherwise already severed on their side — nothing to share back to.
    } finally {
      setBusy(false);
      done();
    }
  };

  // iOS Smart App Banner: Safari shows a native "GET"/"OPEN" bar with the
  // App Store id; the argument brings the invite along when the app opens.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const meta = document.createElement('meta');
    meta.name = 'apple-itunes-app';
    meta.content = `app-id=${APP_STORE_ID}, app-argument=${INVITE_URL(token)}`;
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [token]);

  let body: React.ReactNode;
  if (invite === undefined) {
    body = <ActivityIndicator style={styles.spinner} />;
  } else if ('gone' in invite) {
    body = (
      <Card>
        <ThemedText type="subtitle">This invite has expired</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Invite links last 7 days. Ask them to send a fresh one from the People tab.
        </ThemedText>
      </Card>
    );
  } else {
    const name = invite.ownerName;
    let action: React.ReactNode;
    if (Platform.OS === 'web') {
      // Through Detour on a phone, so the install lands back on this invite.
      const store = (platform: 'ios' | 'android') =>
        storeLink(platform, `/i/${token}`, { base: DETOUR_LINK_BASE, userAgent: navigator.userAgent });
      action = (
        <Card>
          <ThemedText type="subtitle">Follow along in FlyRight</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Get the app and it opens on this invite. Free on both stores; the invite stays
            valid for 7 days.
          </ThemedText>
          <View style={styles.storeRow}>
            <Pressable onPress={() => window.open(store('ios'), '_blank')}>
              <ThemedText type="linkPrimary">App Store</ThemedText>
            </Pressable>
            <Pressable onPress={() => window.open(store('android'), '_blank')}>
              <ThemedText type="linkPrimary">Google Play</ThemedText>
            </Pressable>
          </View>
          {/* Tapping the link again after installing used to land right back
              here, on two store buttons — the app is on the phone, so offer
              it. Its own scheme, because the https link is this page. */}
          <Pressable onPress={() => window.location.assign(appLink(`/i/${token}`) ?? '')}>
            <ThemedText type="link">Already have FlyRight? Open the invite</ThemedText>
          </Pressable>
        </Card>
      );
    } else if (!isSignedIn) {
      action = (
        <PrimaryButton
          label="Sign in to follow"
          onPress={() => {
            // Remember what the tap was for, so signing in finishes it.
            markPendingFollow(token);
            setPending(true);
            router.push({ pathname: '/sign-in', params: { next: `/i/${token}` } });
          }}
        />
      );
    } else if (pending && busy) {
      // Redeeming the invite they signed in for — no button to find.
      action = (
        <View style={styles.following}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Following {name}…
          </ThemedText>
        </View>
      );
    } else if (invite.relation === 'self') {
      action = (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          This is your own invite link — send it to the people who should follow your trips.
        </ThemedText>
      );
    } else if (joined) {
      action = (
        <Card>
          <ThemedText type="subtitle">You&apos;re following {name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Share your trips back so {name} gets your updates too?
          </ThemedText>
          <PrimaryButton label={`Share my trips with ${name}`} disabled={busy} onPress={onShareBack} />
          <Pressable onPress={done} disabled={busy} style={styles.centered}>
            <ThemedText type="link">Not now</ThemedText>
          </Pressable>
        </Card>
      );
    } else if (invite.relation === 'member') {
      action = (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            You already follow {name}&apos;s trips.
          </ThemedText>
          <PrimaryButton label="Open People" onPress={done} />
        </>
      );
    } else if (invite.full || ownerFull) {
      // The owner's problem to solve, not the invitee's — no upsell here.
      action = (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {name}&apos;s circle is full for now. Free accounts share with one person; {name} can
            add more people with FlyRight Pro.
          </ThemedText>
          <PrimaryButton label="Open People" onPress={done} />
        </>
      );
    } else {
      action = (
        <>
          <PrimaryButton label={`Follow ${name}'s trips`} disabled={busy} onPress={onAccept} />
          {failed && (
            <ThemedText type="small" themeColor="danger" style={styles.centered}>
              That didn&apos;t go through — check your connection and tap again.
            </ThemedText>
          )}
        </>
      );
    }

    body = (
      <>
        <View style={styles.hero}>
          <Avatar name={name} imageUrl={invite.ownerImageUrl} size={72} />
          <ThemedText type="title" themeColor="heading" style={styles.centered}>
            {name} invited you to follow their trips
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            You can stop following at any time.
          </ThemedText>
        </View>
        <Card>
          <Bullet>A heads-up 24 hours before {name} flies</Bullet>
          <Bullet>A nudge at every step — at the airport, through security, on board, landed</Bullet>
          <Bullet>Delays and gate changes as they happen</Bullet>
        </Card>
        {action}
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Invitation' }} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {body}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <ThemedText type="small" themeColor="tint">
        ✓
      </ThemedText>
      <ThemedText type="small" style={styles.bulletText}>
        {children}
      </ThemedText>
    </View>
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
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  spinner: {
    marginTop: Spacing.six,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  centered: {
    textAlign: 'center',
    alignSelf: 'center',
  },
  bullet: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
  storeRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  following: {
    alignItems: 'center',
    gap: Spacing.two,
  },
});
