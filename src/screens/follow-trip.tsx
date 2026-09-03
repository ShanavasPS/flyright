import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import type { PublicSession } from '../../convex/liveShared';

import { AirlineLogo } from '@/components/airline-logo';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { DETOUR_LINK_BASE } from '@/constants/config';
import { trackEvent } from '@/services/analytics';
import { formatDayLabelWithYear } from '@/services/dates';
import { storeLink } from '@/services/deferred-links';
import {
  EMPTY_FACTS,
  type FlightFacts,
  type TravelDayState,
  type TravelJourney,
  type TravelStage,
} from '@/services/travel-day';

/** Adapt the whitelisted Convex session into the shapes the shared timeline
 * renders — one source of truth for stage visuals on every surface. */
function adapt(s: PublicSession): {
  journey: TravelJourney;
  state: TravelDayState;
  facts: FlightFacts;
} {
  return {
    journey: {
      id: '',
      mode: 'flight',
      source: 'lookup',
      number: s.number,
      carrier: s.carrier,
      fromCode: s.fromCode,
      toCode: s.toCode,
      scheduledDeparture: s.scheduledDeparture,
      scheduledArrival: s.scheduledArrival,
    },
    state: {
      stage: (s.currentStage as TravelStage | null) ?? null,
      stamps: s.stageTimes as TravelDayState['stamps'],
    },
    facts: {
      ...EMPTY_FACTS,
      delayMinutes: s.delayMinutes,
      gate: s.gate,
      terminal: s.terminal,
      baggageBelt: s.baggageBelt,
      estimatedDeparture: s.estimatedDeparture,
      actualDeparture: s.actualDeparture,
      estimatedArrival: s.estimatedArrival,
      actualArrival: s.actualArrival,
    },
  };
}

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
  } else {
    const session = result;
    const { journey, state, facts } = adapt(session);
    const who = session.travelerName ?? 'Your traveler';
    // Through Detour on a phone, so the install lands back on this trip.
    const store = (platform: 'ios' | 'android') =>
      storeLink(platform, `/t/${token}`, { base: DETOUR_LINK_BASE, userAgent: navigator.userAgent });
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
              {formatDayLabelWithYear(session.scheduledDeparture)}
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
          <Card>
            <ThemedText type="subtitle">Follow along in FlyRight</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Get a push the moment {who} is through security, on board, and landed.
            </ThemedText>
            <View style={styles.storeRow}>
              <Pressable onPress={() => window.open(store('ios'), '_blank')}>
                <ThemedText type="linkPrimary">App Store</ThemedText>
              </Pressable>
              <Pressable onPress={() => window.open(store('android'), '_blank')}>
                <ThemedText type="linkPrimary">Google Play</ThemedText>
              </Pressable>
            </View>
          </Card>
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
  storeRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
});
