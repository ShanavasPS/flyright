/** JS boundary for Quick Look on iOS. The native module exists only in iOS
 * binaries built after it was added; elsewhere (Android, web, an older dev
 * client) `requireOptionalNativeModule` yields null and `previewDocument`
 * resolves false, so the caller falls back to the share sheet. */

import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class FlyRightQuickLookModule extends NativeModule {
  preview(uri: string, title: string | null): Promise<boolean>;
}

const native = requireOptionalNativeModule<FlyRightQuickLookModule>('FlyRightQuickLook');

/** Shows a local file in Quick Look; resolves true once the viewer closes,
 * false when Quick Look is unavailable or cannot show this file. */
export async function previewDocument(uri: string, title: string | null): Promise<boolean> {
  if (!native) return false;
  return native.preview(uri, title);
}
