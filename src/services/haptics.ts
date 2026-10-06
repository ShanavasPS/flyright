import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { type HapticMoment, playMoment } from '../../modules/flyright-haptics';

/** The app's tactile grammar in one place — callers fire semantics ("a step
 * landed", "bad news arrived"), not raw impact styles. All fire-and-forget:
 * a failed haptic must never surface in the UI. */
export const tapLight = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export const tapMedium = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

export const noteSuccess = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

export const noteWarning = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
};

/** A choice moved: a chip picked, a wheel passing a row. iOS's selection
 * click; on Android the system's segment tick, which follows the "Touch
 * feedback" setting (expo-haptics' selectionAsync there is a raw buzz). */
export const tick = () => {
  const done =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
      : Haptics.selectionAsync();
  done.catch(() => {});
};

/** The travel day's big moments play authored patterns
 * (modules/flyright-haptics); a device or binary that can't falls back to
 * the nearest preset. */
const moment = (name: HapticMoment, fallback: () => void) => () => {
  playMoment(name)
    .then((played) => {
      if (!played) fallback();
    })
    .catch(fallback);
};

/** Boarding has started: two gate-reader beeps. */
export const noteBoarding = moment('boarding', tapMedium);

/** Wheels up: the roll building, cut dead, gear tucking away. */
export const noteTakeOff = moment('takeOff', () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
});

/** Wheels down: main gear, roll-out, nose gear. */
export const noteLanded = moment('landed', noteSuccess);

/** Money is owed: coins. */
export const noteOwed = moment('owed', noteSuccess);
