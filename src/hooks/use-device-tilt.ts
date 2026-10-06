/** The phone's tilt as a small globe turn (services/tilt), for the globe to
 * add to its camera. Listens to DeviceMotion only while `enabled` — the
 * caller passes "on screen in a foregrounded app" — and never with Reduce
 * Motion on; otherwise the turn eases back to nothing and the sensor is off.
 *
 * DeviceMotion's attitude needs no permission prompt (only the motion-
 * activity APIs do, which the app doesn't use — app.json turns the iOS
 * motion usage string off). expo-sensors loads on first use (lazyImports), so
 * a dev client built before it was linked keeps working, just without the
 * sway. */

import { requireOptionalNativeModule } from 'expo';
import { DeviceMotion } from 'expo-sensors';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useReducedMotion, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { NO_REST, tiltStep, type TiltRest } from '@/services/tilt';

const SAMPLE_MS = 33;
const SPRING = { damping: 18, stiffness: 140, mass: 1 };

export function useDeviceTilt(enabled: boolean): { lambda: SharedValue<number>; phi: SharedValue<number> } {
  const lambda = useSharedValue(0);
  const phi = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const on = enabled && !reduceMotion && Platform.OS !== 'web';

  useEffect(() => {
    if (!on || !requireOptionalNativeModule('ExponentDeviceMotion')) {
      lambda.value = withSpring(0, SPRING);
      phi.value = withSpring(0, SPRING);
      return;
    }
    let rest: TiltRest = NO_REST;
    let subscription: { remove(): void } | null = null;
    let cancelled = false;
    void DeviceMotion.isAvailableAsync().then((available) => {
      if (!available || cancelled) return;
      DeviceMotion.setUpdateInterval(SAMPLE_MS);
      subscription = DeviceMotion.addListener((m) => {
        if (!m.rotation) return;
        const step = tiltStep(rest, { beta: m.rotation.beta, gamma: m.rotation.gamma, orientation: m.orientation });
        rest = step.rest;
        lambda.value = withSpring(step.lambda, SPRING);
        phi.value = withSpring(step.phi, SPRING);
      });
    });
    return () => {
      cancelled = true;
      subscription?.remove();
      lambda.value = withSpring(0, SPRING);
      phi.value = withSpring(0, SPRING);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable
  }, [on]);

  return { lambda, phi };
}
