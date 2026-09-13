import { registerDocuments, registerWalletText } from '@/services/document-imports';
import { consumeWalletShare } from '@/services/wallet-share-intake';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  addDocumentSharedListener,
  consumePendingDocument,
  type SharedDocument,
} from '../../modules/flyright-document-import';

/**
 * Opens the import screen for a document shared into the app on Android,
 * where a share is an intent rather than a URL (iOS shares are URLs and go
 * through src/app/+native-intent.ts instead). Collects the one a cold start
 * was launched with, then listens for shares while the app is running. Must
 * be mounted inside the router tree; renders nothing.
 */
export function DocumentShareRouter() {
  const router = useRouter();

  useEffect(() => {
    const open = (doc: SharedDocument) => {
      try { router.push({ pathname: '/import-document', params: { handle: doc.text != null ? registerWalletText(doc.text) : registerDocuments(doc.documents ?? [doc]) } }); }
      catch { router.push('/import-document'); }
    };
    const pending = consumePendingDocument();
    if (pending) open(pending);
    const subscription = addDocumentSharedListener(open);
    const collectWallet = () => {
      try {
        const handle = consumeWalletShare();
        if (handle) router.push({ pathname: '/import-document', params: { handle } });
      } catch { router.push('/import-document'); }
    };
    // iOS may decline the extension's foreground handoff. Its private copy
    // remains available when the traveller next opens FlyRight.
    // Let the incoming deep link consume first when iOS opened the app.
    let timer = setTimeout(collectWallet, 500);
    const foreground = AppState.addEventListener('change', state => {
      clearTimeout(timer);
      if (state === 'active') timer = setTimeout(collectWallet, 500);
    });
    return () => { clearTimeout(timer); subscription.remove(); foreground.remove(); };
  }, [router]);

  return null;
}
