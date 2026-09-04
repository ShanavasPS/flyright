/** Rewrites incoming system URLs before Expo Router matches them.
 *
 * A PDF shared to the app on iOS ("Copy to FlyRight", enabled by the
 * CFBundleDocumentTypes entry in app.json) arrives as a file:// URL in the
 * app's Documents/Inbox. Left alone, the router would treat that path as a
 * route and 404; here it becomes the import screen with the file as a param.
 * Android shares travel a different road (ACTION_SEND, no URL) — see
 * modules/flyright-document-import — so this only ever fires on iOS. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^file:/i.test(path)) {
      return `/import-document?uri=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    return path;
  }
}
