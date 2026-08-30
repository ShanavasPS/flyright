import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';

import { WideWindowMinWidth } from '@/constants/theme';

/**
 * Android orientation policy: the manifest allows every orientation (so
 * Android 16+ large screens and Samsung foldables get proper rotation and
 * app continuity instead of letterboxing), and this hook restores the
 * phone-shaped behavior at runtime — portrait-locked on any display whose
 * smallest side is under the wide breakpoint (phones, foldable cover
 * screens), free rotation on larger displays (tablets, unfolded foldables).
 *
 * Keyed on window dimensions so fold/unfold — which swaps the active
 * display — re-evaluates the lock. iOS needs none of this: iPhone stays
 * portrait via UISupportedInterfaceOrientations and iPad rotates via its
 * ~ipad override in app.json.
 */
export function useOrientationPolicy() {
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // The physical display, not the (possibly split-screen) window: a small
    // window on a big screen must not portrait-lock the whole activity.
    const screen = Dimensions.get('screen');
    if (Math.min(screen.width, screen.height) >= WideWindowMinWidth) {
      void ScreenOrientation.unlockAsync();
    } else {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  }, [width, height]);
}
