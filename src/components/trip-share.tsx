import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Observe } from 'expo-observe';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { watcherNames } from '@/services/circle';
import { setJourneyHiddenFromCircle } from '@/services/journeys';
import { shareInvite } from '@/services/circle-share';
import { getActivityId } from '@/services/live-activity';
import { useTravelDay } from '@/services/travel-day-store';

interface Watcher {
  userId: string;
  name: string;
  imageUrl: string | null;
}

const FACE = 24;

/** The two pills a trip card wears top-right: "Share trip" (opens or reuses
 * the trip's live link — followers need no account) and the circle button,
 * showing the faces of whoever follows this trip — circle members before
 * departure (they auto-follow every trip), the live session's followers once
 * it's open — or a group glyph when nobody does yet. Tapping the faces opens
 * People. A trip kept to the close circle (`hidden`) shows the close members
 * only — or a crossed eye when there are none — and its share button hands
 * out the traveler's circle invite, not the trip. Render only under CloudSync
 * (Convex configured). */
export function TripShareActions({ journeyId, hidden = false }: { journeyId: string; hidden?: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const state = useTravelDay(journeyId);
  const session = useQuery(api.live.mine, isSignedIn ? { naturalKey: journeyId } : 'skip');
  const circle = useQuery(api.circle.list, isSignedIn ? {} : 'skip');
  const start = useMutation(api.live.start);
  const createInvite = useMutation(api.circle.createInvite);
  const [busy, setBusy] = useState(false);

  // Circle first (it carries photos), then session-only followers. A
  // close-circle trip is followed by the close members only — the server
  // dropped everyone else.
  const byId = new Map<string, Watcher>();
  for (const p of circle?.followers ?? []) {
    if (hidden && !p.close) continue;
    byId.set(p.userId, { userId: p.userId, name: p.name ?? 'Someone', imageUrl: p.imageUrl });
  }
  for (const f of session?.followers ?? []) {
    if (!byId.has(f.userId)) {
      byId.set(f.userId, { userId: f.userId, name: f.name ?? 'Someone', imageUrl: null });
    }
  }
  const watchers = [...byId.values()];

  const share = async () => {
    // Sharing needs an account — followers are addressed by Clerk id.
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }
    setBusy(true);
    try {
      if (hidden) {
        // The trip stays with the close circle; the link invites the person
        // to follow the traveler (their other trips) instead.
        const invite = await createInvite({});
        trackEvent('trip_shared', { hidden: true });
        await shareInvite(invite.token);
        return;
      }
      const { token } = await start({
        naturalKey: journeyId,
        stage: state.stage,
        stamps: state.stamps as Record<string, string>,
        activityId: getActivityId(journeyId),
      });
      if (!token) return;
      Observe.logEvent('travel_day.shared');
      trackEvent('trip_shared');
      await Share.share({ message: `Follow my flight live: https://getflyright.com/t/${token}` });
    } catch {
      // Journey not synced yet or offline — the pill stays, retry works.
    } finally {
      setBusy(false);
    }
  };

  const circleLabel = hidden
    ? watchers.length
      ? `Close circle only — ${watcherNames(watchers)} following this trip`
      : 'Close circle only — nobody in your close circle yet'
    : watchers.length
      ? `Your circle — ${watcherNames(watchers)} following this trip`
      : 'Your circle — nobody follows this trip yet';

  const explainHidden = () => {
    Alert.alert(
      'Close circle only',
      `${
        watchers.length
          ? `${watcherNames(watchers)} ${watchers.length === 1 ? 'sees' : 'see'} this trip.`
          : 'Nobody is in your close circle yet — add people from their page in People.'
      } The rest of your circle still counts it in your totals but can't open or follow it, and a shared link invites people to follow you, not this trip.`,
      [
        {
          text: 'Show to your whole circle',
          onPress: () => void setJourneyHiddenFromCircle(journeyId, false),
        },
        { text: 'OK', style: 'cancel' },
      ],
    );
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share this trip"
        disabled={busy}
        onPress={share}
        hitSlop={Spacing.one}
        style={{ opacity: busy ? 0.6 : 1 }}>
        {/* Once faces are showing they carry the meaning, and a labelled pill
            plus three faces won't fit beside a card title — the share pill
            collapses to its icon. */}
        <View
          style={[
            styles.pill,
            watchers.length > 0 && styles.iconOnly,
            { backgroundColor: `${theme.tint}1A` },
          ]}>
          <SymbolView
            name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
            size={15}
            weight="semibold"
            tintColor={theme.tint}
          />
          {watchers.length === 0 && (
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Share trip
            </ThemedText>
          )}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={circleLabel}
        onPress={hidden ? explainHidden : () => router.navigate('/people')}
        hitSlop={Spacing.one}>
        {hidden && !watchers.length ? (
          // Close circle only, and nobody in it: a crossed eye on the quiet
          // field colour.
          <View style={[styles.disc, { backgroundColor: theme.field }]}>
            <SymbolView
              name={{ ios: 'eye.slash.fill', android: 'visibility_off', web: 'visibility_off' }}
              size={15}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </View>
        ) : watchers.length ? (
          // Faces of the people following, stacked; the ring is the card
          // colour so overlaps read as a stack.
          <View style={[styles.pill, styles.faces, { backgroundColor: `${theme.tint}1A` }]}>
            {watchers.slice(0, 3).map((w, i) => (
              <View key={w.userId} style={i > 0 && styles.faceOverlap}>
                <Avatar
                  name={w.name}
                  imageUrl={w.imageUrl}
                  size={FACE}
                  ring={theme.backgroundElement}
                />
              </View>
            ))}
            {watchers.length > 3 && (
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                +{watchers.length - 3}
              </ThemedText>
            )}
          </View>
        ) : (
          // Nobody yet: a solid disc so the way in to your circle stands out.
          <View style={[styles.disc, { backgroundColor: theme.tint }]}>
            <SymbolView
              name={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
              size={16}
              weight="semibold"
              tintColor="#FFFFFF"
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: Spacing.two + Spacing.half,
  },
  iconOnly: {
    width: 30,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  faces: {
    paddingHorizontal: Spacing.one,
    gap: Spacing.half,
  },
  disc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceOverlap: {
    marginLeft: -(Spacing.two + Spacing.half),
  },
});
