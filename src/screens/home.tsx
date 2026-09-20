import { useAuth, useUser } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { Avatar } from '@/components/avatar';
import { FeedCard } from '@/components/feed-card';
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
  const circle = useQuery(api.circle.list, live && isSignedIn ? {} : 'skip');
  const following = circle?.following ?? [];

  // The two steps are done once both ends of a follow exist. Nothing else
  // counts: a flight of your own is the Flights tab's business.
  const stepsDone = !!isSignedIn && following.length > 0;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="title">Home</ThemedText>
          <ProfileButton
            imageUrl={user?.imageUrl ?? null}
            name={user?.fullName ?? user?.firstName ?? null}
            onPress={() => router.push('/settings')}
          />
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
            fallback={stepsDone ? <QuietDay /> : null}
          />

          {!stepsDone && <FirstSteps signedIn={!!isSignedIn} following={following.length} />}

          {(feed ?? []).map((post) => (
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

/** A day with nothing in the air. One line, and only true things. */
function QuietDay() {
  return (
    <View style={styles.quiet}>
      <ThemedText type="default">Nothing in the air.</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        When someone you follow flies, they show up here.
      </ThemedText>
    </View>
  );
}

const AVATAR = 32;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
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
  quiet: { gap: Spacing.half, paddingVertical: Spacing.two },
});
