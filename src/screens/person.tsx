import { useMutation, useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';

import { AirlineLogo } from '@/components/airline-logo';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { RouteAtlas } from '@/components/route-atlas';
import { mapColors } from '@/components/world-map';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { airportZone } from '@/services/airports';
import type { RouteSource } from '@/services/geo';
import { trackEvent } from '@/services/analytics';
import { formatDayLabel } from '@/services/dates';
import { STAGE_LABELS, type TravelStage } from '@/services/travel-day';
import { relativeWhen } from '@/services/trip-when';

/** Tall enough to read a long-haul arc, short enough that the trips below
 * still start on the first screen. */
const PERSON_MAP_HEIGHT = 170;

/** Every trip they share, in the shape the map draws. */
function routesOf(p: { upcoming: Trip[]; past: Trip[] }): RouteSource[] {
  return [...p.upcoming, ...p.past].map((t) => ({
    id: t.journeyId,
    fromCode: t.fromCode,
    toCode: t.toCode,
    number: t.number,
    carrier: t.carrier,
    scheduledDeparture: t.scheduledDeparture,
  }));
}

type Trip = {
  journeyId: string;
  carrier: string;
  number: string;
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
};

/**
 * A person in your circle, and their travel — the page a row in People opens.
 *
 * It replaces an action sheet, which was the wrong shape twice over: it put
 * "stop following" one tap from a name, and it had nowhere to put the thing
 * the tap was actually asking for, which is "where are they going?". The
 * trips were already on the server; the row just never led anywhere.
 *
 * A follower reads. Every trip here opens read-only (screens/follower-trip),
 * and the only two decisions on the page are about the relationship, not the
 * travel: mute the updates, or stop following. They sit at the bottom, under
 * the travel, because that is how often they're wanted.
 */
export function Person({ userId }: { userId: string }) {
  const router = useRouter();
  const theme = useTheme();
  const data = useQuery(api.circle.person, { userId });
  const setMuted = useMutation(api.circle.setMuted);
  const leave = useMutation(api.circle.leave);
  const remove = useMutation(api.circle.remove);

  const { sea } = mapColors(useColorScheme() === 'dark');
  const openWorld = () =>
    router.push({ pathname: '/person/[id]/world', params: { id: userId } });
  const openTrip = (journeyId: string) =>
    router.push({
      pathname: '/person/[id]/trip/[journeyId]',
      params: { id: userId, journeyId },
    });

  let body: React.ReactNode;
  if (data === undefined) {
    body = <ActivityIndicator style={styles.spinner} />;
  } else if (data === null || 'gone' in data) {
    body = (
      <Card>
        <ThemedText type="subtitle">Not in your circle</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          You either stopped following them, or they stopped sharing.
        </ThemedText>
      </Card>
    );
  } else {
    const p = data;
    const onLeave = () =>
      Alert.alert(`Stop following ${p.name}?`, 'You can be invited again later.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop following',
          style: 'destructive',
          onPress: () => {
            trackEvent('circle_left');
            void leave({ ownerId: userId }).then(() => router.back());
          },
        },
      ]);
    const onRemove = () =>
      Alert.alert(
        `Remove ${p.name}?`,
        'They stop seeing your trips and getting updates. You can invite them again later.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              trackEvent('circle_removed');
              void remove({ memberId: userId }).then(() => router.back());
            },
          },
        ],
      );

    body = (
      <>
        <View style={styles.hero}>
          <Avatar name={p.name} imageUrl={p.imageUrl} size={88} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {p.theyShare
              ? `Sharing their trips with you since ${formatDayLabel(p.since!)}`
              : `Following your trips since ${formatDayLabel(p.followsMeSince!)}`}
            {p.theyShare && p.iShare ? ' · you share yours back' : ''}
          </ThemedText>
        </View>

        {/* Their travel, before the list of it. Opens the same map full
            screen — on the person, never as a mode of the viewer's own World
            tab (see screens/person-world). */}
        {p.theyShare && routesOf(p).length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${p.name}'s world`}
            onPress={openWorld}
            style={({ pressed }) => pressed && styles.pressed}>
            <View style={[styles.map, { backgroundColor: sea }]}>
              <RouteAtlas journeys={routesOf(p)} height={PERSON_MAP_HEIGHT} />
            </View>
          </Pressable>
        )}

        {p.theyShare && (
          <View style={styles.stats}>
            <Stat label={p.upcoming.length === 1 ? 'Trip ahead' : 'Trips ahead'} value={p.upcoming.length} />
            <Stat label={p.flown === 1 ? 'Trip flown' : 'Trips flown'} value={p.flown} />
          </View>
        )}

        {p.live && (
          <Pressable
            accessibilityRole="button"
            onPress={() => (p.liveJourneyId ? openTrip(p.liveJourneyId) : undefined)}
            style={({ pressed }) => pressed && styles.pressed}>
            <SheenCard style={styles.liveCard}>
              <View style={styles.liveHeader}>
                <View style={[styles.dot, { backgroundColor: theme.tint }]} />
                <ThemedText type="smallBold" style={{ color: theme.tint }}>
                  TRAVELLING NOW
                </ThemedText>
              </View>
              <ThemedText type="subtitle" themeColor="heading">
                {p.live.session.fromCode} → {p.live.session.toCode}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {p.live.session.currentStage
                  ? STAGE_LABELS[p.live.session.currentStage as TravelStage]
                  : 'Getting ready'}
                {p.live.session.delayMinutes != null && p.live.session.delayMinutes >= 30
                  ? ` · ${p.live.session.delayMinutes} min late`
                  : p.live.session.gate
                    ? ` · Gate ${p.live.session.gate}`
                    : ''}
              </ThemedText>
            </SheenCard>
          </Pressable>
        )}

        {p.theyShare && (
          <>
            <Section label="Upcoming" />
            {p.upcoming.length ? (
              p.upcoming.map((t) => (
                <TripRow key={t.journeyId} trip={t} onPress={() => openTrip(t.journeyId)} />
              ))
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                Nothing booked yet. You&apos;ll hear when {p.name} adds a trip.
              </ThemedText>
            )}

            {p.past.length > 0 && (
              <>
                <Section label="Flown" />
                {p.past.map((t) => (
                  <TripRow key={t.journeyId} trip={t} onPress={() => openTrip(t.journeyId)} past />
                ))}
                {p.flown > p.past.length && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                    Showing the last {p.past.length} of {p.flown}.
                  </ThemedText>
                )}
              </>
            )}
          </>
        )}

        <Section label="Notifications and access" />
        {p.theyShare && (
          <>
            <ActionRow
              label={p.muted ? 'Unmute updates' : 'Mute updates'}
              detail={
                p.muted
                  ? `You'll start getting ${p.name}'s updates again.`
                  : `Keep seeing ${p.name}'s trips here, without the notifications.`
              }
              onPress={() => void setMuted({ ownerId: userId, muted: !p.muted })}
            />
            <ActionRow
              label="Stop following"
              detail={`You stop seeing ${p.name}'s trips.`}
              danger
              onPress={onLeave}
            />
          </>
        )}
        {p.iShare && (
          <ActionRow
            label={`Remove ${p.name} from your circle`}
            detail="They stop seeing your trips and getting updates."
            danger
            onPress={onRemove}
          />
        )}
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* The name belongs in the bar. Left empty it was a tall blank strip
        with a hairline under it, which reads as a broken toolbar rather than
        a header — and once the page is scrolled there was nothing left
        saying whose trips these are. (Alta, Instagram and Digg all put the
        person there; the hero below no longer repeats it.) */}
      <Stack.Screen options={{ title: data && !('gone' in data) ? data.name : '' }} />
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="title" themeColor="heading">
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function Section({ label }: { label: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
      {label.toUpperCase()}
    </ThemedText>
  );
}

/** One trip, the same row shape in both directions of time — a flown trip is
 * the same fact as a booked one, just behind you. */
function TripRow({ trip, onPress, past }: { trip: Trip; onPress: () => void; past?: boolean }) {
  const when = relativeWhen(trip.scheduledDeparture);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trip.number || trip.carrier}, ${trip.fromCode} to ${trip.toCode}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={[styles.rowCard, past && styles.pastRow]}>
        <AirlineLogo number={trip.number} carrier={trip.carrier} size={40} />
        <View style={styles.rowBody}>
          <ThemedText themeColor="heading" numberOfLines={1}>
            {trip.fromCode} → {trip.toCode}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {trip.number || trip.carrier} ·{' '}
            {formatDayLabel(trip.scheduledDeparture, airportZone(trip.fromCode))}
          </ThemedText>
        </View>
        {when && (
          <ThemedText type="small" themeColor="textSecondary">
            {when}
          </ThemedText>
        )}
      </SheenCard>
    </Pressable>
  );
}

function ActionRow({
  label,
  detail,
  onPress,
  danger,
}: {
  label: string;
  detail: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <SheenCard style={styles.rowCard}>
        <View style={styles.rowBody}>
          <ThemedText style={danger ? { color: theme.danger } : { color: theme.tint }}>
            {label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        </View>
      </SheenCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  spinner: { marginTop: Spacing.six },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  centered: { textAlign: 'center', alignSelf: 'center' },
  stats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.six,
    paddingBottom: Spacing.two,
  },
  stat: { alignItems: 'center', gap: Spacing.half },
  section: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
    paddingTop: Spacing.three,
  },
  map: { height: PERSON_MAP_HEIGHT, borderRadius: Spacing.four, overflow: 'hidden' },
  liveCard: { gap: Spacing.half, padding: Spacing.three },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowBody: { flex: 1, gap: Spacing.half },
  pastRow: { opacity: 0.75 },
  pressed: { opacity: 0.6 },
});
