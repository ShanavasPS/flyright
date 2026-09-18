import { Platform, Pressable, StyleSheet, Text, type PressableProps, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrimaryButtonProps = Pick<PressableProps, 'onPress' | 'disabled'> & {
  label: string;
};

/** On the web the button answers a hover with a lift; a CSS transition
 * react-native-web renders (and the style types don't know). Native never
 * sees it — no pointer, and the style prop would fail validation. */
const WEB_HOVER =
  Platform.OS === 'web'
    ? ({
        transitionProperty: 'transform, opacity, background-color',
        transitionDuration: '180ms',
        transitionTimingFunction: 'ease-out',
      } as unknown as ViewStyle)
    : null;

/** Filled brand-blue call-to-action — the one loud element on a screen. */
export function PrimaryButton({ label, onPress, disabled }: PrimaryButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }) => [
        styles.button,
        WEB_HOVER,
        { backgroundColor: theme.tint, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        hovered && !disabled && { transform: [{ translateY: -1 }, { scale: 1.01 }] },
      ]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  label: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 600,
  },
});
