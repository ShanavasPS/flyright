import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
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
import { useUpdateUnseen } from '@/services/update-seen';

/**
 * Everything waiting for the traveller, counted once and shared: the badge
 * on the People tab, the count on the app icon, and whatever else wants to
 * know. Three sources — support replies not yet opened, People-tab arrivals
 * not yet looked at (both from the server, see convex/attention.ts), and a
 * store update Settings hasn't shown yet (local). Each clears itself the
 * way an inbox does: by opening the thread, looking at that side of the
 * People tab, opening Settings.
 *
 * The app icon is written from here on every change and every foreground,
 * so a count a push set while the app was closed (the server sends the same
 * total) is corrected the moment the app is back, and a count that no
 * longer applies — the thread was read on another device — clears.
 */
export type Attention = {
  /** Threads with a support reply not yet opened. */
  support: number;
  /** Arrivals on the People tab not yet looked at, both sides together. */
  people: number;
  /** A store update Settings hasn't been opened with yet: 0 or 1. */
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
  const [remote, setRemote] = useState<{ support: number; people: number }>(NONE);
  const { update } = useAppVersion();
  const updateUnseen = useUpdateUnseen(update?.latest);

  const value = useMemo<Attention>(() => {
    const u = updateUnseen ? 1 : 0;
    return { ...remote, update: u, total: remote.support + remote.people + u };
  }, [remote, updateUnseen]);

  // The icon follows the total, and is re-asserted on every foreground:
  // a push may have set it while the app was closed, and a stale count is
  // the one thing an icon badge must never show.
  useEffect(() => {
    void setAppBadge(value.total);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void setAppBadge(value.total);
    });
    return () => sub.remove();
  }, [value.total]);

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
  onChange: (counts: { support: number; people: number }) => void;
}) {
  const { isSignedIn } = useAuth();
  const mine = useQuery(api.attention.mine, isSignedIn ? {} : 'skip');
  const support = mine?.support ?? 0;
  const people = (mine?.followers ?? 0) + (mine?.following ?? 0);
  useEffect(() => {
    onChange({ support, people });
  }, [support, people, onChange]);
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
