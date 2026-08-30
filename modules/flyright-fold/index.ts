/** JS boundary for the Android foldable-posture bridge. The native module
 * exists only in Android binaries; everywhere else `requireOptionalNativeModule`
 * yields null and the hook settles on `posture: 'none'`, so callers don't need
 * platform guards.
 *
 * The field names are the contract with FlyRightFoldModule.kt — change them
 * together. Native reports hinge bounds in px; this file converts to dp so
 * consumers can compare against layout coordinates directly. */

import { NativeModule, requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';

interface HingeBoundsPx {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface NativeFoldState {
  posture: 'none' | 'flat' | 'halfOpened';
  orientation: 'horizontal' | 'vertical' | null;
  isSeparating: boolean;
  hingeBounds: HingeBoundsPx | null;
}

export interface FoldState {
  posture: 'none' | 'flat' | 'halfOpened';
  /** Hinge axis: 'horizontal' folds top/bottom (tabletop when halfOpened),
   * 'vertical' folds left/right (book). */
  orientation: 'horizontal' | 'vertical' | null;
  /** Whether the hinge visually separates the two halves (always true when
   * halfOpened; true when flat only on dual-screen devices). */
  isSeparating: boolean;
  /** Hinge bounds in dp, in the app window's coordinate space. */
  hingeBounds: HingeBoundsPx | null;
}

const NO_FOLD: FoldState = {
  posture: 'none',
  orientation: null,
  isSeparating: false,
  hingeBounds: null,
};

declare class FoldNativeModule extends NativeModule<{
  onFoldChange(state: NativeFoldState): void;
}> {
  getState(): NativeFoldState;
}

const native = requireOptionalNativeModule<FoldNativeModule>('FlyRightFold');

function toDp(state: NativeFoldState): FoldState {
  if (!state.hingeBounds) return { ...state, hingeBounds: null };
  const scale = PixelRatio.get();
  const { left, top, right, bottom } = state.hingeBounds;
  return {
    ...state,
    hingeBounds: {
      left: left / scale,
      top: top / scale,
      right: right / scale,
      bottom: bottom / scale,
    },
  };
}

/** Live fold posture — 'none' everywhere except a foldable Android device.
 * Tabletop mode (the Samsung Flex-mode layout trigger) is
 * `posture === 'halfOpened' && orientation === 'horizontal'`. */
export function useFoldState(): FoldState {
  const [state, setState] = useState<FoldState>(() =>
    native ? toDp(native.getState()) : NO_FOLD,
  );
  useEffect(() => {
    if (!native) return;
    const sub = native.addListener('onFoldChange', (s) => setState(toDp(s)));
    return () => sub.remove();
  }, []);
  return state;
}

/** Convenience: true in Samsung Flex mode / tabletop posture. */
export function useIsTabletop(): boolean {
  const { posture, orientation } = useFoldState();
  return posture === 'halfOpened' && orientation === 'horizontal';
}
