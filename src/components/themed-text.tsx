import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'display'
    | 'title'
    | 'tabTitle'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        // Inter on the web (loaded in app/+html.tsx); native keeps the
        // platform face the rest of the app is set in.
        Platform.OS === 'web' && { fontFamily: Fonts.sans },
        type === 'default' && styles.default,
        type === 'display' && styles.display,
        type === 'title' && styles.title,
        type === 'tabTitle' && styles.tabTitle,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && [styles.link, { color: theme.tint }],
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.tint }],
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  /** Hero numerals only (stats hero, payout amounts) — never screen titles. */
  display: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  /** Screen titles, at the iOS large-title scale. */
  title: {
    fontSize: 34,
    fontWeight: 700,
    lineHeight: 41,
  },
  /** A tab's own name at its top (Updates, Friends, World, Claims): the
   * size of the greeting on Flights, so the five tabs read as one set — the
   * 34pt large title outweighed the content under it. */
  tabTitle: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
