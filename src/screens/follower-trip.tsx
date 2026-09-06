import { useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { AirlineLogo } from '@/components/airline-logo';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TravelDayTimeline } from '@/components/travel-day-timeline';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { airportZone } from '@/services/airports';
import { formatDayLabelWithYear, formatTime } from '@/services/dates';
import { adaptPublicSession } from '@/services/public-session';
import { relativeWhen } from '@/services/trip-when';

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
  const result = useQuery(api.circle.trip, {
    ownerId,
    journeyId: journeyId as Id<'journeys'>,
  });

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
    const { owner, trip, session } = result;
    const when = relativeWhen(trip.scheduledDeparture);
    body = (
      <>
        <View style={styles.titleRow}>
          <AirlineLogo number={trip.number} carrier={trip.carrier} size={48} />
          <View style={styles.titleBlock}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
              {session ? `${owner.name} is flying` : `${owner.name}'s trip`}
            </ThemedText>
            <ThemedText type="title" themeColor="heading">
              {trip.fromCode} → {trip.toCode}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {trip.number || trip.carrier} ·{' '}
              {formatDayLabelWithYear(trip.scheduledDeparture, airportZone(trip.fromCode))}
              {when ? ` · ${when}` : ''}
            </ThemedText>
          </View>
        </View>

        {session ? (
          (() => {
            const { journey, state, facts } = adaptPublicSession(session);
            return <TravelDayTimeline journey={journey} state={state} facts={facts} readOnly />;
          })()
        ) : (
          // No session yet, so no stages and no live facts — just the plan,
          // and the promise of the rest.
          <Card>
            <View style={styles.scheduleRow}>
              <ScheduleCell
                label="Departs"
                code={trip.fromCode}
                iso={trip.scheduledDeparture}
                zone={airportZone(trip.fromCode)}
              />
              <ScheduleCell
                label="Arrives"
                code={trip.toCode}
                iso={trip.scheduledArrival}
                zone={airportZone(trip.toCode)}
              />
            </View>
          </Card>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          {session
            ? `You'll get a nudge at every step until ${owner.name} lands.`
            : `Live updates start the day before ${owner.name} flies. Only ${owner.name} can change this trip.`}
        </ThemedText>
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Trip' }} />
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

/** One end of the flight: where, when, and at what o'clock in that airport's
 * own time — the same convention the traveller's own trip screen uses, so a
 * follower reads the times the traveller will be living by. */
function ScheduleCell({
  label,
  code,
  iso,
  zone,
}: {
  label: string;
  code: string;
  iso: string;
  zone: string | null;
}) {
  return (
    <View style={styles.scheduleCell}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
        {label}
      </ThemedText>
      <ThemedText type="title" themeColor="heading">
        {formatTime(iso, zone)}
      </ThemedText>
      <ThemedText themeColor="heading">{code}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDayLabelWithYear(iso, zone)}
      </ThemedText>
    </View>
  );
}

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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  titleBlock: { flex: 1, gap: Spacing.half },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
  },
  scheduleRow: { flexDirection: 'row', gap: Spacing.three },
  scheduleCell: { flex: 1, gap: Spacing.half },
  footnote: { textAlign: 'center', paddingHorizontal: Spacing.two },
});
