import { WIDE_LAYOUT_DEFAULTS } from '@/constants/wide-layouts';

import type { FoldState } from '../../modules/flyright-fold';
import { splitLayoutFor, type SplitInput } from './use-split-layout';

const NO_FOLD: FoldState = { posture: 'none', orientation: null, isSeparating: false, hingeBounds: null };

const input = (over: Partial<SplitInput>): SplitInput => ({
  width: 390,
  fontScale: 1,
  os: 'ios',
  isPad: false,
  fold: NO_FOLD,
  switches: WIDE_LAYOUT_DEFAULTS,
  surface: 'claims',
  primaryWidth: 400,
  allowWeb: false,
  ...over,
});

describe('splitLayoutFor — every device class', () => {
  it.each([
    ['iPhone', { width: 402 }],
    ['iPhone Pro Max', { width: 440 }],
    ['Pixel 9a', { os: 'android' as const, width: 412 }],
    ['Galaxy Flip main', { os: 'android' as const, width: 360 }],
    ['Galaxy Fold cover', { os: 'android' as const, width: 344 }],
    ['Galaxy Fold inner, portrait', { os: 'android' as const, width: 707 }],
    ['Galaxy Fold inner, landscape', { os: 'android' as const, width: 832 }],
    ['iPad mini, portrait', { isPad: true, width: 744 }],
    ['iPad 11-inch, portrait', { isPad: true, width: 834 }],
    ['iPad Split View half', { isPad: true, width: 590 }],
    ['iPhone Duo cover', { width: 466 }],
    ['iPhone Duo inner, upright', { width: 669 }],
  ])('%s stays single-column', (_name, over) => {
    const layout = splitLayoutFor(input(over));
    expect(layout.split).toBe(false);
    expect(layout.duoOpen).toBe(false);
  });

  it.each([
    ['iPad landscape', { isPad: true, width: 1180 }],
    ['iPad 13-inch, portrait', { isPad: true, width: 1032 }],
    ['Pixel Fold, landscape', { os: 'android' as const, width: 841 }],
    ['Android tablet', { os: 'android' as const, width: 1280 }],
  ])('%s splits with the primary pane on the left', (_name, over) => {
    const layout = splitLayoutFor(input(over));
    expect(layout).toMatchObject({ split: true, order: 'primary-left', primaryWidth: 400, duoOpen: false });
  });

  it('takes the primary width from a function of the window', () => {
    const layout = splitLayoutFor(input({ isPad: true, width: 1000, primaryWidth: (w) => w * 0.42 }));
    expect(layout.primaryWidth).toBe(420);
  });
});

describe('splitLayoutFor — iPhone Duo opened flat', () => {
  it('splits at the hinge, primary left, while the mirror switch is off', () => {
    const layout = splitLayoutFor(input({ width: 951 }));
    expect(layout).toMatchObject({ split: true, duoOpen: true, order: 'primary-left', primaryWidth: 476 });
  });

  it('puts the cover twin on the right when the mirror switch is on', () => {
    const layout = splitLayoutFor(
      input({ width: 951, switches: { ...WIDE_LAYOUT_DEFAULTS, duoMirror: true } }),
    );
    expect(layout).toMatchObject({ split: true, order: 'primary-right', primaryWidth: 475 });
  });

  it('never treats an iPad as a Duo', () => {
    const layout = splitLayoutFor(input({ isPad: true, width: 951, switches: { ...WIDE_LAYOUT_DEFAULTS, duoMirror: true } }));
    expect(layout).toMatchObject({ duoOpen: false, order: 'primary-left', primaryWidth: 400 });
  });
});

describe('splitLayoutFor — Android postures and switches', () => {
  it('seams on a book-posture hinge', () => {
    const fold: FoldState = { posture: 'flat', orientation: 'vertical', isSeparating: true, hingeBounds: { left: 420, top: 0, right: 421, bottom: 700 } };
    expect(splitLayoutFor(input({ os: 'android', width: 841, fold })).primaryWidth).toBe(420);
  });

  it('never splits in tabletop posture', () => {
    const fold: FoldState = { posture: 'halfOpened', orientation: 'horizontal', isSeparating: true, hingeBounds: { left: 0, top: 350, right: 841, bottom: 351 } };
    const layout = splitLayoutFor(input({ os: 'android', width: 841, fold }));
    expect(layout).toMatchObject({ split: false, tabletop: true });
  });

  it('treats a separating horizontal hinge with no bounds as flat, like Flights does', () => {
    const fold: FoldState = { posture: 'halfOpened', orientation: 'horizontal', isSeparating: true, hingeBounds: null };
    expect(splitLayoutFor(input({ os: 'android', width: 841, fold }))).toMatchObject({ split: true, tabletop: false });
  });

  it('keeps one column at the accessibility text sizes', () => {
    expect(splitLayoutFor(input({ isPad: true, width: 1180, fontScale: 1.35 })).split).toBe(true);
    expect(splitLayoutFor(input({ isPad: true, width: 1180, fontScale: 1.5 })).split).toBe(true);
    expect(splitLayoutFor(input({ isPad: true, width: 1180, fontScale: 1.8 })).split).toBe(false);
    expect(splitLayoutFor(input({ os: 'android', width: 841, fontScale: 2 })).split).toBe(false);
  });

  it('honours a surface switched off', () => {
    const switches = { ...WIDE_LAYOUT_DEFAULTS, claims: false };
    expect(splitLayoutFor(input({ isPad: true, width: 1180, switches })).split).toBe(false);
    expect(splitLayoutFor(input({ isPad: true, width: 1180, switches, surface: 'friends' })).split).toBe(true);
  });

  it('stays single-column on the web unless the surface allows it', () => {
    expect(splitLayoutFor(input({ os: 'web', width: 1280 })).split).toBe(false);
    expect(splitLayoutFor(input({ os: 'web', width: 1280, surface: 'flights', allowWeb: true })).split).toBe(true);
  });
});
