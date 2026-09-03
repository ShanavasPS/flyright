import { DetourProvider, useDetourContext } from '@swmansion/react-native-detour';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { DETOUR_API_KEY, DETOUR_APP_ID } from '@/constants/config';
import { trackEvent } from '@/services/analytics';
import { deferrablePath } from '@/services/deferred-links';

/**
 * Deferred deep links: someone taps a share link, has no app, installs it from
 * the store button on the web landing, and on first launch lands on the same
 * invite (or live trip) instead of a blank journal. Detour records the click
 * on its redirect (install referrer on Android, a device fingerprint on iOS —
 * clipboard deliberately off, it would raise the paste banner) and the SDK
 * asks once, on the first-ever launch, whether a recent click matches.
 *
 * Deferred links only: Universal/App Links on getflyright.com are Expo
 * Router's, and its own retention analytics stay off — Layers has that.
 * Without credentials (or on web, where there's nothing to defer to) the
 * children render untouched.
 */
export function DeferredLinks({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web' || !DETOUR_API_KEY || !DETOUR_APP_ID) return <>{children}</>;
  return (
    <DetourProvider
      config={{
        apiKey: DETOUR_API_KEY,
        appID: DETOUR_APP_ID,
        linkProcessingMode: 'deferred-only',
        shouldUseClipboard: false,
        shouldTrackAutomaticEvents: false,
      }}>
      <DeferredLinkRouter />
      {children}
    </DetourProvider>
  );
}

/** Pushes the matched link's screen once. Waits out the first-run intro if
 * it's up — a push over the fullScreenModal would bury the invite under it;
 * pushed earlier, the intro simply stacks on top and dismisses back to the
 * invite. Must be mounted inside the router tree; renders nothing. */
function DeferredLinkRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLinkProcessed, link, clearLink } = useDetourContext();

  useEffect(() => {
    if (!isLinkProcessed || !link) return;
    const path = deferrablePath(link.route);
    if (!path) {
      clearLink();
      return;
    }
    if (pathname === '/onboarding') return;
    clearLink();
    trackEvent('deferred_link_opened', { kind: path.startsWith('/i/') ? 'invite' : 'trip' });
    router.push(path as Href);
  }, [isLinkProcessed, link, pathname, clearLink, router]);

  return null;
}
