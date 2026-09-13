import { useQueryClient } from '@tanstack/react-query';
import { useConvexAuth, useQuery } from 'convex/react';
import {
  Component,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { api } from '../../convex/_generated/api';

import { useAppVersion } from '@/hooks/use-app-version';
import { setAppBadge } from '@/services/app-badge';
import { addPushReceivedListener, addPushStateListener } from '@/services/notifications';

/**
 * Everything waiting for the traveller, counted once and shared: the badge
 * on the People tab, the indicator on the app icon, and whatever else wants to
 * know. Three sources — support replies not yet opened, People-tab arrivals
 * not yet looked at (both from the server, see convex/attention.ts), and
 * an available store update (local). Inbox activity clears when viewed;
 * an update clears when installed. The home-screen icon shows 1 for any
 * attention, matching what a release push can reliably set while closed.
 *
 * The app icon is written from here on every change and every foreground,
 * so a badge a push set while the app was closed is reconciled when the
 * sources have loaded. Activity read on another device clears too.
 */
export type Attention = {
  /** Threads with a support reply not yet opened. */
  support: number;
  /** Arrivals on the People tab not yet looked at, both sides together. */
  people: number;
  /** A store update not yet installed: 0 or 1. */
  update: number;
  total: number;
};

const NONE: Attention = { support: 0, people: 0, update: 0, total: 0 };

const AttentionContext = createContext<Attention>(NONE);

export const useAttention = () => useContext(AttentionContext);

/** Mount once, under the Convex + Clerk providers and the react-query
 * client (useAppVersion). `cloud` false (no Convex URL configured) keeps the
 * local source only. */
export function AttentionProvider({ cloud, children }: { cloud: boolean; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [remote, setRemote] = useState<{ support: number; people: number } | null>(cloud ? null : NONE);
  const { update, ready: updateReady } = useAppVersion();
  const updateAvailable = !!update;

  const value = useMemo<Attention>(() => {
    const u = updateAvailable ? 1 : 0;
    const counts = remote ?? NONE;
    return { ...counts, update: u, total: counts.support + counts.people + u };
  }, [remote, updateAvailable]);

  // Loading and offline are not zero unread. In particular, don't erase a
  // badge delivered by APNs before auth and the release lookup finish.
  useEffect(() => {
    const refresh = () => {
      void setAppBadge({
        support: remote?.support ?? null,
        people: remote?.people ?? null,
        update: updateReady ? value.update : null,
      });
    };
    refresh();
    const unsubscribe = addPushStateListener(refresh);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') refresh();
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: ['app-version'] });
    });
    return () => { sub.remove(); unsubscribe(); };
  }, [value.update, remote, updateReady, queryClient]);

  useEffect(() => addPushReceivedListener(() => {
    void queryClient.invalidateQueries({ queryKey: ['app-version'] });
  }), [queryClient]);

  return (
    <AttentionContext.Provider value={value}>
      {cloud && (
        <QuietBoundary>
          <RemoteCounts onChange={setRemote} />
        </QuietBoundary>
      )}
      {children}
    </AttentionContext.Provider>
  );
}

/** The server's half, as a leaf so a failed query is contained here: a
 * Convex query error throws during render, and this must never take the
 * app down with it. Reports through state rather than rendering anything. */
function RemoteCounts({
  onChange,
}: {
  onChange: (counts: { support: number; people: number } | null) => void;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const mine = useQuery(api.attention.mine, isAuthenticated ? {} : 'skip');
  const ready = !isLoading && (!isAuthenticated || mine !== undefined);
  const support = mine?.support ?? 0;
  const people = (mine?.followers ?? 0) + (mine?.following ?? 0);
  useEffect(() => {
    onChange(ready ? { support, people } : null);
  }, [support, people, ready, onChange]);
  return null;
}

class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
