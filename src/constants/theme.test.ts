import { Colors } from './theme';

// plugins/with-android-theme.js paints Android's native theme (Switch thumb,
// Alert dialogs) from a copy of this palette — a config plugin can't import
// TS. This keeps the two from drifting.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PALETTE } = require('../../plugins/with-android-theme') as {
  PALETTE: Record<'light' | 'dark', Record<string, string>>;
};

describe('Android native theme palette', () => {
  it.each(['light', 'dark'] as const)('matches the %s theme', (scheme) => {
    expect(PALETTE[scheme]).toEqual({
      tint: Colors[scheme].tint,
      surface: Colors[scheme].backgroundElement,
      text: Colors[scheme].text,
      textSecondary: Colors[scheme].textSecondary,
    });
  });
});
