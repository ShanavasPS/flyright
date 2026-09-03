import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Observe } from 'expo-observe';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { trackEvent } from '@/services/analytics';
import { watcherNames } from '@/services/circle';
import { getActivityId } from '@/services/live-activity';
import { useTravelDay } from '@/services/travel-day-store';

interface Watcher {
  userId: string;
  name: string;
  imageUrl: string | null;
}

/** Who follows this trip, and the one place to share it — Find My's
 * "people who can see your location", for a flight. Before departure the
 * circle (people who follow every trip) is listed as "will follow"; once a
 * live session exists its followers (circle members are materialized into
 * it, plus anyone who opened the link) are listed as following. The share
 * button opens or reuses the trip's live link — no account needed on the
 * other end. Render only under CloudSync (Convex configured) for upcoming
 * or in-progress trips; a flown trip has nothing left to watch. */
export function TripWatchers({ journeyId, live }: { journeyId: string; live: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const state = useTravelDay(journeyId);
  const session = useQuery(api.live.mine, isSignedIn ? { naturalKey: journeyId } : 'skip');
  const circle = useQuery(api.circle.list, isSignedIn ? {} : 'skip');
  const start = useMutation(api.live.start);
  const [busy, setBusy] = useState(false);

  // Circle first (it carries photos), then session-only followers.
  const byId = new Map<string, Watcher>();
  for (const p of circle?.followers ?? []) {
    byId.set(p.userId, { userId: p.userId, name: p.name ?? 'Someone', imageUrl: p.imageUrl });
  }
  for (const f of session?.followers ?? []) {
    if (!byId.has(f.userId)) byId.set(f.userId, { userId: f.userId, name: f.name ?? 'Someone', imageUrl: null });
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
      // Journey not synced yet or offline — the button stays, retry works.
    } finally {
      setBusy(false);
    }
  };

  const title = watchers.length
    ? `${watcherNames(watchers)} ${session ? (watchers.length === 1 ? 'is' : 'are') : 'will be'} following`
    : 'Let someone follow this trip';
  const body = watchers.length
    ? live
      ? 'They see every step as it happens — at the airport, boarding, in the air, landed.'
      : 'They get a heads-up the day before, then every step on the day.'
    : 'Share a link and they see gate, boarding, take-off and landing as they happen — no app needed.';

  return (
    <Card testID="trip-watchers">
      <View style={styles.row}>
        {watchers.length ? (
          <View style={styles.stack} accessibilityLabel={`${watchers.length} following`}>
            {watchers.slice(0, 3).map((w, i) => (
              <View key={w.userId} style={[styles.face, i > 0 && styles.faceOverlap]}>
                <Avatar name={w.name} imageUrl={w.imageUrl} size={32} ring={theme.backgroundElement} />
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.glyph, { backgroundColor: `${theme.tint}1A` }]}>
            <SymbolView
              name={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
              size={18}
              tintColor={theme.tint}
            />
          </View>
        )}
        <View style={styles.copy}>
          <ThemedText type="smallBold" themeColor="heading">
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {body}
          </ThemedText>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share this trip"
          disabled={busy}
          onPress={share}
          style={({ pressed }) => [
            styles.share,
            { backgroundColor: theme.tint, opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
          ]}>
          <SymbolView
            name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
            size={15}
            weight="semibold"
            tintColor="#FFFFFF"
          />
          <ThemedText type="smallBold" style={styles.shareLabel}>
            Share this trip
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          hitSlop={Spacing.two}
          onPress={() => router.navigate('/people')}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {watchers.length ? 'Manage →' : 'Your circle →'}
          </ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  face: {
    // The ring is drawn in the card colour, so overlaps read as a stack.
  },
  faceOverlap: {
    marginLeft: -(Spacing.two + Spacing.half),
  },
  glyph: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: Spacing.half,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  shareLabel: {
    color: '#FFFFFF',
  },
});
