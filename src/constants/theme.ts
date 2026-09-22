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
  // Light mode is a pure-white page (Flighty / Airbnb / Wise, not Apple's
  // grey grouped style): cards are white too and separate with a `hairline`
  // border (ThemedView adds it), so nothing on the page reads as dim. Bare
  // inputs sit on the page with a soft `field` fill instead.
  light: {
    text: '#0B1424',
    heading: '#13294B',
    background: '#FFFFFF',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E8EEF6',
    hairline: '#E3E8EF',
    field: '#F2F5F9',
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
    hairline: '#1B2C4A',
    field: '#101D34',
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

/** Windows at least this wide (dp) get the 'wide' size class — tablets,
 * unfolded foldables, split-screen halves on big tablets. Matches the
 * Android canonical medium-breakpoint. */
export const WideWindowMinWidth = 600;

/** Windows at least this wide (pt/dp) get list+detail two-pane layouts:
 * every iPad in portrait (mini 744, Air 11 820, 11-inch 834) and landscape,
 * Galaxy/Pixel Folds unfolded in landscape (~832/841), tablets, an iPhone Duo
 * opened flat (951). Everything phone-shaped stays one column: iPhones are
 * portrait-only (≤ 440), Android phones and Flip/Fold cover screens ≤ ~480,
 * a Fold held open in portrait ~707, the Duo's inner display upright 669.
 * Was 840 (Android's expanded breakpoint) until 2026-09-22. */
export const TwoPaneMinWidth = 740;

/** A pane's fixed width on a wide window, shrunk on the narrowest ones so
 * the other pane keeps at least 55% (an iPad mini: 335 | 409). */
export const paneWidth = (fixed: number) => (windowWidth: number) =>
  Math.min(fixed, Math.round(windowWidth * 0.45));
