import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  // Light-mode cards are white on a soft-blue page; the shadow separates them.
  // Dark mode relies on surface contrast instead — shadows vanish on navy.
  const elevated = type === 'backgroundElement' && scheme !== 'dark';

  return (
    <View
      style={[{ backgroundColor: theme[type ?? 'background'] }, elevated && styles.elevated, style]}
      {...otherProps}
    />
  );
}

const styles = StyleSheet.create({
  elevated: {
    shadowColor: '#0B1520',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
