import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import type { SplitLayout } from '@/hooks/use-split-layout';
import { useTheme } from '@/hooks/use-theme';

/** iPadOS floats its tab bar over the top of the window, centred, and the
 * safe area does not include it (docs/wide-layouts-plan.md §11). A second
 * pane that starts with text pads down by this much (on top of the safe
 * area and its own Spacing.four) so its heading clears the bar and lines up
 * with the list's eyebrow; the trip page's map is fine running under the glass. Zero
 * everywhere else: iPhones (the Duo included) keep the bar at the bottom. */
export const PadTabBarClearance = Platform.OS === 'ios' && Platform.isPad ? 24 : 0;

/**
 * A screen's primary content with, on a wide window, a second pane beside it
 * (docs/wide-layouts-plan.md §3.2).
 *
 * The primary pane is one element in one fixed slot of this row whether the
 * window is split or not, and whichever side the second pane opens on: the
 * slots either side of it hold the second pane and the seam or nothing. So
 * crossing the breakpoint — a rotation, a Stage Manager resize, folding or
 * unfolding — adds or drops the second pane and never remounts the first:
 * the list keeps its scroll position, its selection and its state. (The
 * Flights split used to swap parents at the breakpoint and lost all three.)
 */
export function SplitPanes({
  layout,
  primary,
  secondary,
}: {
  layout: SplitLayout;
  primary: ReactNode;
  /** The second pane; only rendered while the window is split. */
  secondary: ReactNode;
}) {
  const theme = useTheme();
  const { split, order, primaryWidth } = layout;
  const seam = <View style={[styles.seam, { backgroundColor: theme.hairline }]} />;
  const second = <View style={styles.secondary}>{secondary}</View>;
  const secondLeft = split && order === 'primary-right';
  const secondRight = split && order === 'primary-left';

  return (
    <View style={styles.row}>
      {secondLeft ? second : null}
      {secondLeft ? seam : null}
      <View style={split ? { width: primaryWidth } : styles.fill}>{primary}</View>
      {secondRight ? seam : null}
      {secondRight ? second : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  fill: {
    flex: 1,
  },
  seam: {
    width: StyleSheet.hairlineWidth,
  },
  secondary: {
    flex: 1,
  },
});
