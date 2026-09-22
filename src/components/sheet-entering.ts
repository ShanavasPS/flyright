import { Platform } from 'react-native';
import { SlideInDown } from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';

/** The sheets' slide-up entrance, on iOS only. On Android the Modal's window
 * first lays out ~78 dp short and corrects a frame later; while a Reanimated
 * entering animation runs it owns the card's frame, so the card stayed where
 * the short layout put it and the tab bar showed through a gap under the
 * sheet until something re-laid it out (opening a photo did). Without the
 * slide the card follows the correction; the Modal still fades in. */
export const SHEET_ENTERING = Platform.OS === 'ios' ? SlideInDown.duration(260) : undefined;

/** Space under a bottom sheet's last control. iOS: the home-indicator inset
 * (34 pt) already leaves room, so at least that, unchanged. Android: the
 * gesture-bar inset is only ~24 dp, which set the button close to the edge,
 * so the usual 16 goes on top — about as much room as on iOS. */
export function sheetBottomPadding(insetBottom: number): number {
  return Platform.OS === 'android' ? insetBottom + Spacing.three : Math.max(insetBottom, Spacing.three);
}
