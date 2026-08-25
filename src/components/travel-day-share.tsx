import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { Observe } from 'expo-observe';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Share, StyleSheet } from 'react-native';

import { api } from '../../convex/_generated/api';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getActivityId } from '@/services/live-activity';
import { useTravelDay } from '@/services/travel-day-store';

/** The traveler's "share this trip live" pill on the travel-day card. Shows
 * the follower count once people are watching. Render only under CloudSync
 * (Convex configured) — the hooks need the provider. */
export function TravelDayShare({ journeyId }: { journeyId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const state = useTravelDay(journeyId);
  const session = useQuery(api.live.mine, isSignedIn ? { naturalKey: journeyId } : 'skip');
  const start = useMutation(api.live.start);
  const [busy, setBusy] = useState(false);

  const onShare = async () => {
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
      await Share.share({
        message: `Follow my flight live: https://getflyright.com/t/${token}`,
      });
    } catch {
      // Journey not synced yet or offline — the pill stays, retry works.
    } finally {
      setBusy(false);
    }
  };

  const label = session?.followerCount
    ? `${session.followerCount} following`
    : 'Share live';

  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onShare} hitSlop={Spacing.two}>
      <ThemedView type="background" style={styles.pill}>
        <SymbolView
          name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
          size={13}
          tintColor={theme.tint}
        />
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Spacing.three,
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
  },
});
