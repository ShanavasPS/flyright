import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Pulsing "live" marker — the quiet heartbeat that says this card updates.
 * One component for every place the app says it: the live card, the
 * journal's "Live" heading, and the free plan's row for a flight in the air
 * should all look the same. */
export function LiveDot() {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(0.35, { duration: 1000 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);
  const theme = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.liveRow}>
      <Animated.View style={[styles.liveDot, { backgroundColor: theme.success }, style]} />
      <ThemedText type="smallBold" style={[styles.liveLabel, { color: theme.success }]}>
        Live
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  liveLabel: {
    fontSize: 10,
    lineHeight: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
