import { StyleSheet } from 'react-native';

import { ThemedView, type ThemedViewProps } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** The app's standard content card: elevated surface, Spacing.four padding
 * and radius. Pass `style` to extend or override. */
export function Card({ style, ...rest }: ThemedViewProps) {
  return <ThemedView type="backgroundElement" style={[styles.card, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});
