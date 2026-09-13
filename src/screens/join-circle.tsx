import { useAuth } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Observe } from 'expo-observe';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { CIRCLE_FULL, FREE_CIRCLE_LABEL } from '../../convex/circleShared';

import { AppHandoff } from '@/components/app-handoff';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { trackEvent } from '@/services/analytics';
import { requestPushPermission } from '@/services/notifications';
import { clearPendingFollow, markPendingFollow, pendingFollowFor } from '@/services/pending-follow';
import { useProLocked } from '@/services/purchases';

/** The invite page behind getflyright.com/i/<token>: "Sam invited you to
 * follow their trips". Accepting files a follow request Sam allows in
 * People — the link travels, so holding it is not the same as being wanted
 * — and the page says "waiting for Sam" rather than "you're following".
 * (Sam's own in-app invitation to this person is the yes; then the link
 * joins on the spot and offers to share back, Find My style.) Reactive on
 * web for anyone (store pitch). */
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
  // What the tap came to: 'requested' (the usual — waits on the owner) or
  // 'following' (the owner had already invited this person in-app).
  const [joined, setJoined] = useState<{
    status: 'following' | 'requested';
    ownerId: string;
    sharingBack: boolean;
  } | null>(null);
  // Only the on-the-spot join can hit the cap (the owner's own invitation,
  // their circle filled up meanwhile); a request just waits for room.
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
      Observe.logEvent(result.status === 'following' ? 'circle.joined' : 'circle.requested');
      trackEvent(result.status === 'following' ? 'circle_joined' : 'circle_requested');
      // Land on the outcome before the OS prompt covers it — the reactive
      // query flips relation to 'member'/'requested' the moment the mutation
      // commits, and that branch would otherwise win the race and swallow
      // the share-back offer.
      setJoined(result);
      // The whole point of following is the pushes — the "allowed" one
      // first of all — and someone who only follows may never hit the app's
      // other permission moments. Ask now, while "you'll get a heads-up" is
      // still on screen. One-shot OS prompt; a no here is respected like
      // everywhere else (Settings can flip it).
      await requestPushPermission();
      if (result.status === 'following' && result.sharingBack) done();
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
    if (invite.relation !== 'none') {
      // Their own link, already following, or already asked — nothing left
      // to redeem, so drop the intent (the flag alone decides nothing on
      // screen).
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
      action = (
        <AppHandoff
          path={`/i/${token}`}
          title="Follow along in FlyRight"
          blurb={`Get the app and it opens on this invitation. Free on both stores; ${name}'s invite stays valid for 7 days.`}
          openLabel="Open the invitation"
        />
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
    } else if (joined?.status === 'requested' || invite.relation === 'requested') {
      action = (
        <Card>
          <ThemedText type="subtitle">Waiting for {name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {name} confirms who follows their trips. You&apos;ll get a notification the moment they say
            yes — then every heads-up and travel-day update follows.
          </ThemedText>
          <PrimaryButton label="Open People" onPress={done} />
        </Card>
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
    } else if (ownerFull) {
      // The owner's problem to solve, not the invitee's — no upsell here.
      action = (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {name}&apos;s circle is full for now. Free accounts share with {FREE_CIRCLE_LABEL};{' '}
            {name} can add more people with FlyRight Pro.
          </ThemedText>
          <PrimaryButton label="Open People" onPress={done} />
        </>
      );
    } else {
      action = (
        <>
          <PrimaryButton label={`Follow ${name}'s trips`} disabled={busy} onPress={onAccept} />
          {invite.full && (
            // A request to a full circle waits in People; the owner sees the
            // cap (and the way past it) when they tap Allow.
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {name}&apos;s circle is full right now — they can let you in once there&apos;s room.
            </ThemedText>
          )}
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
          <Avatar name={name} imageUrl={invite.ownerImageUrl} size={72} pro={invite.ownerPro} />
          <ThemedText type="title" themeColor="heading" style={styles.centered}>
            {name} invited you to follow their trips
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {name} confirms each follower first. You can stop following at any time.
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
  following: {
    alignItems: 'center',
    gap: Spacing.two,
  },
});
