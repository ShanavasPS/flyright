import * as Sharing from 'expo-sharing';

const UTI: Record<string, string> = { 'application/pdf': 'com.adobe.pdf', 'image/jpeg': 'public.jpeg', 'image/png': 'public.png' };

/** Shows a local file the way the platform shows documents. On iOS the
 * share sheet is that: it previews the file and offers Markup, Print and
 * Files (services/open-document.android.ts opens a viewer instead). */
export async function openLocalDocument(uri: string, mimeType: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone cannot open documents.');
  await Sharing.shareAsync(uri, { mimeType, UTI: UTI[mimeType], dialogTitle: title });
}
