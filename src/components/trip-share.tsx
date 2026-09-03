import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Observe } from 'expo-observe';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';

import { Avatar } from '@/components/avatar';
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

const FACE = 24;

/** The two pills a trip card wears top-right: "Share trip" (opens or reuses
 * the trip's live link — followers need no account) and the circle button,
 * showing the faces of whoever follows this trip — circle members before
 * departure (they auto-follow every trip), the live session's followers once
 * it's open — or a group glyph when nobody does yet. Tapping the faces opens
 * People. Render only under CloudSync (Convex configured). */
export function TripShareActions({ journeyId }: { journeyId: string }) {
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

  const circleLabel = watchers.length
    ? `Your circle — ${watcherNames(watchers)} following this trip`
    : 'Your circle — nobody follows this trip yet';

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
        onPress={() => router.navigate('/people')}
        hitSlop={Spacing.one}>
        {watchers.length ? (
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
