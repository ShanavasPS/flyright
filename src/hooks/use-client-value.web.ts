import { useSyncExternalStore } from 'react';

/** A value only the browser knows — the viewport width, the locale, the
 * user agent — read the hydration-safe way: the server snapshot is what
 * static rendering assumed, the client re-renders with the real value right
 * after hydrating, and the two never disagree inside one paint (which is
 * what React's hydration error #418 was about). */

const resizeListeners = new Set<() => void>();
let listening = false;
function subscribeResize(listener: () => void) {
  resizeListeners.add(listener);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('resize', () => {
      for (const l of resizeListeners) l();
    });
  }
  return () => {
    resizeListeners.delete(listener);
  };
}

/** True below `px` wide. The server draws the compact (stacked) layout:
 * it is the one that never overflows if it stays. */
export function useBelowWidth(px: number): boolean {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth < px,
    () => true,
  );
}

const noop = () => () => {};

/** The browser's locale, or undefined on the server and during hydration. */
export function useClientLocale(): string | undefined {
  return useSyncExternalStore(noop, () => navigator.language, () => undefined);
}

/** The browser's user agent, or '' on the server and during hydration. */
export function useClientUserAgent(): string {
  return useSyncExternalStore(noop, () => navigator.userAgent, () => '');
}
