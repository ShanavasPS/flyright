import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { ThemedText } from '@/components/themed-text';
import { UpdatesCard } from '@/components/trip-updates';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { JourneyRow } from '@/services/journeys';
import type { TravelDayState } from '@/services/travel-day';
import { updateWindowOpen } from '@/services/trip-updates';
import { visibilityOf } from '@/services/trip-visibility';

/**
 * The traveller's side of trip updates, on their own trip screen: the
 * "Share an update" row while the trip takes them (the day they fly until
 * a day after landing), and what they have posted so far with the names
 * behind each heart. Gone entirely on a trip nobody else sees and outside
 * the window with nothing posted — a trip that never shared anything has
 * no empty section to show for it.
 */
export function OwnUpdatesCard({
  row,
  travel,
  now,
}: {
  row: JourneyRow;
  travel: TravelDayState;
  now: Date;
}) {
  const router = useRouter();
  const theme = useTheme();
  const { isSignedIn } = useAuth();
  const updates = useQuery(api.updates.mine, isSignedIn ? { journeyKey: row.id } : 'skip');
  const remove = useMutation(api.updates.remove);

  const visibility = visibilityOf(row);
  const open = updateWindowOpen(row, now.getTime(), travel.stamps.landed ?? null);
  const posted = updates ?? [];
  if (!isSignedIn) return null;
  if (visibility === 'private' && !posted.length) return null;
  if (!open && !posted.length) return null;

  const action =
    open && visibility !== 'private' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share an update"
        testID="share-update"
        onPress={() => router.push({ pathname: '/trip-update', params: { journeyId: row.id } })}
        style={({ pressed }) => [styles.share, { backgroundColor: `${theme.tint}14` }, pressed && styles.pressed]}>
        <View style={[styles.shareIcon, { backgroundColor: theme.tint }]}>
          <SymbolView
            name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
            size={16}
            tintColor="#FFFFFF"
          />
        </View>
        <View style={styles.shareText}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Share an update
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            A photo or a line for the people following this trip.
          </ThemedText>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          tintColor={theme.textSecondary}
        />
      </Pressable>
    ) : visibility === 'private' ? (
      <ThemedText type="small" themeColor="textSecondary">
        Only you can see this trip now, so these updates are yours alone.
      </ThemedText>
    ) : null;

  return (
    <UpdatesCard
      testID="own-updates"
      eyebrow="Your updates"
      updates={posted}
      now={now}
      onRemove={(updateId) => void remove({ updateId: updateId as Id<'tripUpdates'> })}
      action={action}
    />
  );
}

const styles = StyleSheet.create({
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  shareIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { flex: 1, gap: Spacing.half },
  pressed: { opacity: 0.7 },
});
