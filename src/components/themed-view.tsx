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
  // Light-mode cards are white on a white page; a hairline border plus a
  // whisper of shadow separates them (Flighty / Airbnb style). Dark mode
  // relies on surface contrast instead — shadows vanish on navy.
  const elevated = type === 'backgroundElement' && scheme !== 'dark';

  return (
    <View
      style={[
        { backgroundColor: theme[type ?? 'background'] },
        elevated && [styles.elevated, { borderColor: theme.hairline }],
        style,
      ]}
      {...otherProps}
    />
  );
}

const styles = StyleSheet.create({
  elevated: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#0B1520',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
});
