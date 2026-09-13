import { createDetourNativeIntentHandler } from '@swmansion/react-native-detour/expo-router';

import { DETOUR_API_KEY, DETOUR_APP_ID } from '@/constants/config';
import { DETOUR_HOST, deferrablePath, detourDestination } from '@/services/deferred-links';
import { registerInboxDocument } from '@/services/document-imports';
import { consumeWalletShare } from '@/services/wallet-share-intake';

const handleDetourIntent = createDetourNativeIntentHandler({
  hosts: [DETOUR_HOST],
  fallbackPath: '/',
  config: DETOUR_API_KEY && DETOUR_APP_ID
    ? { apiKey: DETOUR_API_KEY, appID: DETOUR_APP_ID }
    : undefined,
  mapToRoute: ({ resolvedUrl }) => detourDestination(resolvedUrl) ?? '/',
});

/** Rewrites incoming system URLs before Expo Router matches them.
 *
 * Detour's handler resolves incoming links on both cold and warm launches.
 * The provider stays deferred-only so it does not navigate a second time.
 *
 * A PDF or a picture shared to the app on iOS ("Copy to FlyRight", enabled
 * by the CFBundleDocumentTypes entries in app.json) arrives as a file:// URL in the
 * app's Documents/Inbox. Left alone, the router would treat that path as a
 * route and 404; here it becomes the import screen with the file as a param.
 * Android shares travel a different road (ACTION_SEND, no URL) — see
 * modules/flyright-document-import — so this only ever fires on iOS. */
export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): Promise<string> {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\/expo-sharing(?:[/?#]|$)/i.test(path)) {
      const handle = consumeWalletShare();
      return handle ? `/import-document?handle=${handle}` : '/';
    }
    if (/^file:/i.test(path)) {
      return `/import-document?handle=${registerInboxDocument(path)}`;
    }
    const route = await handleDetourIntent({ path, initial });
    // The SDK can return a relative short-link destination without calling
    // mapToRoute. Validate that result too, while leaving other URLs alone.
    return route === path ? path : deferrablePath(route) ?? '/';
  } catch {
    return /^file:/i.test(path) || path.includes('://expo-sharing') ? '/import-document' : '/';
  }
}
