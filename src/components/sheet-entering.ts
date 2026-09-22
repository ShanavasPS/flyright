import { Platform } from 'react-native';
import { SlideInDown } from 'react-native-reanimated';

/** The sheets' slide-up entrance, on iOS only. On Android the Modal's window
 * first lays out ~78 dp short and corrects a frame later; while a Reanimated
 * entering animation runs it owns the card's frame, so the card stayed where
 * the short layout put it and the tab bar showed through a gap under the
 * sheet until something re-laid it out (opening a photo did). Without the
 * slide the card follows the correction; the Modal still fades in. */
export const SHEET_ENTERING = Platform.OS === 'ios' ? SlideInDown.duration(260) : undefined;
