import * as Brightness from 'expo-brightness';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Full screen brightness while a barcode is up — what Wallet does for a
 * pass — and the traveller's own level back the moment it's down.
 *
 * iOS has one brightness, the system's, so the level read at mount is
 * restored on unmount and whenever the app leaves the foreground (a lock
 * or a switch mid-gate must not leave the phone stuck at full). Android
 * brightness set here is the app window's alone, and restoreSystemBrightness
 * hands the window back to the system. Web has no such thing; every call
 * is wrapped, since a missing permission or a simulator quirk isn't worth
 * failing the pass over.
 */
export function useMaxBrightness(active: boolean) {
  useFocusEffect(useCallback(() => {
    if (!active || Platform.OS === 'web') return;
    let previous: number | null = null;
    let foreground = AppState.currentState === 'active';
    let cancelled = false;
    let pending = Promise.resolve();

    // Serialize native calls: leaving while getBrightnessAsync is pending
    // must restore after the raise, never before it.
    const update = () => {
      pending = pending.then(async () => {
        if (!cancelled && foreground) {
          if (previous == null) previous = await Brightness.getBrightnessAsync();
          if (!cancelled && foreground) await Brightness.setBrightnessAsync(1);
        } else if (previous != null) {
          if (Platform.OS === 'android') await Brightness.restoreSystemBrightnessAsync();
          else await Brightness.setBrightnessAsync(previous);
          previous = null;
        }
      }).catch(() => { /* Brightness failure must never hide the code. */ });
    };

    update();
    const sub = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      update();
    });
    return () => {
      cancelled = true;
      sub.remove();
      update();
    };
  }, [active]));
}
