import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ThemedView, type ThemedViewProps } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// A quiet cousin of the passport card's night sky: a faint top-left sheen
// over the normal card surface plus a hairline border, so content cards read
// polished without competing with the navy hero card.
const SHEEN = {
  dark: 'linear-gradient(160deg, #182948 0%, #101D34 52%, #0D1930 100%)',
  light: 'linear-gradient(160deg, #FFFFFF 0%, #FDFEFF 52%, #F2F7FE 100%)',
} as const;
const BORDER = {
  dark: 'rgba(242,246,251,0.07)',
  light: 'rgba(19,41,75,0.06)',
} as const;
// Tint-washed backdrop for icon badges.
const ICON_WASH = {
  dark: 'linear-gradient(160deg, rgba(78,155,245,0.26) 0%, rgba(78,155,245,0.10) 100%)',
  light: 'linear-gradient(160deg, rgba(30,107,224,0.14) 0%, rgba(30,107,224,0.05) 100%)',
} as const;

// Climbing at 45° like a departure. SF's airplane points east (rotate back),
// Material's flight points north (rotate forward) — both end up northeast.
export const PLANE_CLIMBING = Platform.select({
  ios: { transform: [{ rotate: '-45deg' }] },
  default: { transform: [{ rotate: '45deg' }] },
});

function useScheme(): keyof typeof SHEEN {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** The standard content card with the sheen treatment. Same padding, radius,
 * and gap as Card; pass `style` to extend or override. */
export function SheenCard({ style, ...rest }: ThemedViewProps) {
  const scheme = useScheme();
  return (
    <ThemedView
      type="backgroundElement"
      style={[
        styles.card,
        { experimental_backgroundImage: SHEEN[scheme], borderColor: BORDER[scheme] },
        style,
      ]}
      {...rest}
    />
  );
}

/** A tint-washed rounded square holding a symbol — the visual anchor used by
 * journey rows and stat cards. `climbing` angles a plane glyph up 45°. */
export function IconBadge({
  symbol,
  size = 40,
  climbing = false,
}: {
  symbol: SymbolViewProps['name'];
  size?: number;
  climbing?: boolean;
}) {
  const scheme = useScheme();
  const theme = useTheme();
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size * 0.35,
          experimental_backgroundImage: ICON_WASH[scheme],
        },
      ]}>
      <SymbolView
        name={symbol}
        size={size / 2}
        weight="semibold"
        tintColor={theme.tint}
        style={climbing ? PLANE_CLIMBING : undefined}
      />
    </View>
  );
}

// The one-shot sweep is brighter than the resting sheen — it has one frame
// of attention to earn.
const SWEEP = {
  dark: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 100%)',
  light:
    'linear-gradient(90deg, rgba(30,107,224,0) 0%, rgba(30,107,224,0.09) 50%, rgba(30,107,224,0) 100%)',
} as const;
const SWEEP_WIDTH = 72;

/** A highlight that sweeps across its parent card once on mount — the "ta-da"
 * reserved for money moments. The parent needs `overflow: 'hidden'`; skipped
 * entirely under reduce-motion. */
export function SheenSweep({ delay = 350 }: { delay?: number }) {
  const scheme = useScheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(-SWEEP_WIDTH * 3);

  useEffect(() => {
    if (!width || reduceMotion) return;
    x.value = -SWEEP_WIDTH * 3;
    x.value = withDelay(
      delay,
      withTiming(width + SWEEP_WIDTH, { duration: 900, easing: Easing.inOut(Easing.quad) }),
    );
  }, [width, reduceMotion, delay, x]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: '14deg' }],
  }));

  if (reduceMotion) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View
        style={[styles.sweep, { experimental_backgroundImage: SWEEP[scheme] }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: 1,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweep: {
    position: 'absolute',
    // Overshoot vertically so the 14° tilt still covers the card's corners.
    top: -40,
    bottom: -40,
    width: SWEEP_WIDTH,
  },
});
