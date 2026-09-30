import { test } from 'node:test';
import { checkFontCap } from './large-text/font-cap.mjs';

test('react-native Text and TextInput keep the 1.5x font-size ceiling', () => {
  checkFontCap();
});
