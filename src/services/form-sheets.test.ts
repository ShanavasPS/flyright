/** Guards the form-sheet layout rule: on iOS 26+ react-native-screens wraps a
 * sheet's content in its own safe-area view, and a ScrollView below a flex
 * wrapper collapses to zero height there — 1.1.5's photo pickers came up
 * empty. A sheet screen either has no ScrollView or returns one as its root
 * (pro-offer.tsx, claim-letter.tsx). */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const layout = readFileSync(join(root, 'src/app/_layout.tsx'), 'utf8');
const sheets = [...layout.matchAll(/name="([^"]+)"\s*options=\{\{([\s\S]*?)\}\}/g)]
  .filter(([, , options]) => options.includes('formSheet'))
  .map(([, name]) => name);

function screenSource(route: string): string {
  const file = readFileSync(join(root, 'src/app', `${route}.tsx`), 'utf8');
  const screen = file.match(/from '@\/screens\/([^']+)'/)?.[1];
  return screen ? readFileSync(join(root, 'src/screens', `${screen}.tsx`), 'utf8') : file;
}

describe('form sheets', () => {
  it('finds the sheets in the root layout', () => {
    expect(sheets).toEqual(expect.arrayContaining(['trip-photo', 'home-photo', 'pro-offer']));
  });

  it.each(sheets)('%s has no ScrollView under a wrapper', (route) => {
    const source = screenSource(route);
    const scrollViews = source.match(/<ScrollView\b/g)?.length ?? 0;
    const asRoot = /return\s*\(?\s*(\/\/[^\n]*\n\s*)*<ScrollView\b/.test(source) ? 1 : 0;
    expect(scrollViews - asRoot).toBe(0);
  });
});
