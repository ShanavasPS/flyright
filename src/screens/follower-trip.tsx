import { useMutation, useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { Card } from '@/components/card';
import { RouteHero, type Schedule } from '@/components/route-hero';
import { RouteMap } from '@/components/route-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { UpdatesCard } from '@/components/trip-updates';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { airportZone, getAirport } from '@/services/airports';
import { flightInstant, formatTime, tripDateTitle } from '@/services/dates';
import { haversineKm } from '@/services/geo';
import { adaptPublicSession, travellerEyebrow, tripDone } from '@/services/public-session';

/**
 * One trip of somebody whose circle you're in — everything a follower may
 * see of it, and nothing to do to it.
 *
 * Distinct from the /t/<token> page, which needs a live session to exist at
 * all. Most of what a follower opens has none: a trip booked for November has
 * no session until the day before it flies, and is still the thing they
 * tapped. This works from the journey itself and lets the live facts ride
 * along only once there are any.
 *
 * There is nothing to press here on purpose. A follower reads; the traveller
 * owns the trip. Mute and unfollow are on the person's page, which is where
 * decisions about a person belong.
 */
export function FollowerTrip({ ownerId, journeyId }: { ownerId: string; journeyId: string }) {
  const router = useRouter();
  const now = useNow();
  const result = useQuery(api.circle.trip, {
    ownerId,
    journeyId: journeyId as Id<'journeys'>,
  });
  const react = useMutation(api.updates.react);

  // The header carries WHEN, exactly as the traveller's own trip screen
  // does — the route is in big type right below it either way.
  const shown = result && !('gone' in result) ? result.trip : null;
  const title = shown
    ? tripDateTitle(shown.scheduledDeparture, now, airportZone(shown.fromCode))
    : 'Trip';

  let body: React.ReactNode;
  if (result === undefined) {
    body = <ActivityIndicator style={styles.spinner} />;
  } else if (result === null || 'gone' in result) {
    body = (
      <Card>
        <ThemedText type="subtitle">This trip isn&apos;t shared any more</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          It was removed, or you no longer follow the person who was flying it.
        </ThemedText>
      </Card>
    );
  } else {
    const { owner, trip, session, updates } = result;
    body = (
      <>
        {/* The same inset the traveller sees on their own trip. It opens
            their map, not the viewer's World tab — which draws the viewer's
            own journal and would quietly show the wrong travel. */}
        <RouteMap
          onPress={() =>
            router.push({
              pathname: '/person/[id]/world',
              params: { id: ownerId, focus: trip.journeyId },
            })
          }
          journey={{
            id: trip.journeyId,
            fromCode: trip.fromCode,
            toCode: trip.toCode,
            number: trip.number,
            carrier: trip.carrier,
            scheduledDeparture: trip.scheduledDeparture,
          }}
        />

        {/* Whose trip this is, then the trip itself in the same hero the
            traveller sees on their own — one way to read a flight, however
            you came to be reading it. */}
        <View style={styles.heroBlock}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
            {session ? travellerEyebrow(owner.name, session, now) : `${owner.name}'s trip`}
          </ThemedText>
          <RouteHero
            journey={{
              from: { code: trip.fromCode },
              to: { code: trip.toCode },
              carrier: trip.carrier,
              number: trip.number,
              scheduledDeparture: trip.scheduledDeparture,
              scheduledArrival: trip.scheduledArrival,
              distanceKm: legDistanceKm(trip.fromCode, trip.toCode),
            }}
            now={now.getTime()}
            schedule={scheduleOf(trip)}
          />
        </View>

        {session ? (
          (() => {
            const { journey, state, facts } = adaptPublicSession(session);
            return <TravelDayTimeline journey={journey} state={state} facts={facts} readOnly />;
          })()
        ) : null}

        {/* What they shared from this trip — kept on the trip for good, so
            a flown trip reads as the small set of postcards it was. */}
        {updates && updates.length > 0 && (
          <UpdatesCard
            eyebrow={`From ${owner.name}`}
            updates={updates}
            now={now}
            onReact={(updateId) => void react({ updateId: updateId as Id<'tripUpdates'> })}
          />
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          {session
            ? tripDone(session, now)
              ? session.currentStage === 'landed'
                ? `${owner.name} has landed. Only ${owner.name} can change this trip.`
                : // Over by the timetable with no landing recorded: say what
                  // the follower is looking at rather than promise nudges
                  // for a trip that is done.
                  `The timetable says this flight has landed, but ${owner.name} didn't record it. Only ${owner.name} can change this trip.`
              : `You'll get a nudge at every step until ${owner.name} lands.`
            : flightInstant(trip.scheduledDeparture, airportZone(trip.fromCode)) - now.getTime() >
                DAY_MS
              ? `Live updates start the day before ${owner.name} flies. Only ${owner.name} can change this trip.`
              : // Inside the last day there is no "day before" left to promise:
                // the session opens with the traveller's travel day.
                `Live updates appear here once ${owner.name}'s travel day begins. Only ${owner.name} can change this trip.`}
        </ThemedText>
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title }} />
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

/** The two clocks the hero prints, each in its own airport's time — the
 * pair a boarding pass shows, and the only pair that stays true wherever
 * the trip is read from. A follower never sees a ticketed-versus-moved
 * pair: rebooking is the traveller's business, and the trip they are shown
 * is the one that is flying. */
function scheduleOf(trip: { fromCode: string; toCode: string; scheduledDeparture: string; scheduledArrival: string }): Schedule {
  return {
    departure: formatTime(trip.scheduledDeparture, airportZone(trip.fromCode)),
    arrival:
      trip.scheduledArrival === trip.scheduledDeparture
        ? null
        : formatTime(trip.scheduledArrival, airportZone(trip.toCode)),
    departureWas: null,
    arrivalWas: null,
    moved: null,
  };
}

/** Great-circle distance for the hero's caption, recomputed here because a
 * follower's copy of a trip carries only the two codes. Null for codes that
 * aren't in the dataset, which the hero leaves blank rather than calling
 * zero kilometres. */
function legDistanceKm(fromCode: string, toCode: string): number | null {
  const from = getAirport(fromCode);
  const to = getAirport(toCode);
  return from && to ? haversineKm(from.lat, from.lon, to.lat, to.lon) : null;
}

const DAY_MS = 24 * 60 * 60_000;

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  spinner: { marginTop: Spacing.six },
  // The caption and the hero it introduces are one block; the scroll's own
  // gap between cards would read as a floating label.
  heroBlock: { gap: Spacing.two },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
  },
  footnote: { textAlign: 'center', paddingHorizontal: Spacing.two },
});
