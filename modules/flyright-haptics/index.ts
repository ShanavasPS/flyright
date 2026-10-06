/** JS boundary for the travel day's authored haptics. The native module
 * exists only in iOS and Android binaries built after it was added; on the
 * web or an older dev client `requireOptionalNativeModule` yields null and
 * `playMoment` resolves false, so the caller plays its preset instead.
 *
 * The moment names are the contract with FlyRightHapticsModule.swift and
 * FlyRightHapticsModule.kt — change them together. */

import { NativeModule, requireOptionalNativeModule } from 'expo';

export type HapticMoment = 'boarding' | 'takeOff' | 'landed' | 'owed';

declare class FlyRightHapticsModule extends NativeModule {
  play(moment: HapticMoment): Promise<boolean>;
}

const native = requireOptionalNativeModule<FlyRightHapticsModule>('FlyRightHaptics');

/** Plays a moment's pattern; false when this device can't (no Taptic Engine,
 * Android before 12, a missing primitive) or the module isn't in the binary. */
export async function playMoment(moment: HapticMoment): Promise<boolean> {
  if (!native) return false;
  return native.play(moment);
}
