import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type MenuOption = { text: string; destructive?: boolean; onPress: () => void };

/** A bottom sheet of choices for the platforms without ActionSheetIOS: a
 * dimmed backdrop, one rounded card of rows in the order given (Android's
 * Alert reorders its three buttons and caps at three), destructive rows in
 * red, Cancel last. Tapping outside cancels. */
export function MenuSheet({
  title,
  options,
  onClose,
}: {
  title: string;
  options: MenuOption[] | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={!!options}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      {/* Backdrop and card are siblings (see year-sheet): a card inside a
          Pressable can't scroll its rows on Android. */}
      <View style={styles.sheet}>
        <Pressable accessibilityLabel="Cancel" onPress={onClose} style={styles.backdrop} />
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.title}>
            {title}
          </ThemedText>
          {/* A long list (a decade of years) scrolls inside the card rather
              than pushing Cancel off the screen. */}
          <ScrollView style={styles.rows} bounces={false}>
            {(options ?? []).map((o) => (
              <Pressable
                key={o.text}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  o.onPress();
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.field }]}>
                <ThemedText style={o.destructive ? { color: theme.danger } : undefined}>
                  {o.text}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.row,
              styles.cancel,
              { backgroundColor: theme.field },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" themeColor="heading">
              Cancel
            </ThemedText>
          </Pressable>
        </View>
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
    borderTopLeftRadius: Spacing.five,
    borderTopRightRadius: Spacing.five,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.three,
    gap: Spacing.half,
  },
  title: {
    textAlign: 'center',
    paddingBottom: Spacing.two,
  },
  rows: {
    maxHeight: 52 * 7,
    flexGrow: 0,
  },
  row: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  cancel: {
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  pressed: { opacity: 0.7 },
});
