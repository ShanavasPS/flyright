import { useRouter } from 'expo-router';
import { useEffect } from 'react';

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
    const open = (doc: SharedDocument) =>
      router.push({ pathname: '/import-document', params: { uri: doc.uri, name: doc.name ?? '' } });
    const pending = consumePendingDocument();
    if (pending) open(pending);
    const subscription = addDocumentSharedListener(open);
    return () => subscription.remove();
  }, [router]);

  return null;
}
