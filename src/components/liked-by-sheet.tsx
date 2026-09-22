import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SHEET_ENTERING, sheetBottomPadding } from '@/components/sheet-entering';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import {
  agoLabel,
  captionOf,
  relationLabel,
  type Liker,
  type TripUpdate,
} from '@/services/trip-updates';

/**
 * Everyone who put a heart on one of the traveller's own updates: face,
 * name, how they know the traveller and when — the whole list behind the
 * "Liked by Clara, Noah and 3 others" line. Only the owner ever sees it.
 *
 * - `update`: the update the hearts are on (its photo and caption head the
 *   sheet); null while closed.
 * - `likers`: newest heart first, as `updates.mine` returns them.
 * - `visible` / `onClose`: the caller owns the open state.
 */
export function LikedBySheet({
  update,
  likers,
  visible,
  onClose,
}: {
  update: Pick<TripUpdate, 'updateId' | 'text' | 'photoUrl' | 'createdAt'> | null;
  likers: Liker[];
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const open = visible && !!update;
  const caption = update ? captionOf(update) : '';

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Backdrop and card are siblings (see menu-sheet): a card inside a
          Pressable can't scroll on Android. */}
      <View style={styles.sheet}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        {open && update && (
          <Animated.View
            entering={SHEET_ENTERING}
            style={[
              styles.card,
              { backgroundColor: theme.background, paddingBottom: sheetBottomPadding(insets.bottom) },
            ]}>
            <View style={styles.header}>
              {update.photoUrl && (
                <Image
                  source={{ uri: update.photoUrl }}
                  recyclingKey={update.updateId}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                  style={styles.thumb}
                />
              )}
              <View style={styles.headerText}>
                <ThemedText themeColor="heading" style={styles.title}>
                  Liked by {likers.length}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {[update.text ? `“${caption}”` : caption, agoLabel(update.createdAt, now)]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                testID="liked-by-close"
                hitSlop={Spacing.two}
                onPress={onClose}
                style={({ pressed }) => [styles.close, { backgroundColor: theme.field }, pressed && styles.pressed]}>
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  weight="bold"
                  tintColor={theme.textSecondary}
                />
              </Pressable>
            </View>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {likers.map((liker) => {
                const relation = relationLabel(liker.relation);
                return (
                  <View
                    key={liker.userId}
                    accessible
                    accessibilityLabel={[liker.name, relation].filter(Boolean).join(', ')}
                    style={[styles.row, { borderBottomColor: theme.hairline }]}>
                    <View>
                      <Avatar name={liker.name} imageUrl={liker.imageUrl} size={44} />
                      <View style={[styles.heart, { backgroundColor: theme.background }]}>
                        <SymbolView
                          name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }}
                          size={11}
                          tintColor={theme.danger}
                        />
                      </View>
                    </View>
                    <View style={styles.rowText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {liker.name}
                      </ThemedText>
                      {relation && (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {relation}
                        </ThemedText>
                      )}
                    </View>
                    {liker.at && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {agoLabel(liker.at, now)}
                      </ThemedText>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
              Only you can see who liked your updates.
            </ThemedText>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    maxHeight: '80%',
    borderTopLeftRadius: Spacing.five - Spacing.one,
    borderTopRightRadius: Spacing.five - Spacing.one,
    paddingHorizontal: Spacing.three + Spacing.one,
    paddingTop: Spacing.three + Spacing.one,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two + 2,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 800,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heart: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  footer: {
    textAlign: 'center',
  },
});
