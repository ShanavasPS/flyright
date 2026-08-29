/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  // "Midnight navy + payout green" (matches the contrail-check app icon,
  // #0C1B36 splash): navy anchors headings and dark-mode surfaces, cobalt is
  // the action tint, and green stays reserved for money moments — owed
  // amounts, eligible verdicts, on-time status. Dark mode is the icon's
  // night-flight navy, not pure black, so cards still read as "sky at night".
  // Light mode is a cool porcelain page with white elevated cards
  // (ThemedView shadows them) and midnight-navy headings.
  light: {
    text: '#0B1424',
    heading: '#13294B',
    background: '#F3F6FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#DDE7F4',
    textSecondary: '#5A6A7E',
    tint: '#1E6BE0',
    success: '#0FA362',
    danger: '#D93036',
    warning: '#A9720B',
  },
  dark: {
    text: '#F2F6FB',
    heading: '#F2F6FB',
    background: '#070F20',
    backgroundElement: '#101D34',
    backgroundSelected: '#1B2C4A',
    textSecondary: '#8FA2BB',
    tint: '#4E9BF5',
    success: '#2FD68C',
    danger: '#F2555A',
    warning: '#F2B441',
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
