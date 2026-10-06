import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CABIN_LABELS, CABINS, type CabinClass } from '@/services/cabin';
import { tick } from '@/services/haptics';

/** The cabin a trip is flown in, as four chips — Economy, Premium economy,
 * Business, First. Tapping the chosen one again clears it: the cabin is
 * optional, and "not said" is different from Economy. Used on the
 * add-flight form and the trip's details editor. */
export function CabinPicker({
  value,
  onChange,
  label = 'Cabin',
}: {
  value: CabinClass | null;
  onChange: (cabin: CabinClass | null) => void;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.block}>
      {!!label && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
      )}
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label || 'Cabin'}>
        {CABINS.map((cabin) => {
          const selected = value === cabin;
          return (
            <Pressable
              key={cabin}
              testID={`cabin-${cabin}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityHint={selected ? 'Tap again to clear' : undefined}
              onPress={() => {
                tick();
                onChange(selected ? null : cabin);
              }}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: selected ? theme.tint : theme.hairline,
                  backgroundColor: selected ? `${theme.tint}22` : theme.backgroundElement,
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={selected ? { color: theme.tint } : undefined}>
                {CABIN_LABELS[cabin]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  label: {
    marginLeft: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
