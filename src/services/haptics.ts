import * as Haptics from 'expo-haptics';

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
