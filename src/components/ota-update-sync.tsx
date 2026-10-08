import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { fetchPendingUpdate, shouldCheck, shouldReload, updatesActive } from '@/services/ota-update';

/** Keeps a running app current with EAS Update: a download on a return to
 * the foreground (hourly at most) and a restart into a downloaded update
 * when the traveller comes back after half a day away. The launch itself is
 * handled by the native side (checkAutomatically ON_LOAD). Renders nothing;
 * a no-op in development builds and on web. See services/ota-update. */
export function OtaUpdateSync() {
  // The native side may have downloaded one at launch too, so the hook's
  // flag, not only our own fetch, says whether a restart has anything to
  // show. A ref, so the AppState listener reads the current value.
  const { isUpdatePending } = Updates.useUpdates();
  const pending = useRef(isUpdatePending);
  useEffect(() => {
    pending.current = isUpdatePending;
  }, [isUpdatePending]);

  useEffect(() => {
    if (!updatesActive()) return;
    let lastCheckAt = Date.now();
    let backgroundedAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      const now = Date.now();
      if (state === 'background') {
        backgroundedAt ??= now;
        return;
      }
      // 'inactive' is iOS passing through (Control Centre, a call): not away.
      if (state !== 'active') return;
      if (shouldReload(pending.current, backgroundedAt, now)) {
        void Updates.reloadAsync();
        return;
      }
      backgroundedAt = null;
      if (shouldCheck(lastCheckAt, now)) {
        lastCheckAt = now;
        void fetchPendingUpdate();
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}
