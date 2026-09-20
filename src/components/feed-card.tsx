import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { agoLabel, photoAspect, updateContext, type TripUpdate } from '@/services/trip-updates';

export interface FeedPost extends TripUpdate {
  owner: { userId: string; name: string; imageUrl: string | null };
  trip: { journeyId: string; number: string; fromCode: string; toCode: string };
}

/**
 * One post in the Friends tab's "Latest from trips": who, the flight it came
 * from and where they were, the photo at full width, their words, and the
 * heart. The header opens their page; a long press reports the post.
 */
export function FeedCard({
  post,
  now,
  onOpenPerson,
  onOpenPhoto,
  onReact,
  onReport,
}: {
  post: FeedPost;
  now: Date;
  onOpenPerson: () => void;
  /** The photo opens full screen, where it can be liked and replied to. */
  onOpenPhoto: () => void;
  onReact: () => void;
  onReport: () => void;
}) {
  const theme = useTheme();
  const meta = [post.trip.number || `${post.trip.fromCode} → ${post.trip.toCode}`, updateContext(post), agoLabel(post.createdAt, now)]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityHint="Long press to report"
      onLongPress={onReport}
      delayLongPress={400}
      style={[styles.card, { borderColor: theme.hairline, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${post.owner.name}, ${meta}`}
          onPress={onOpenPerson}
          style={({ pressed }) => [styles.who, pressed && styles.pressed]}>
          <Avatar name={post.owner.name} imageUrl={post.owner.imageUrl} size={32} />
          <View style={styles.whoText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {post.owner.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {meta}
            </ThemedText>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.reacted ? 'Remove your heart' : 'Send a heart'}
          accessibilityState={{ selected: post.reacted }}
          hitSlop={Spacing.two}
          onPress={onReact}
          style={({ pressed }) => [
            styles.heart,
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
      </View>
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
    gap: Spacing.two,
    padding: Spacing.two + Spacing.one,
  },
  who: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  whoText: {
    flex: 1,
  },
  pressed: { opacity: 0.6 },
  heart: {
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
    paddingBottom: Spacing.three,
  },
});
