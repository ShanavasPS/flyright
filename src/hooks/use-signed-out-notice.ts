import { useSyncExternalStore } from 'react';

import {
  addSignedOutNoticeListener,
  signedOutNotice,
  type SignedOutNotice,
} from '@/services/signed-out-notice';

/** The pending "you were signed out" notice, live: null once dismissed or
 * the traveller signs back in. */
export function useSignedOutNotice(): SignedOutNotice | null {
  return useSyncExternalStore(addSignedOutNoticeListener, signedOutNotice, signedOutNotice);
}
