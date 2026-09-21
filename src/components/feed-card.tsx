import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { agoLabel, photoAspect, updateContext, type TripUpdate } from '@/services/trip-updates';

export interface FeedPost extends TripUpdate {
  /** Replies under it; absent from a server that predates them. */
  comments?: number;
  owner: { userId: string; name: string; imageUrl: string | null };
  trip: { journeyId: string; number: string; fromCode: string; toCode: string };
}

/**
 * One postcard on Updates: who and when, the flight it came from and where
 * they were, the photo at full width, their words, then the heart and the
 * replies along the bottom. The header opens their page; a long press
 * reports the post.
 *
 * The buttons sit under the post, not beside the name: there they took the
 * header's right edge and cut "AY1571 · Through security · Helsinki" off
 * mid-word, and there was no room for a second one.
 */
export function FeedCard({
  post,
  now,
  onOpenPerson,
  onOpenPhoto,
  onReact,
  onComment,
  onReport,
}: {
  post: FeedPost;
  now: Date;
  onOpenPerson: () => void;
  /** The photo opens full screen, where it can be liked and replied to. */
  onOpenPhoto: () => void;
  onReact: () => void;
  onComment: () => void;
  onReport: () => void;
}) {
  const theme = useTheme();
  const ago = agoLabel(post.createdAt, now);
  // The flight and where they were. The time has its own place beside the
  // name, so this line only has to carry the trip — and may take two lines
  // rather than lose its end.
  const route = `${post.trip.fromCode} → ${post.trip.toCode}`;
  const meta = [post.trip.number ? `${post.trip.number} ${route}` : route, updateContext(post)]
    .filter(Boolean)
    .join(' · ');
  const comments = post.comments ?? 0;
  return (
    <Pressable
      accessibilityHint="Long press to report"
      onLongPress={onReport}
      delayLongPress={400}
      style={[styles.card, { borderColor: theme.hairline, backgroundColor: theme.backgroundElement }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${post.owner.name}, ${ago}, ${meta}`}
        onPress={onOpenPerson}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <Avatar name={post.owner.name} imageUrl={post.owner.imageUrl} size={32} />
        <View style={styles.whoText}>
          <View style={styles.nameLine}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
              {post.owner.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {ago}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {meta}
          </ThemedText>
        </View>
      </Pressable>
      {post.photoUrl && (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Open this trip"
          onPress={onOpenPhoto}
          onLongPress={onReport}
          delayLongPress={400}
          style={({ pressed }) => pressed && styles.pressed}>
          <Image
            source={{ uri: post.photoUrl }}
            recyclingKey={post.updateId}
            contentFit="cover"
            transition={200}
            accessibilityIgnoresInvertColors
            style={[styles.photo, { aspectRatio: photoAspect(post), backgroundColor: theme.field }]}
          />
        </Pressable>
      )}
      {post.text ? (
        <ThemedText selectable style={[styles.text, !post.photoUrl && styles.textOnly]}>
          {post.text}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.reacted ? 'Remove your heart' : 'Send a heart'}
          accessibilityState={{ selected: post.reacted }}
          hitSlop={Spacing.one}
          onPress={onReact}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: post.reacted ? `${theme.danger}1A` : theme.field },
            pressed && styles.pressed,
          ]}>
          <SymbolView
            name={
              post.reacted
                ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
                : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
            }
            size={15}
            tintColor={post.reacted ? theme.danger : theme.textSecondary}
          />
          {post.reactions > 0 && (
            <ThemedText type="small" themeColor={post.reacted ? 'danger' : 'textSecondary'}>
              {post.reactions}
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            comments ? `${comments} ${comments === 1 ? 'reply' : 'replies'}. Reply` : 'Reply'
          }
          hitSlop={Spacing.one}
          onPress={onComment}
          style={({ pressed }) => [styles.action, { backgroundColor: theme.field }, pressed && styles.pressed]}>
          <SymbolView
            name={{ ios: 'bubble.left', android: 'chat_bubble_outline', web: 'chat_bubble_outline' }}
            size={15}
            tintColor={theme.textSecondary}
          />
          {comments > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {comments}
            </ThemedText>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Spacing.three + 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + Spacing.one,
  },
  whoText: {
    flex: 1,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  name: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.two + Spacing.one,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 30,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: 15,
  },
  photo: {
    width: '100%',
  },
  textOnly: {
    paddingTop: 0,
  },
  text: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + Spacing.one,
  },
});
