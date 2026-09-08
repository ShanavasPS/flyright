import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { CIRCLE_FULL } from '../../convex/circleShared';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { PersonTravel, Section } from '@/components/person-travel';
import { SheenCard } from '@/components/sheen-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { formatDayLabel } from '@/services/dates';
import { useProLocked } from '@/services/purchases';

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
  const data = useQuery(api.circle.person, { userId });
  const setMuted = useMutation(api.circle.setMuted);
  const setClose = useMutation(api.circle.setClose);
  const leave = useMutation(api.circle.leave);
  const remove = useMutation(api.circle.remove);
  const shareBack = useMutation(api.circle.shareBack);
  const askToFollow = useMutation(api.circle.askToFollow);
  const cancelRequest = useMutation(api.circle.cancelRequest);
  const proLocked = useProLocked();

  // Read once per render, like the journal's own list: the countdowns on a
  // profile don't need to tick while it's open.
  const now = new Date();
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
            {p.theyShare && p.close ? ' · in their close circle' : ''}
          </ThemedText>
        </View>

        {p.theyShare && (
          <PersonTravel
            name={p.name}
            data={p}
            now={now}
            onOpenWorld={openWorld}
            onOpenTrip={openTrip}
          />
        )}

        {/* One-way relationships get the way back, right here. Sharing my
            trips is mine to do; seeing theirs is theirs to grant, so that one
            is an ask (circle.askToFollow) and waits on them. */}
        {p.theyShare !== p.iShare && (
          <>
            <Section label="Follow each other" />
            {p.theyShare ? (
              <ActionRow
                label={`Share your trips with ${p.name}`}
                detail={`${p.name} doesn't see your trips yet. They'd get a heads-up the day before each of your flights.`}
                onPress={() => {
                  trackEvent('circle_shared_back', { from: 'person' });
                  void shareBack({ userId }).catch((e: unknown) => {
                    if (e instanceof ConvexError && e.data === CIRCLE_FULL) {
                      if (proLocked) {
                        router.push({ pathname: '/paywall', params: { next: '/people' } });
                      } else Alert.alert('Your circle is full', 'Remove someone to make room.');
                    } else Alert.alert(`Couldn't share with ${p.name}`, 'Check your connection and try again.');
                  });
                }}
              />
            ) : p.asked ? (
              <ActionRow
                label={`Asked to follow ${p.name}'s trips`}
                detail="Waiting for them to answer. Tap to withdraw the request."
                onPress={() =>
                  Alert.alert(`Withdraw the request?`, `You can ask ${p.name} again later.`, [
                    { text: 'Keep waiting', style: 'cancel' },
                    {
                      text: 'Withdraw',
                      style: 'destructive',
                      onPress: () => void cancelRequest({ requestId: p.asked! }),
                    },
                  ])
                }
              />
            ) : (
              <ActionRow
                label={`Ask to follow ${p.name}'s trips`}
                detail={`${p.name} decides. If they say yes, their upcoming flights show up here.`}
                onPress={() => {
                  void askToFollow({ userId })
                    .then((r) => trackEvent('circle_follow_back', { status: r.status, from: 'person' }))
                    .catch((e: unknown) =>
                      Alert.alert(
                        e instanceof ConvexError && e.data === CIRCLE_FULL
                          ? `${p.name}'s circle is full`
                          : `Couldn't ask ${p.name}`,
                        e instanceof ConvexError && e.data === CIRCLE_FULL
                          ? 'They can make room with FlyRight Pro.'
                          : 'Check your connection and try again.',
                      ),
                    );
                }}
              />
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
          <>
            {/* The close circle: the few who also see the trips kept from
                everyone else (the trip menu's "Only my close circle"). */}
            <ActionRow
              label={p.closeMember ? 'Remove from your close circle' : 'Add to your close circle'}
              detail={
                p.closeMember
                  ? `${p.name} sees every trip of yours, including the ones you keep to your close circle.`
                  : `Let ${p.name} also see the trips you keep to your close circle — family, say.`
              }
              onPress={() => {
                trackEvent('circle_close_toggled', { close: !p.closeMember });
                void setClose({ memberId: userId, close: !p.closeMember });
              }}
            />
            {/* Their view of you, rendered by the same component as above —
                the honest answer to "what does the close circle actually
                get?" (see screens/circle-preview). */}
            <ActionRow
              label={`See what ${p.name} sees`}
              detail={`Your profile and trips exactly as they appear to ${p.name}.`}
              trailing={{ ios: 'eye', android: 'visibility', web: 'visibility' }}
              onPress={() => {
                trackEvent('circle_preview_opened', { from: 'person' });
                router.push({ pathname: '/preview', params: { memberId: userId } });
              }}
            />
            <ActionRow
              label={`Remove ${p.name} from your circle`}
              detail="They stop seeing your trips and getting updates."
              danger
              onPress={onRemove}
            />
          </>
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

function ActionRow({
  label,
  detail,
  onPress,
  danger,
  trailing,
}: {
  label: string;
  detail: string;
  onPress: () => void;
  danger?: boolean;
  trailing?: React.ComponentProps<typeof SymbolView>['name'];
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
        {trailing && <SymbolView name={trailing} size={18} tintColor={theme.textSecondary} />}
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
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowBody: { flex: 1, gap: Spacing.half },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  centered: { textAlign: 'center', alignSelf: 'center' },
  pressed: { opacity: 0.6 },
});
