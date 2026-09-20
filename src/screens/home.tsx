import { useAuth, useUser } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { Avatar } from '@/components/avatar';
import { AddFlightButton } from '@/components/add-flight-button';
import { FeedCard } from '@/components/feed-card';
import { GhostPost } from '@/components/ghost-trips';
import { FollowingSection } from '@/components/following-section';
import { FirstSteps } from '@/components/first-steps';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HomeHero, useHeroTrip } from '@/components/travel-day-banner';
import { CONVEX_URL } from '@/constants/config';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppVersion } from '@/hooks/use-app-version';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useJourneys } from '@/services/journeys';
import { onHomeScreen } from '@/services/public-session';
import { travelStats } from '@/services/timeline';

/** Home: what is happening right now.
 *
 * The tab the app opens on. Your own travel day leads it, then the people
 * you follow who are flying, then what they have posted. The journal — every
 * flight you have ever taken, and the button that adds one — stays on
 * Flights; these two tabs sit next to each other, so anything that appeared
 * on both would read as one screen shown twice.
 *
 * On a day with nothing in the air this is not an empty screen: a brand-new
 * person gets the two steps that make the rest of it possible (FirstSteps),
 * and everyone else gets the quietest true thing there is to say. */
export function Home() {
  const router = useRouter();
  const { userId, isSignedIn } = useAuth();
  const { user } = useUser();
  const now = useNow(60_000);
  const { data: journeys } = useJourneys(userId);
  const hero = useHeroTrip(journeys ?? [], now);
  const stats = useMemo(() => travelStats(journeys ?? []), [journeys]);

  const live = !!CONVEX_URL;
  const feed = useQuery(api.updates.feed, live && isSignedIn ? {} : 'skip');
  // The same read the rail makes, so the card below it cannot contradict it:
  // it used to say "nobody is flying" over a row of faces that were.
  const entries = useQuery(api.live.following, live && isSignedIn ? {} : 'skip');
  const circle = useQuery(api.circle.list, live && isSignedIn ? {} : 'skip');
  const respond = useMutation(api.circle.respondToRequest);
  const followBack = useMutation(api.circle.requestFollow);
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
  // The card stands in only when Home would otherwise be blank: no travel
  // day of your own, nobody in the air, nothing posted. Anything else and
  // the screen already has something true on it.
  const flying = (entries ?? []).filter(({ session }) => onHomeScreen(session, now));
  const posts = feed ?? [];
  // Three questions decide this screen, in this order: is anything in the air
  // (yours or theirs), has anyone posted, and failing both, what does this
  // person have at all. Only the last one gets the standing card.
  const inTheAir = !!hero || flying.length > 0;
  const bare = !inTheAir && !posts.length;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="title">Home</ThemedText>
          <View style={styles.titleActions}>
            {/* Adding a flight is a thing you do from anywhere, so it sits
                where every list screen puts it — and to the left of you. */}
            <AddFlightButton onPress={() => router.push('/add')} />
            <ProfileButton
              imageUrl={user?.imageUrl ?? null}
              name={user?.fullName ?? user?.firstName ?? null}
              onPress={() => router.push('/settings')}
            />
          </View>
        </View>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}>
          {/* The faces of anyone you follow who is in the air, above your
              own card — one row however many are flying. */}
          {live && <FollowingSection own={hero} />}

          {/* Your travel day, or — when there isn't one — the quietest true
              thing Home can say. Never the all-time card: that is Flights'. */}
          <HomeHero
            journeys={journeys ?? []}
            stats={stats}
            // The live card alone: the all-time summary is the Flights tab's,
            // and the two sit next to each other.
            variant="glance"
            fallback={null}
          />

          {bare && (
            <FirstSteps
              signedIn={!!isSignedIn}
              pending={pending}
              following={following.map((p) => ({
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
              }))}
              followers={followers.map((p) => ({
                userId: p.userId,
                name: p.name,
                imageUrl: p.imageUrl,
              }))}
              onOpenPerson={(id) => router.push({ pathname: '/person/[id]', params: { id } })}
              me={{ name: user?.fullName ?? user?.firstName ?? 'You', imageUrl: user?.imageUrl ?? null }}
              onAnswer={(requestId, accept) =>
                void respond({ requestId: requestId as Id<'circleRequests'>, accept })
              }
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
            />
          )}

          {/* Something is happening, but nobody has said anything about it.
              A line, not a card: the live card above is the screen's subject
              and this only accounts for the space under it. */}
          {inTheAir && !posts.length && (
            <NothingPosted
              following={following.length > 0}
              mine={!!hero}
              onFind={() => router.push('/people')}
            />
          )}

          {/* The same heading the Friends tab puts over its feed: the posts
              are a section of this screen, not a continuation of the card
              above them. */}
          {!!posts.length && (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.noteLabel}>
              LATEST FROM TRIPS
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
              onReact={() => {}}
              onReport={() => {}}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** The header's door to Settings. Signed in it is your face, so the way to
 * your own things is where a profile always is; signed out it is the plain
 * person glyph, because there is nobody to show yet and initials of nothing
 * ("?") read as something having gone wrong.
 *
 * A blue dot, never a red count: red on this app means a person is waiting
 * for an answer, and that lives on Friends. */
function ProfileButton({
  imageUrl,
  name,
  onPress,
}: {
  imageUrl: string | null;
  name: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { update } = useAppVersion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        name
          ? update
            ? 'You and settings, update available'
            : 'You and settings'
          : 'Settings and sign in'
      }
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.avatarTap, pressed && styles.pressed]}>
      {name ? (
        <Avatar name={name} imageUrl={imageUrl} size={AVATAR} />
      ) : (
        <SymbolView
          name="person.crop.circle"
          size={AVATAR}
          tintColor={theme.textSecondary}
          fallback={
            <View
              style={[
                styles.avatarBlank,
                { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: theme.backgroundSelected },
              ]}
            />
          }
        />
      )}
      {update && <View style={[styles.dot, { backgroundColor: theme.tint, borderColor: theme.background }]} />}
    </Pressable>
  );
}

/** Nothing posted while something is in the air. Shows the shape of the
 * thing that is missing rather than a sentence about it, and stays light:
 * the live card above is the screen's subject, and a second heavy card would
 * bury the thing the person opened the app for. */
function NothingPosted({
  following,
  mine,
  onFind,
}: {
  following: boolean;
  /** The flight in the air is your own — so the quiet belongs to them. */
  mine: boolean;
  onFind: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.noteCard, { borderColor: theme.hairline }]}>
      <View style={styles.noteTop}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.noteLabel}>
          LATEST FROM TRIPS
        </ThemedText>
      </View>
      <GhostPost />
      <View style={styles.noteCopy}>
        <ThemedText themeColor="heading" style={styles.noteHead}>
          {following ? 'Nothing posted yet.' : 'Nobody to hear from yet.'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {following
            ? mine
              ? 'A photo or a line from anyone you follow lands here, and stays for a week.'
              : 'Photos and lines from the trips you follow land here, and stay for a week.'
            : 'Follow someone and their photos land here while they travel.'}
        </ThemedText>
        {!following && (
          <Pressable
            accessibilityRole="button"
            onPress={onFind}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Follow someone
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const AVATAR = 32;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  avatarTap: { padding: Spacing.one },
  pressed: { opacity: 0.6 },
  avatarBlank: { alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: Spacing.one - 1,
    right: Spacing.one - 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  noteTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteLabel: { fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  noteCard: {
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  noteCopy: { gap: Spacing.one },
  noteHead: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
});
