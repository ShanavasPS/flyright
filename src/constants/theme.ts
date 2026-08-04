/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  // "Altitude blue + payout green": brand blue (#208AEF, same as the splash)
  // for actions and chrome accents; green is reserved for money moments —
  // owed amounts, eligible verdicts, on-time status. Dark mode is deep navy,
  // not pure black, so cards still read as "sky at night".
  // Light mode is branded, not plain white: soft blue page background with
  // white elevated cards (ThemedView shadows them) and navy-blue headings.
  light: {
    text: '#0B1520',
    heading: '#0F4C8A',
    background: '#EAF2FB',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#D3E4F6',
    textSecondary: '#5B6B7C',
    tint: '#208AEF',
    success: '#17914F',
    danger: '#D93036',
  },
  dark: {
    text: '#F2F6FA',
    heading: '#F2F6FA',
    background: '#0A1220',
    backgroundElement: '#16202E',
    backgroundSelected: '#223144',
    textSecondary: '#93A5B8',
    tint: '#3B9AF7',
    success: '#2DB874',
    danger: '#F2555A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
