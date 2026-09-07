import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { AirlineLogo } from '@/components/airline-logo';
import { AppHandoff } from '@/components/app-handoff';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { airportZone } from '@/services/airports';
import { trackEvent } from '@/services/analytics';
import { formatDayLabelWithYear } from '@/services/dates';
import { adaptPublicSession } from '@/services/public-session';

/** The public "follow this trip" page behind getflyright.com/t/<token> —
 * reactive on web for anyone, and the in-app follower view with a Follow
 * button when signed in. */
export function FollowTrip({ token }: { token: string }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const result = useQuery(api.live.byToken, { token });
  const follow = useMutation(api.live.follow);
  const [followed, setFollowed] = useState(false);
  // The traveler's circle invite, when following one trip could become
  // following them all — null once declined, or when the server has no offer
  // (already in the circle, circle full).
  const [circleInvite, setCircleInvite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFollow = async () => {
    setBusy(true);
    try {
      const result = await follow({ token });
      if (result.hidden) {
        // A close-circle trip: nothing to follow here but the traveler. The
        // invite page owns the join flow (push permission, share back).
        trackEvent('trip_follow_hidden', { circleOffered: result.circleInviteToken != null });
        if (result.circleInviteToken) router.push(`/i/${result.circleInviteToken}`);
        return;
      }
      setFollowed(true);
      setCircleInvite(result.circleInviteToken);
      trackEvent('trip_followed', { circleOffered: result.circleInviteToken != null });
    } catch {
      // Expired mid-view; the reactive query will flip to gone.
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (result === undefined) {
    body = <ActivityIndicator style={styles.spinner} />;
  } else if ('gone' in result) {
    body = (
      <Card>
        <ThemedText type="subtitle">This link has expired</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          The trip has ended or its owner stopped sharing it.
        </ThemedText>
      </Card>
    );
  } else if ('hidden' in result) {
    // Kept to the traveler's close circle: no flight, no timeline — only
    // the person, and a way to follow their other trips.
    const who = result.travelerName ?? 'This traveler';
    body = (
      <Card>
        <ThemedText type="subtitle">{who} keeps this trip to their close circle</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {result.viewerInCircle
            ? `You follow ${who}'s trips, and you'll keep hearing about the ones they share with everyone. This one is for their close circle only.`
            : `You can follow ${who} instead — a heads-up the day before each trip they share, and updates on travel day.`}
        </ThemedText>
        {isSignedIn && Platform.OS !== 'web' ? (
          !result.viewerInCircle && (
            <PrimaryButton label={`Follow ${who}'s trips`} disabled={busy} onPress={onFollow} />
          )
        ) : Platform.OS === 'web' ? (
          <AppHandoff
            path={`/t/${token}`}
            title="Follow along in FlyRight"
            blurb={`Follow ${who}'s trips and get a heads-up the day before each one.`}
            openLabel="Open in FlyRight"
          />
        ) : (
          <PrimaryButton
            label="Sign in to follow"
            onPress={() => router.push({ pathname: '/sign-in', params: { next: `/t/${token}` } })}
          />
        )}
      </Card>
    );
  } else {
    const session = result;
    const { journey, state, facts } = adaptPublicSession(session);
    const who = session.travelerName ?? 'Your traveler';
    body = (
      <>
        <View style={styles.titleRow}>
          <AirlineLogo number={session.number} carrier={session.carrier} size={48} />
          <View style={styles.titleBlock}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
              {who} is flying
            </ThemedText>
            <ThemedText type="title" themeColor="heading">
              {session.fromCode} → {session.toCode}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {session.number || session.carrier} ·{' '}
              {formatDayLabelWithYear(session.scheduledDeparture, airportZone(session.fromCode))}
            </ThemedText>
          </View>
        </View>

        <TravelDayTimeline journey={journey} state={state} facts={facts} readOnly />

        {isSignedIn && Platform.OS !== 'web' ? (
          followed || session.viewerFollows ? (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
                Following — you&apos;ll get updates as {who} moves through the airport.
              </ThemedText>
              {/* One trip → every trip. Hands off to the invite page, which
                  owns the join flow (push permission, share back, full circle). */}
              {circleInvite && (
                <Card>
                  <ThemedText type="subtitle">Follow all of {who}&apos;s trips?</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    A heads-up the day before each flight and updates on travel day — every
                    trip, not just this one. {who} sees you in their circle and can stop
                    sharing anytime.
                  </ThemedText>
                  <PrimaryButton
                    label={`Follow all of ${who}'s trips`}
                    onPress={() => {
                      trackEvent('trip_follow_circle_upsell', { choice: 'accept' });
                      router.push(`/i/${circleInvite}`);
                    }}
                  />
                  <Pressable
                    onPress={() => {
                      trackEvent('trip_follow_circle_upsell', { choice: 'decline' });
                      setCircleInvite(null);
                    }}
                    style={styles.centered}>
                    <ThemedText type="link">Just this trip</ThemedText>
                  </Pressable>
                </Card>
              )}
            </>
          ) : (
            <PrimaryButton label="Follow this trip" disabled={busy} onPress={onFollow} />
          )
        ) : Platform.OS === 'web' ? (
          <AppHandoff
            path={`/t/${token}`}
            title="Follow along in FlyRight"
            blurb={`Get a push the moment ${who} is through security, on board, and landed.`}
            openLabel="Open this trip"
          />
        ) : (
          <PrimaryButton
            label="Sign in to follow"
            onPress={() => router.push({ pathname: '/sign-in', params: { next: `/t/${token}` } })}
          />
        )}
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Live trip' }} />
      {/* No top edge: the stack header already owns that inset. */}
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
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  spinner: {
    marginTop: Spacing.six,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.half,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
  },
  centeredText: {
    textAlign: 'center',
  },
  centered: {
    alignItems: 'center',
  },
});
