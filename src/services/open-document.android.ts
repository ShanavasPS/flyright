import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';

/** Intent.FLAG_GRANT_READ_URI_PERMISSION: the viewer may read this one file. */
const GRANT_READ = 1;

/** Opens a local file in the phone's viewer for its type (a PDF reader, the
 * gallery). Android's share sheet only offers to send the file elsewhere —
 * Quick Share, Print, Drive — which is not what "open my booking" means. A
 * phone with no app for the type falls back to that sheet. */
export async function openLocalDocument(uri: string, mimeType: string, title: string): Promise<void> {
  const contentUri = await getContentUriAsync(uri);
  try {
    await startActivityAsync('android.intent.action.VIEW', { data: contentUri, type: mimeType, flags: GRANT_READ });
  } catch {
    if (!(await Sharing.isAvailableAsync())) throw new Error('This phone cannot open documents.');
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
  }
}
