import * as Sharing from 'expo-sharing';

import { previewDocument } from '../../modules/flyright-quick-look';

const UTI: Record<string, string> = { 'application/pdf': 'com.adobe.pdf', 'image/jpeg': 'public.jpeg', 'image/png': 'public.png' };

/** Shows a local file the way the platform shows documents: Quick Look on
 * iOS, with its own Share button (services/open-document.android.ts opens
 * the phone's viewer). The share sheet alone — what 1.1.6 opened — offers
 * AirDrop, Mail and Print on a real iPhone but no way to read the booking;
 * it stays the fallback for a binary without the Quick Look module. */
export async function openLocalDocument(uri: string, mimeType: string, title: string): Promise<void> {
  if (await previewDocument(uri, title)) return;
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone cannot open documents.');
  await Sharing.shareAsync(uri, { mimeType, UTI: UTI[mimeType], dialogTitle: title });
}
