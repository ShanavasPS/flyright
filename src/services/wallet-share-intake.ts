import { Platform } from 'react-native';
import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing';
import { combineDocuments, registerDocument, registerWalletText } from '@/services/document-imports';

/** Read only the native extension's shared payload store; a URL can wake
 * this handler but cannot supply a file path or text for it to import. */
export function consumeWalletShare(): string | null {
  if (Platform.OS !== 'ios') return null;
  let payloads;
  try { payloads = getSharedPayloads(); } catch { return null; } // Older binaries.
  if (!payloads.length) return null;
  try {
    if (payloads.length > 8) throw new Error('Share up to eight passes at a time.');
    return combineDocuments(payloads.map(payload => {
      if (payload.shareType === 'text' || payload.shareType === 'url') return registerWalletText(payload.value);
      if (payload.shareType !== 'file' && payload.shareType !== 'image') throw new Error('Share a boarding pass, PDF or picture.');
      return registerDocument({ uri: payload.value, name: decodeURIComponent(payload.value.split('/').pop() ?? ''), mimeType: payload.mimeType });
    }));
  } finally { clearSharedPayloads(); }
}
