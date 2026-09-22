import { Platform, useWindowDimensions } from 'react-native';

import { TwoPaneMinWidth } from '@/constants/theme';
import type { WideLayoutKey, WideLayoutSwitches } from '@/constants/wide-layouts';
import { useWideLayouts } from '@/hooks/use-wide-layouts';
import { useFoldState, type FoldState } from '../../modules/flyright-fold';

/** Which side the screen's own content (the list, the feed, the globe) sits
 * on when the window splits. 'primary-left' everywhere except an iPhone Duo
 * opened flat with the mirror switch on: there the right half is the cover
 * display's twin — the screen you were looking at before opening carries on
 * there — and the new pane opens on the left. */
export type SplitOrder = 'primary-left' | 'primary-right';

export interface SplitLayout {
  /** The window gets two panes. False → the single-column (phone) screen. */
  split: boolean;
  order: SplitOrder;
  /** Width of the primary pane when split, in points. */
  primaryWidth: number;
  /** An iPhone Duo's inner display, opened flat (see below). */
  duoOpen: boolean;
  /** Samsung Flex mode / tabletop: the screen has its own layout for it. */
  tabletop: boolean;
}

export type SplitSurface = Exclude<WideLayoutKey, 'duoMirror'>;

export interface SplitInput {
  width: number;
  os: typeof Platform.OS;
  isPad: boolean;
  fold: FoldState;
  switches: WideLayoutSwitches;
  surface: SplitSurface;
  /** The primary pane's width when no hinge decides it. */
  primaryWidth: number | ((windowWidth: number) => number);
  allowWeb: boolean;
}

/**
 * The one decision behind every wide-window split (docs/wide-layouts-plan.md).
 *
 * - Splits at TwoPaneMinWidth (840) — the Flights formula, unchanged — so
 *   every phone, both displays of a Flip, a foldable's cover and portrait
 *   inner screen and an iPad Split View half keep the phone layout.
 * - Never in tabletop posture: the screens that care have a layout for it.
 * - Web only when the surface asks (Flights has split on the web since the
 *   foldable pass; the newer surfaces stay single-column there).
 * - The seam sits on a book-posture hinge when Android reports one.
 *
 * iPhone Duo: iPhone is portrait-only (app.json) and the Duo reports the
 * phone idiom, so an iOS phone-idiom window this wide can only be the Duo's
 * inner display opened flat — it ignores the orientation lock. Its hinge is
 * the middle of that display, so the seam is half the window. No native code
 * and no 27.1 SDK: this reads only the window size.
 */
export function splitLayoutFor(input: SplitInput): SplitLayout {
  const { width, os, isPad, fold, switches, surface, primaryWidth, allowWeb } = input;
  // Same test as the Flights tabletop layout: a horizontal hinge that splits
  // the screen and whose bounds are known.
  const tabletop =
    fold.orientation === 'horizontal' &&
    (fold.posture === 'halfOpened' || fold.isSeparating) &&
    !!fold.hingeBounds;
  const wide = width >= TwoPaneMinWidth;
  const duoOpen = os === 'ios' && !isPad && wide;
  const split = wide && !tabletop && switches[surface] && (os !== 'web' || allowWeb);

  const bookHinge =
    fold.orientation === 'vertical' && fold.isSeparating ? fold.hingeBounds : null;
  const seam = bookHinge ? bookHinge.left : duoOpen ? Math.round(width / 2) : null;
  const mirror = duoOpen && switches.duoMirror;

  const fallback = typeof primaryWidth === 'function' ? primaryWidth(width) : primaryWidth;
  const primary = seam == null ? fallback : mirror ? width - seam : seam;

  return {
    split,
    order: mirror ? 'primary-right' : 'primary-left',
    primaryWidth: Math.max(0, Math.round(primary)),
    duoOpen,
    tabletop,
  };
}

export function useSplitLayout(
  surface: SplitSurface,
  {
    primaryWidth,
    allowWeb = false,
  }: {
    primaryWidth: number | ((windowWidth: number) => number);
    allowWeb?: boolean;
  },
): SplitLayout {
  const { width } = useWindowDimensions();
  const fold = useFoldState();
  const switches = useWideLayouts();
  return splitLayoutFor({
    width,
    os: Platform.OS,
    isPad: Platform.OS === 'ios' && Platform.isPad,
    fold,
    switches,
    surface,
    primaryWidth,
    allowWeb,
  });
}
