import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Header-style "+" on a title row's right edge — the standard list-screen
 * add affordance, same placement on every platform. Liquid Glass where the OS
 * supports it; an elevated brand-tint circle everywhere else.
 *
 * Shared: Home and the journal both carry one, and they must be the same
 * button — two "+"s a tab apart that looked different would read as two
 * different things. */
export function AddFlightButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();

  const icon = (
    <SymbolView
      name={{ ios: 'plus', android: 'add', web: 'add' }}
      size={20}
      weight="semibold"
      tintColor={glass ? theme.tint : '#ffffff'}
    />
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a flight, past or future"
      onPress={onPress}>
      {glass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.circle}>
          {icon}
        </GlassView>
      ) : (
        <View style={[styles.circle, styles.fallback, { backgroundColor: theme.tint }]}>{icon}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallback: {
    shadowColor: '#0B1520',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
