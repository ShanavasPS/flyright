import { MaxFontScale } from '@/constants/theme';

import { LargeTextScale, textScaleFor } from './use-text-scale';

describe('textScaleFor', () => {
  it('follows the OS text size up to the cap', () => {
    expect(textScaleFor(0.82)).toBe(0.82);
    expect(textScaleFor(1)).toBe(1);
    expect(textScaleFor(1.35)).toBe(1.35);
  });

  it('holds at the cap above it (iOS AX1, AX3, AX5; Android 2.0)', () => {
    for (const scale of [1.79, 2.64, 3.57, 2]) expect(textScaleFor(scale)).toBe(MaxFontScale);
  });
});

describe('LargeTextScale', () => {
  it('sits between the standard sizes and the cap', () => {
    expect(LargeTextScale).toBeGreaterThan(1.24); // iOS xxLarge stays regular
    expect(LargeTextScale).toBeLessThanOrEqual(1.35); // iOS xxxLarge is large
    expect(LargeTextScale).toBeLessThan(MaxFontScale);
  });
});
