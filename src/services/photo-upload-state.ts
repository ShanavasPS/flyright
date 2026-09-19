import { useSyncExternalStore } from 'react';

/**
 * Where each trip photo's upload stands, for the screens to show: the photo
 * PhotoSync is sending right now, the ones whose last attempt failed (no
 * connection, most often), and a nonce a Retry bumps to run the sync again.
 * The rows themselves only say "not uploaded yet" (storageId null); this is
 * the part only the running sync knows. Memory only — a relaunch starts
 * clean and the sync simply tries again.
 */
export interface PhotoUploadState {
  uploading: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  nonce: number;
}

let state: PhotoUploadState = { uploading: new Set(), failed: new Set(), nonce: 0 };
const listeners = new Set<() => void>();

function set(next: PhotoUploadState) {
  state = next;
  for (const listener of listeners) listener();
}

const without = (from: ReadonlySet<string>, id: string) => {
  const next = new Set(from);
  next.delete(id);
  return next;
};

/** The sync has started sending this photo; a failure before it is over. */
export function markUploading(id: string) {
  set({ ...state, uploading: new Set(state.uploading).add(id), failed: without(state.failed, id) });
}

/** Sent, or not: either way it is no longer uploading. */
export function markUploadDone(id: string, ok: boolean) {
  set({
    ...state,
    uploading: without(state.uploading, id),
    failed: ok ? without(state.failed, id) : new Set(state.failed).add(id),
  });
}

/** Clears the failures and asks the sync for another pass. */
export function retryUploads() {
  set({ ...state, failed: new Set(), nonce: state.nonce + 1 });
}

export function getPhotoUploadState(): PhotoUploadState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePhotoUploadState(): PhotoUploadState {
  return useSyncExternalStore(subscribe, getPhotoUploadState, getPhotoUploadState);
}

/** What the strip says under the photos still to reach the server, given
 * which of them are sending and which failed. Null when there is nothing to
 * say: every photo is up, or nothing has been tried yet. */
export function uploadSummary(
  pending: readonly string[],
  { uploading, failed }: Pick<PhotoUploadState, 'uploading' | 'failed'>,
): { kind: 'uploading'; current: number; total: number } | { kind: 'waiting'; count: number } | null {
  if (!pending.length) return null;
  const sending = pending.findIndex((id) => uploading.has(id));
  if (sending >= 0) {
    // "1 of 2": the ones before it in the strip are done or being retried
    // later; counting from the one on the wire reads as progress.
    const done = pending.filter((id, i) => i < sending && !failed.has(id)).length;
    return { kind: 'uploading', current: done + 1, total: pending.length };
  }
  const waiting = pending.filter((id) => failed.has(id)).length;
  return waiting ? { kind: 'waiting', count: waiting } : null;
}
