import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The joint between two legs of one itinerary in a list of trip rows: a
 * short dotted stem and "2h 55m in Doha", indented to the rows' text column.
 * Rows stay separate cards — each leg is its own flight to open — but the
 * stem says the two are one journey and how long the traveller waits between
 * them, which two identical-looking cards never did. */
export function LayoverMark({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.mark} accessibilityLabel={`Connection: ${label}`}>
      <View style={styles.stem}>
        {Array.from({ length: 3 }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
        ))}
      </View>
      <SymbolView
        name={{
          ios: 'arrow.triangle.swap',
          android: 'connecting_airports',
          web: 'connecting_airports',
        }}
        size={13}
        tintColor={theme.textSecondary}
      />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // The logo column is 48pt wide plus the card's 16pt padding and gap:
    // the mark lines up with the rows' text, not their edge.
    paddingLeft: Spacing.three + 48 + Spacing.three,
    paddingVertical: Spacing.one,
  },
  stem: {
    width: 3,
    gap: 3,
    alignItems: 'center',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.55,
  },
});
