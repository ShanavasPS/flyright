import { useAuth } from '@clerk/expo';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { UpdatesCard } from '@/components/trip-updates';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { JourneyRow } from '@/services/journeys';
import type { TravelDayState } from '@/services/travel-day';
import { agoLabel, captionOf, updateContext, updateWindowOpen } from '@/services/trip-updates';
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
  const { isSignedIn, userId } = useAuth();
  const updates = useQuery(api.updates.mine, isSignedIn ? { journeyKey: row.id } : 'skip');
  const [showAll, setShowAll] = useState(false);
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

  const share = () => router.push({ pathname: '/trip-update', params: { journeyId: row.id } });
  const openUpdate = (updateId: string) =>
    userId &&
    router.push({
      pathname: '/update-viewer',
      params: { ownerId: userId, journeyKey: row.id, updateId, name: 'You' },
    });

  // Two or more: newest first in a row of squares that scrolls sideways,
  // so a busy trip doesn't push the rest of the page down. "See all" opens
  // the full list in place (with the take-down and the names behind each
  // heart); sharing moves to a small pill in the header.
  if (posted.length >= 2 && !showAll) {
    return (
      <Card testID="own-updates">
        <View style={styles.compactHead}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
            {`YOUR UPDATES · ${posted.length}`}
          </ThemedText>
          <View style={styles.headActions}>
            {open && visibility !== 'private' && (
              <Pressable
                testID="share-update"
                accessibilityRole="button"
                accessibilityLabel="Share an update"
                onPress={share}
                style={({ pressed }) => [styles.sharePill, { backgroundColor: `${theme.tint}29` }, pressed && styles.pressed]}>
                <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={13} weight="bold" tintColor={theme.tint} />
                <ThemedText type="smallBold" style={{ color: theme.tint }}>
                  Share
                </ThemedText>
              </Pressable>
            )}
            <Pressable
              testID="own-updates-all"
              accessibilityRole="button"
              hitSlop={Spacing.two}
              onPress={() => setShowAll(true)}
              style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                See all
              </ThemedText>
            </Pressable>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tilesScroll}
          contentContainerStyle={styles.tiles}>
          {posted.map((u) => (
            <Pressable
              key={u.updateId}
              accessibilityRole="button"
              accessibilityLabel={`${captionOf(u)}, ${agoLabel(u.createdAt, now)}${u.reactions ? `, ${u.reactions} hearts` : ''}`}
              onPress={() => (u.photoUrl ? openUpdate(u.updateId) : setShowAll(true))}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
              <View style={[styles.tileBox, { backgroundColor: theme.backgroundSelected }]}>
                {u.photoUrl ? (
                  <Image source={{ uri: u.photoUrl }} recyclingKey={u.updateId} contentFit="cover" style={StyleSheet.absoluteFill} />
                ) : null}
                {u.photoUrl ? <View style={[StyleSheet.absoluteFill, styles.tileShade]} /> : null}
                {u.text ? (
                  <ThemedText type="smallBold" numberOfLines={3} style={[styles.tileText, u.photoUrl && styles.tileTextOnPhoto]}>
                    {u.text}
                  </ThemedText>
                ) : null}
                {u.reactions > 0 && (
                  <View style={styles.heartBadge}>
                    <SymbolView name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }} size={10} tintColor="#F08A80" />
                    <ThemedText type="smallBold" style={styles.heartText}>
                      {u.reactions}
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {[updateContext(u), agoLabel(u.createdAt, now)].filter(Boolean).join(' · ')}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </Card>
    );
  }

  return (
    <UpdatesCard
      testID="own-updates"
      eyebrow="Your updates"
      updates={posted}
      now={now}
      onRemove={(updateId) => void remove({ updateId: updateId as Id<'tripUpdates'> })}
      onOpenPhoto={
        userId
          ? (updateId) =>
              router.push({
                pathname: '/update-viewer',
                params: { ownerId: userId, journeyKey: row.id, updateId, name: 'You' },
              })
          : undefined
      }
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
  compactHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 32,
  },
  eyebrow: { letterSpacing: 1.4, flexShrink: 1 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sharePill: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
  },
  seeAll: { minHeight: 32, justifyContent: 'center', paddingHorizontal: Spacing.one },
  tilesScroll: { marginHorizontal: -Spacing.four },
  tiles: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  tile: { width: 112, gap: 6 },
  tileBox: {
    width: 112,
    height: 112,
    borderRadius: 14,
    overflow: 'hidden',
    padding: Spacing.two + 2,
    justifyContent: 'flex-end',
  },
  tileShade: { experimental_backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)' },
  tileText: { fontSize: 12, lineHeight: 16 },
  tileTextOnPhoto: { color: '#FFFFFF' },
  heartBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(11,19,36,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  heartText: { fontSize: 11, lineHeight: 14, color: '#FFFFFF' },
});
