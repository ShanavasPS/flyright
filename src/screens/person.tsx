import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { CIRCLE_FULL } from '../../convex/circleShared';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { useChoiceSheet } from '@/components/choice-sheet';
import { PersonTravel, Stat } from '@/components/person-travel';
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
 * Laid out like a profile (Instagram, Strava): the avatar with the two totals
 * beside it, one line on how you're connected, then the relationship as two
 * buttons — one for THEIR trips reaching you ("Following ▾" / "Follow back"),
 * one for YOURS reaching them ("In your circle ▾" / "Share your trips"). The
 * quieter decisions (mute, close circle, stop, remove) live in the sheets
 * those buttons open, so nothing about the relationship sits under a year of
 * somebody else's flights any more. Below that, their travel, read-only.
 */
export function Person({ userId }: { userId: string }) {
  const router = useRouter();
  const theme = useTheme();
  const data = useQuery(api.circle.person, { userId });
  const setMuted = useMutation(api.circle.setMuted);
  const setClose = useMutation(api.circle.setClose);
  const leave = useMutation(api.circle.leave);
  const remove = useMutation(api.circle.remove);
  const shareBack = useMutation(api.circle.shareBack);
  const askToFollow = useMutation(api.circle.askToFollow);
  const cancelRequest = useMutation(api.circle.cancelRequest);
  const react = useMutation(api.updates.react);
  const proLocked = useProLocked();
  const [busy, setBusy] = useState<'theirs' | 'mine' | null>(null);
  const { show: showSheet, sheet } = useChoiceSheet();

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
    const failed = (title: string) =>
      Alert.alert(title, 'Check your connection and try again.');

    // ── Their trips → me ────────────────────────────────────────────────
    const onFollowBack = async () => {
      setBusy('theirs');
      try {
        const r = await askToFollow({ userId });
        trackEvent('circle_follow_back', { status: r.status, from: 'person' });
      } catch (e) {
        if (e instanceof ConvexError && e.data === CIRCLE_FULL) {
          Alert.alert(`${p.name}'s circle is full`, 'They can make room with FlyRight Pro.');
        } else failed(`Couldn't ask ${p.name}`);
      } finally {
        setBusy(null);
      }
    };
    const onRequested = () =>
      showSheet(`Asked to follow ${p.name}'s trips`, [
        {
          text: 'Withdraw request',
          destructive: true,
          onPress: () => {
            if (p.asked) void cancelRequest({ requestId: p.asked });
          },
        },
      ]);
    const onFollowing = () =>
      showSheet(`Following ${p.name}`, [
        {
          text: p.muted ? 'Unmute updates' : 'Mute updates',
          onPress: () => void setMuted({ ownerId: userId, muted: !p.muted }),
        },
        {
          text: 'Stop following',
          destructive: true,
          onPress: () => {
            trackEvent('circle_left');
            void leave({ ownerId: userId }).then(() => router.back());
          },
        },
      ]);

    // ── My trips → them ─────────────────────────────────────────────────
    const onShare = async () => {
      setBusy('mine');
      try {
        await shareBack({ userId });
        trackEvent('circle_shared_back', { from: 'person' });
      } catch (e) {
        if (e instanceof ConvexError && e.data === CIRCLE_FULL) {
          if (proLocked) router.push({ pathname: '/paywall', params: { next: '/people' } });
          else Alert.alert('Your circle is full', 'Remove someone to make room.');
        } else failed(`Couldn't share with ${p.name}`);
      } finally {
        setBusy(null);
      }
    };
    const onInCircle = () =>
      showSheet(`${p.name} sees your trips`, [
        {
          text: p.closeMember ? 'Remove from your close circle' : 'Add to your close circle',
          onPress: () => {
            trackEvent('circle_close_toggled', { close: !p.closeMember });
            void setClose({ memberId: userId, close: !p.closeMember });
          },
        },
        {
          text: `Remove ${p.name} from your circle`,
          destructive: true,
          onPress: () => {
            trackEvent('circle_removed');
            void remove({ memberId: userId }).then(() => router.back());
          },
        },
      ]);
    const onPreview = () => {
      trackEvent('circle_preview_opened', { from: 'person' });
      router.push({ pathname: '/preview', params: { memberId: userId } });
    };

    // One line on the connection. Dates only where they add something.
    let relation: string;
    if (p.theyShare && p.iShare) relation = 'You follow each other';
    else if (p.theyShare) relation = `Shares their trips with you since ${formatDayLabel(p.since!)}`;
    else relation = `Follows your trips since ${formatDayLabel(p.followsMeSince!)}`;
    if (p.theyShare && p.close) relation += ' · in their close circle';
    if (p.iShare && p.closeMember) relation += ' · in your close circle';

    body = (
      <>
        <View style={styles.header}>
          <Avatar name={p.name} imageUrl={p.imageUrl} size={76} pro={p.pro} />
          <View style={styles.headerRight}>
            {p.theyShare ? (
              <View style={styles.stats}>
                <Stat label={p.ahead === 1 ? 'Trip ahead' : 'Trips ahead'} value={p.ahead} />
                <Stat label={p.flown === 1 ? 'Trip flown' : 'Trips flown'} value={p.flown} />
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                You don&apos;t see {p.name}&apos;s trips yet. Ask, and they decide.
              </ThemedText>
            )}
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary" testID="person-relation">
          {relation}
        </ThemedText>

        <View style={styles.actions}>
          {p.theyShare ? (
            <PillButton
              label="Following"
              menu
              onPress={onFollowing}
              testID="person-following"
              accessibilityLabel={`Following ${p.name}. Mute or stop following`}
            />
          ) : p.asked ? (
            <PillButton
              label="Requested"
              onPress={onRequested}
              testID="person-requested"
              accessibilityLabel={`Asked to follow ${p.name}. Withdraw`}
            />
          ) : (
            <PillButton
              label="Follow back"
              filled
              busy={busy === 'theirs'}
              onPress={() => void onFollowBack()}
              testID="person-follow-back"
              accessibilityLabel={`Ask to follow ${p.name}'s trips`}
            />
          )}
          {p.iShare ? (
            <PillButton
              label="In your circle"
              menu
              onPress={onInCircle}
              testID="person-in-circle"
              accessibilityLabel={`${p.name} is in your circle. Close circle or remove`}
            />
          ) : (
            <PillButton
              label="Share your trips"
              filled
              busy={busy === 'mine'}
              onPress={() => void onShare()}
              testID="person-share"
              accessibilityLabel={`Share your trips with ${p.name}`}
            />
          )}
          {p.iShare && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`See what ${p.name} sees`}
              onPress={onPreview}
              testID="person-preview"
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: theme.field },
                pressed && styles.pressed,
              ]}>
              <SymbolView
                name={{ ios: 'eye', android: 'visibility', web: 'visibility' }}
                size={18}
                weight="semibold"
                tintColor={theme.heading}
              />
            </Pressable>
          )}
        </View>

        {p.theyShare && (
          <PersonTravel
            name={p.name}
            data={p}
            now={now}
            showStats={false}
            onOpenWorld={openWorld}
            onOpenTrip={openTrip}
            onReact={(updateId) => void react({ updateId: updateId as Id<'tripUpdates'> })}
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
      {sheet}
    </ThemedView>
  );
}

/** The profile's button row: filled for the thing to do, quiet for a state
 * that opens a menu (`menu` adds the chevron) or is waiting on someone. */
function PillButton({
  label,
  filled = false,
  menu = false,
  busy = false,
  onPress,
  testID,
  accessibilityLabel,
}: {
  label: string;
  filled?: boolean;
  menu?: boolean;
  busy?: boolean;
  onPress: () => void;
  testID?: string;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={busy}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: filled ? theme.tint : theme.field },
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator color={filled ? '#ffffff' : theme.textSecondary} />
      ) : (
        <>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            style={{ color: filled ? '#ffffff' : theme.heading }}>
            {label}
          </ThemedText>
          {menu && (
            <SymbolView
              name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
              size={12}
              weight="semibold"
              tintColor={theme.heading}
            />
          )}
        </>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingTop: Spacing.three,
  },
  headerRight: { flex: 1, justifyContent: 'center' },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  pill: {
    flex: 1,
    height: 38,
    borderRadius: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
