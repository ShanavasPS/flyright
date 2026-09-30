/** Confirms patches/react-native+*.patch still gives Text and TextInput their
 * default font-size ceiling. Jest mocks Text, so a render test can't see it. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const MARKER = 'maxFontSizeMultiplier ?? 1.5';
const FILES = ['Libraries/Text/Text.js', 'Libraries/Components/TextInput/TextInput.js'];

export function checkFontCap() {
  const missing = FILES.filter(
    (file) => !readFileSync(join(repo, 'node_modules/react-native', file), 'utf8').includes(MARKER),
  );
  if (missing.length) {
    throw new Error(
      `The 1.5x text cap is missing from react-native ${missing.join(', ')}. Run npm install (patch-package) or re-apply it in patches/.`,
    );
  }
}
