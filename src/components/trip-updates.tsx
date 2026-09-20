import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Fragment, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { LikedBySheet } from '@/components/liked-by-sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  agoLabel,
  captionOf,
  likedByParts,
  photoAspect,
  updateContext,
  type OwnUpdate,
  type TripUpdate,
} from '@/services/trip-updates';

/**
 * What the traveller has shared from the trip, newest first: the photo, the
 * words, and under them where they were and how long ago. One component for
 * every reader — the person page, the trip page, the shared link, and the
 * traveller's own trip screen — so an update looks the same wherever it is
 * read. Followers get the heart; the traveller gets the names behind it and
 * a long-press to take an update down.
 */
export function UpdatesCard({
  eyebrow,
  updates,
  now,
  onReact,
  onReport,
  onRemove,
  onOpenPhoto,
  action,
  emptyText,
  testID,
}: {
  eyebrow: string;
  updates: (TripUpdate | OwnUpdate)[];
  now: Date;
  /** A follower's heart. Absent on the owner's own view and on the web. */
  onReact?: (updateId: string) => void;
  /** Someone else's update: long press offers to report it. */
  onReport?: (updateId: string) => void;
  /** The owner's take-down; its presence makes this the owner's view. */
  onRemove?: (updateId: string) => void;
  /** Tapping the picture opens it full screen, with its heart and thread. */
  onOpenPhoto?: (updateId: string) => void;
  /** The owner's "Share an update" row, above the list. */
  action?: React.ReactNode;
  /** Shown under the action when there is nothing yet. */
  emptyText?: string;
  testID?: string;
}) {
  const theme = useTheme();
  if (!updates.length && !action) return null;
  return (
    <Card testID={testID}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
        {eyebrow}
      </ThemedText>
      {action}
      {!updates.length && emptyText ? (
        <ThemedText type="small" themeColor="textSecondary">
          {emptyText}
        </ThemedText>
      ) : null}
      {updates.map((update, i) => (
        <Fragment key={update.updateId}>
          {(i > 0 || action) && <View style={[styles.divider, { backgroundColor: theme.hairline }]} />}
          <UpdateRow
            update={update}
            now={now}
            onReact={onReact}
            onReport={onReport}
            onRemove={onRemove}
            onOpenPhoto={onOpenPhoto}
          />
        </Fragment>
      ))}
    </Card>
  );
}

function UpdateRow({
  update,
  now,
  onReact,
  onReport,
  onRemove,
  onOpenPhoto,
}: {
  update: TripUpdate | OwnUpdate;
  now: Date;
  onReact?: (updateId: string) => void;
  /** Someone else's update: long press offers to report it. */
  onReport?: (updateId: string) => void;
  onRemove?: (updateId: string) => void;
  onOpenPhoto?: (updateId: string) => void;
}) {
  const theme = useTheme();
  const context = updateContext(update);
  const meta = [context, agoLabel(update.createdAt, now)].filter(Boolean).join(' · ');
  const own = 'reactedBy' in update ? update : null;

  const onLongPress = () => {
    if (onRemove) {
      Alert.alert('Take this update down?', 'The people following you will no longer see it.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Take down', style: 'destructive', onPress: () => onRemove(update.updateId) },
      ]);
    } else if (onReport) {
      Alert.alert('Report this update?', 'Tell us what is wrong with it. The person who posted it will not know.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report', style: 'destructive', onPress: () => onReport(update.updateId) },
      ]);
    }
  };
  const longPressable = !!onRemove || !!onReport;

  return (
    <Pressable
      accessibilityLabel={`${captionOf(update)}, ${meta}`}
      accessibilityHint={onRemove ? 'Long press to take down' : onReport ? 'Long press to report' : undefined}
      disabled={!longPressable}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.row, pressed && longPressable && styles.pressed]}>
      {update.photoUrl && (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Open this photo full screen"
          disabled={!onOpenPhoto}
          onPress={() => onOpenPhoto?.(update.updateId)}
          onLongPress={onLongPress}
          delayLongPress={400}>
          <Image
            source={{ uri: update.photoUrl }}
            recyclingKey={update.updateId}
            contentFit="cover"
            transition={200}
            accessibilityIgnoresInvertColors
            style={[styles.photo, { aspectRatio: photoAspect(update), backgroundColor: theme.field }]}
          />
        </Pressable>
      )}
      {update.text ? <ThemedText selectable>{update.text}</ThemedText> : null}
      <View style={styles.metaRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.meta} numberOfLines={1}>
          {meta}
        </ThemedText>
        {onReact ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={update.reacted ? 'Remove your heart' : 'Send a heart'}
            accessibilityState={{ selected: update.reacted }}
            hitSlop={Spacing.two}
            onPress={() => onReact(update.updateId)}
            style={({ pressed }) => [styles.heart, pressed && styles.pressed]}>
            <SymbolView
              name={
                update.reacted
                  ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
                  : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
              }
              size={20}
              tintColor={update.reacted ? theme.danger : theme.textSecondary}
            />
            {update.reactions > 0 && (
              <ThemedText type="small" themeColor={update.reacted ? 'danger' : 'textSecondary'}>
                {update.reactions}
              </ThemedText>
            )}
          </Pressable>
        ) : null}
      </View>
      {/* The owner's hearts are people: faces and first names on a row of
          their own (they used to squeeze in beside the meta line and get
          clipped), the whole list a tap away. */}
      {own && own.reactedBy.length > 0 && <LikesRow update={own} />}
    </Pressable>
  );
}

function LikesRow({ update }: { update: OwnUpdate }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  // A server from before the "Liked by" list sends names only: the line
  // still reads, without faces, and there is no list to open.
  const likers = update.likers ?? null;
  const names = likers ? likers.map((l) => l.name) : update.reactedBy;
  const parts = likedByParts(names);
  const line = (
    <>
      {likers ? (
        <View style={styles.faces}>
          {likers.slice(0, 3).map((liker, i) => (
            <View
              key={liker.userId}
              style={[styles.face, { borderColor: theme.backgroundElement }, i > 0 && styles.faceOverlap]}>
              <Avatar name={liker.name} imageUrl={liker.imageUrl} size={24} />
            </View>
          ))}
        </View>
      ) : (
        <SymbolView
          name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }}
          size={16}
          tintColor={theme.danger}
        />
      )}
      <ThemedText type="small" style={styles.likedBy}>
        {parts.map((part, i) => (
          <ThemedText key={i} type={part.bold ? 'smallBold' : 'small'}>
            {part.text}
          </ThemedText>
        ))}
      </ThemedText>
    </>
  );
  if (!likers) return <View style={styles.likes}>{line}</View>;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={parts.map((p) => p.text).join('')}
        accessibilityHint="Shows everyone who liked this update"
        testID="liked-by"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.likes,
          styles.likesButton,
          { backgroundColor: theme.field },
          pressed && styles.pressed,
        ]}>
        {line}
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={12}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Pressable>
      <LikedBySheet update={update} likers={likers} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
  },
  divider: { height: StyleSheet.hairlineWidth },
  row: { gap: Spacing.two, paddingVertical: Spacing.one },
  pressed: { opacity: 0.7 },
  photo: {
    width: '100%',
    borderRadius: Spacing.three,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  meta: { flex: 1 },
  heart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  likes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  likesButton: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three - 2,
  },
  likedBy: { flex: 1 },
  faces: { flexDirection: 'row' },
  face: {
    borderWidth: 2,
    borderRadius: 14,
  },
  faceOverlap: { marginLeft: -Spacing.two },
});
