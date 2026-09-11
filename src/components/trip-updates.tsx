import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Fragment } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  agoLabel,
  captionOf,
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
          <UpdateRow update={update} now={now} onReact={onReact} onReport={onReport} onRemove={onRemove} />
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
}: {
  update: TripUpdate | OwnUpdate;
  now: Date;
  onReact?: (updateId: string) => void;
  /** Someone else's update: long press offers to report it. */
  onReport?: (updateId: string) => void;
  onRemove?: (updateId: string) => void;
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
        <Image
          source={{ uri: update.photoUrl }}
          recyclingKey={update.updateId}
          contentFit="cover"
          transition={200}
          accessibilityIgnoresInvertColors
          style={[styles.photo, { aspectRatio: photoAspect(update), backgroundColor: theme.field }]}
        />
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
        ) : own && own.reactedBy.length > 0 ? (
          <View style={styles.heart}>
            <SymbolView
              name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }}
              size={16}
              tintColor={theme.danger}
            />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {namesLine(own.reactedBy)}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** "Anna", "Anna and Sam", "Anna, Sam and 2 others". */
export function namesLine(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 === 1 ? '' : 's'}`;
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
});
