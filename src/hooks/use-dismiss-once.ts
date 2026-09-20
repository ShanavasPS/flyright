import { useNavigation, useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Dismiss handler for Clerk's native views (AuthView / UserProfileView).
 * Their onDismiss also fires while the screen is already being popped (header
 * back, swipe-down) — popping again would bubble past this screen's stack and
 * switch tabs. Losing focus flips the guard the moment any pop starts, and the
 * handler itself is single-fire. (SDK 58 removed `beforeRemove`; its successor
 * `removed` fires after the component has unmounted, too late to guard
 * anything, so this listens for the blur that begins the pop instead.)
 *
 * Dismissal targets a path instead of router.back(): NativeTabs never commits
 * finger-tap tab switches to the router state, so a plain JS back() repaints
 * the tabs from stale state and snaps to the first tab. dismissTo(target)
 * writes the correct tab back into the state instead of exposing the desync.
 */
export function useDismissOnce(target: Href) {
  const router = useRouter();
  const navigation = useNavigation();
  const dismissed = useRef(false);

  useEffect(
    () =>
      navigation.addListener('blur', () => {
        dismissed.current = true;
      }),
    [navigation],
  );

  return () => {
    if (dismissed.current || !navigation.isFocused()) return;
    dismissed.current = true;
    router.dismissTo(target);
  };
}
