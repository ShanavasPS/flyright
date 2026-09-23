import { create } from 'zustand';

/** Verified account entitlement for platforms without native billing. Never
 * persisted or accepted from a link; auth changes clear it immediately. */
const useStore = create<{ userId: string | null; until: number; ready: boolean }>(() => ({ userId: null, until: 0, ready: false }));
export function bindProAccount(userId: string | null) {
  if (useStore.getState().userId !== userId) useStore.setState({ userId, until: 0, ready: false });
}
export function receiveServerPro(userId: string, until: string | null) {
  if (useStore.getState().userId !== userId) return;
  useStore.setState({ until: until ? Date.parse(until) || 0 : 0, ready: true });
}
export const serverProUntil = () => useStore.getState().until;
export const useServerPro = () => useStore(s => s.until > Date.now());
export const useServerProReady = () => useStore(s => s.ready);

let expiryTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe(({ until }) => {
  if (expiryTimer) clearTimeout(expiryTimer);
  const remaining = until - Date.now();
  if (remaining > 0) expiryTimer = setTimeout(() => useStore.setState({ until }), Math.min(remaining + 1, 2_147_000_000));
});
