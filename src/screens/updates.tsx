import { useAuth, useUser } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { FeedCard } from '@/components/feed-card';
import { FollowingSection } from '@/components/following-section';
import {
  EmptyPostcards,
  FriendsStrip,
  GetStarted,
  HasFollower,
  PendingFollow,
  UpdatesWelcome,
} from '@/components/first-steps';
import { HomeSkeleton } from '@/components/home-skeleton';
import { LivePass } from '@/components/live-pass';
import { PaneOutline } from '@/components/pane-placeholders';
import { PadTabBarClearance, SplitPanes } from '@/components/split-panes';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useHeroTrip } from '@/components/travel-day-banner';
import { CONVEX_URL } from '@/constants/config';
import { MaxContentWidth, Spacing, paneShare } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useReactToUpdate } from '@/hooks/use-react-to-update';
import { useAuthSettled, useSettled } from '@/hooks/use-settled';
import { useSplitLayout } from '@/hooks/use-split-layout';
import { useJourneys } from '@/services/journeys';
import { CommentSheet } from '@/screens/update-viewer';
import { onHomeScreen } from '@/services/public-session';

/** Updates: what the people you follow are up to.
 *
 * The second tab. The faces of whoever you follow who is flying lead it,
 * then what they have posted. It used to be Home, the tab the app opened
 * on, with your own live card over the feed — and testers opening FlyRight
 * for their own flight found other people's news first. Your flight and
 * its live card are on Flights now, the first tab; this one is the feed.
 *
 * On a day with nothing in the air this is not an empty screen: a brand-new
 * person gets the two steps that make the rest of it possible (FirstSteps),
 * and everyone else gets the quietest true thing there is to say. */
export function Updates() {
  const router = useRouter();
  const { userId, isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user } = useUser();
  const now = useNow(60_000);
  const { data: journeys } = useJourneys(userId);
  const hero = useHeroTrip(journeys ?? [], now);

  const live = !!CONVEX_URL;
  const feed = useQuery(api.updates.feed, live && isSignedIn ? {} : 'skip');
  // The same read the rail makes, so the card below it cannot contradict it:
  // it used to say "nobody is flying" over a row of faces that were.
  const entries = useQuery(api.live.following, live && isSignedIn ? {} : 'skip');
  const circle = useQuery(api.circle.list, live && isSignedIn ? {} : 'skip');
  const respond = useMutation(api.circle.respondToRequest);
  const followBack = useMutation(api.circle.requestFollow);
  const react = useReactToUpdate();
  // "Sign in and invite friends": once the sign-in actually completes, the
  // invite sheet opens. A cancelled sign-in never flips isSignedIn, so it
  // opens nothing. (Chaining it through sign-in's `next` would open the
  // invite on a cancel too — onDismiss fires either way.)
  const inviteAfterSignIn = useRef(false);
  useEffect(() => {
    if (!isSignedIn || !inviteAfterSignIn.current) return;
    inviteAfterSignIn.current = false;
    router.push('/add-person');
  }, [isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // The postcard whose replies are open, if any.
  const [replying, setReplying] = useState<string | null>(null);
  const following = circle?.following ?? [];
  const followers = circle?.followers ?? [];

  // A follow that has been asked for and not yet answered. It comes in four
  // shapes and all of them belong here: an invitation you sent or were sent
  // ('invite'), and a request to follow that you filed or were filed
  // ('follow' — which is what redeeming somebody's link actually creates).
  // Whatever is waiting on YOU comes first, because that is the one you can
  // do something about.
  const mine = circle?.followRequests?.[0] ?? circle?.incoming?.[0] ?? null;
  const theirs = circle?.asked?.[0] ?? circle?.outgoing?.[0] ?? null;
  const pending = mine
    ? {
        id: mine.id,
        name: mine.name,
        imageUrl: mine.imageUrl,
        waitingOnMe: true,
        follow: !!circle?.followRequests?.length,
      }
    : theirs
      ? {
          id: theirs.id,
          name: theirs.name,
          imageUrl: theirs.imageUrl,
          waitingOnMe: false,
          follow: !!circle?.asked?.length,
        }
      : null;
  const flying = (entries ?? []).filter(({ session }) => onHomeScreen(session, now));
  const posts = feed ?? [];
  // What stands in for the postcards when there are none — decided by who
  // this person has, never by their own flight (that is Flights'):
  //   nobody at all        → an ask to follow someone (or the one waiting)
  //   followers, no one to watch → follow them back
  //   people, none posting → the friends strip (on a quiet day) and a
  //                          placeholder where their postcards will land
  const empty: 'follow' | 'followers' | 'asked' | 'quiet' | 'waiting' | null = posts.length
    ? null
    : following.length
      ? flying.length
        ? 'waiting'
        : 'quiet'
      : followers.length
        ? 'followers'
        : pending
          ? 'asked'
          : 'follow';

  // Every answer above reads "not back yet" as "nothing": a cold start used
  // to show Sign in (Clerk still restoring), then Add a flight (the reads
  // still in flight), then the postcards. Hold one skeleton until the
  // session, the journal and the three reads are in — capped, so a network
  // that never answers still gets the screen.
  const authSettled = useAuthSettled(authLoaded);
  const reading =
    live && !!isSignedIn && (feed === undefined || entries === undefined || circle === undefined);
  const readsSettled = useSettled(!reading, READS_SETTLE_CAP_MS);
  const loading = !authSettled || journeys == null || !readsSettled;

  // Wide windows (docs/wide-layouts-plan.md §7): the feed keeps its column
  // and who is travelling moves into a panel beside it — the live faces, or
  // on a quiet day everyone's next trip. Nothing is selected here. Split once
  // the screen knows what to say; the skeleton stays single-column.
  // The feed takes the larger share; the panel beside it never drops below
  // a small phone's width (paneShare).
  const layout = useSplitLayout('updates', { primaryWidth: (width) => width - paneShare(0.42)(width) });
  const split = layout.split && !loading;
  // Everyone you follow's next trip, as the phone's quiet-day strip shows it;
  // on a wide window it stands in the panel whenever you follow someone.
  const stripPeople = following.map((p) => ({
    userId: p.userId,
    name: p.name,
    imageUrl: p.imageUrl,
    next: p.next
      ? {
          toCode: p.next.toCode,
          fromCode: p.next.fromCode,
          scheduledDeparture: p.next.scheduledDeparture,
        }
      : null,
  }));
  const friendsStrip =
    following.length > 0 ? (
      <FriendsStrip
        people={stripPeople}
        onOpenPerson={(id) => router.push({ pathname: '/person/[id]', params: { id } })}
        onOpenFriends={() => router.push('/people')}
      />
    ) : null;
  const quietStrip = empty === 'quiet' ? friendsStrip : null;
  // The panel's pass for each friend in the air, the one Friends shows.
  const inTheAir = split
    ? following.filter((p) => p.live && onHomeScreen(p.live.session, now))
    : [];
  // The panel's own words while there is nobody to show in it.
  const panelCaption =
    !isSignedIn || empty === 'follow'
      ? 'When friends fly, their live status shows here.'
      : empty === 'asked' && pending
        ? `Once ${pending.name.split(' ')[0]} says yes, their travel days show here.`
        : empty === 'followers'
          ? 'Follow someone back to see their travel days here.'
          : null;

  const feedColumn = (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {/* Titled like Friends: this tab is about other people. You, greeted,
            and the door to your settings are on Flights, the first tab. */}
        <View style={styles.titleRow}>
          <ThemedText type="tabTitle" themeColor="heading">
            Updates
          </ThemedText>
        </View>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}>
          {loading ? (
            <HomeSkeleton />
          ) : !isSignedIn ? (
            // Following needs an account; this tab is nothing but following.
            <UpdatesWelcome
              onSignIn={() => {
                inviteAfterSignIn.current = true;
                router.push({ pathname: '/sign-in', params: { next: '/updates' } });
              }}
            />
          ) : (
            <>
              {/* A follow waiting on you comes first, whatever else is here:
                  this is the tab where your circle's news is, so it is
                  answered here and not only when the tab happens to be empty. */}
              {pending?.waitingOnMe && (
                <PendingFollow
                  {...pending}
                  me={{ name: user?.fullName ?? user?.firstName ?? 'You', imageUrl: user?.imageUrl ?? null }}
                  onAnswer={(requestId, accept) =>
                    void respond({ requestId: requestId as Id<'circleRequests'>, accept })
                  }
                />
              )}

              {/* The faces of anyone you follow who is in the air — and your
                  own tile while your postcards are out. On a wide window
                  they are the panel beside the feed instead. */}
              {live && !split && <FollowingSection own={hero} />}

              {empty === 'follow' && <GetStarted onFindPeople={() => router.push('/add-person')} />}
              {/* A follow you asked for and are waiting on. (One waiting on
                  you is already at the top.) */}
              {empty === 'asked' && pending && !pending.waitingOnMe && (
                <PendingFollow
                  {...pending}
                  me={{ name: user?.fullName ?? user?.firstName ?? 'You', imageUrl: user?.imageUrl ?? null }}
                  onAnswer={() => {}}
                />
              )}
              {empty === 'followers' && (
                <HasFollower
                  people={followers.map((p) => ({ userId: p.userId, name: p.name, imageUrl: p.imageUrl }))}
                  onOpenPerson={(id) => router.push({ pathname: '/person/[id]', params: { id } })}
                  // Swallowing this hid a real failure for an afternoon: the ask
                  // threw "No such person" and the card sat there looking fine.
                  onFollowBack={(id) =>
                    void followBack({ userId: id }).catch(() =>
                      Alert.alert(
                        "That didn't go through",
                        'Check your connection and try again, or open Friends to follow them there.',
                      ),
                    )
                  }
                  onOpenFriends={() => router.push('/people')}
                />
              )}
              {!split && quietStrip}
              {(empty === 'quiet' || empty === 'waiting') && (
                <EmptyPostcards
                  line={
                    // "Your friends", always: a bare "Nothing posted yet" read as
                    // the viewer's own posts.
                    empty === 'waiting'
                      ? 'No postcards from your friends yet. When one of them shares a photo or a line from the trip, it lands here for two days.'
                      : 'No postcards from your friends yet. When they travel, the photos and lines they share land here.'
                  }
                />
              )}

              {/* "Postcards": sent to you by someone else, so it cannot be misread as
                  your own trips (as "Latest from trips" was).
                  The posts are a section of this screen, not a continuation of
                  the card above them. */}
              {!!posts.length && (
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.noteLabel}>
                  POSTCARDS
                </ThemedText>
              )}

              {posts.map((post) => (
                <FeedCard
                  key={post.updateId}
                  post={post}
                  now={now}
                  onOpenPerson={() =>
                    router.push({ pathname: '/person/[id]', params: { id: post.owner.userId } })
                  }
                  onOpenPhoto={() =>
                    router.push({
                      pathname: '/update-viewer',
                      params: {
                        ownerId: post.owner.userId,
                        journeyId: post.trip.journeyId,
                        updateId: post.updateId,
                        name: post.owner.name,
                      },
                    })
                  }
                  onReact={() => void react({ updateId: post.updateId as Id<'tripUpdates'> })}
                  onComment={() => setReplying(post.updateId)}
                  onReport={() =>
                    router.push({
                      pathname: '/report',
                      params: { userId: post.owner.userId, name: post.owner.name, updateId: post.updateId },
                    })
                  }
                />
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
  );

  return (
    <ThemedView style={styles.fill}>
      <SplitPanes
        layout={{ ...layout, split }}
        primary={feedColumn}
        secondary={
          <SafeAreaView edges={['top', 'right']} style={styles.fill}>
            <ScrollView
              // The SafeAreaView pads the top; "automatic" would add it twice.
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={styles.panel}
              showsVerticalScrollIndicator={false}>
              {panelCaption ? (
                <PaneOutline kind="people" caption={panelCaption} />
              ) : (
                <>
                  {live && <FollowingSection own={hero} />}
                  {inTheAir.map((p) => (
                    <LivePass
                      key={p.userId}
                      person={p}
                      session={p.live!.session}
                      onward={p.live!.onward ?? []}
                      now={now}
                      onPress={() => router.push({ pathname: '/person/[id]', params: { id: p.userId } })}
                    />
                  ))}
                  {/* The quiet-day card, minus its "Nobody is flying right now"
                      line while anyone is in the air. */}
                  {following.length > 0 && (
                    <FriendsStrip
                      people={stripPeople}
                      onOpenPerson={(id) => router.push({ pathname: '/person/[id]', params: { id } })}
                      onOpenFriends={() => router.push('/people')}
                      someoneFlying={inTheAir.length > 0 || flying.length > 0}
                    />
                  )}
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        }
      />
      {/* The same thread the full-screen photo opens, so a text-only
          postcard can be answered too. */}
      <CommentSheet visible={!!replying} updateId={replying ?? ''} onClose={() => setReplying(null)} />
    </ThemedView>
  );
}

/** How long Updates holds its skeleton for the feed, the rail and the circle
 * once signed in. The reads normally land in well under a second; past this
 * the screen shows what it has rather than hang on a network that won't
 * answer. */
const READS_SETTLE_CAP_MS = 6000;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  // Friends' header, measured: its row is as tall as the 40pt invite button
  // and the content starts Spacing.three under it. Without the same numbers
  // the two tabs' content started at different heights.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  // A wide window's panel beside the feed, clear of iPadOS's floating tab bar.
  panel: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + PadTabBarClearance,
    paddingBottom: Spacing.six,
  },
  noteLabel: { fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
});
