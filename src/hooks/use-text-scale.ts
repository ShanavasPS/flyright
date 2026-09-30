import { useWindowDimensions } from 'react-native';

import { MaxFontScale } from '@/constants/theme';

/** The scale text is actually drawn at: the OS text size, capped at
 * MaxFontScale like every Text and TextInput. `fontScale` from
 * useWindowDimensions keeps reporting the OS value (2.64 at iOS AX3), so
 * layout decisions based on text size read this instead. */
export function textScaleFor(fontScale: number): number {
  return Math.min(fontScale, MaxFontScale);
}

export function useTextScale(): number {
  return textScaleFor(useWindowDimensions().fontScale);
}

/** From here on the phone's text setting is "large": iOS xxxLarge (1.35x)
 * and every accessibility size, Android's 1.3 step and up. Rows that set
 * several things side by side switch to a roomier arrangement above it. */
export const LargeTextScale = 1.3;

export function useLargeText(): boolean {
  return useTextScale() >= LargeTextScale;
}
