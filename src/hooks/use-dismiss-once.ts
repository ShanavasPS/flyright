import { useNavigation, useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Dismiss handler for Clerk's native views (AuthView / UserProfileView).
 * Their onDismiss also fires while the screen is already being popped (header
 * back, swipe-down) — popping again would bubble past this screen's stack and
 * switch tabs. beforeRemove flips the guard the moment any pop starts, and the
 * handler itself is single-fire.
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
      navigation.addListener('beforeRemove', () => {
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
