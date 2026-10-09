import { useSyncExternalStore } from 'react';

import type { PhotoUploadFailure } from '@/services/photo-files';

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
  /** Why each failed photo failed — what the strip tells the traveller. */
  reasons: ReadonlyMap<string, PhotoUploadFailure>;
  nonce: number;
}

let state: PhotoUploadState = { uploading: new Set(), failed: new Set(), reasons: new Map(), nonce: 0 };
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
export function markUploadDone(id: string, ok: boolean, reason: PhotoUploadFailure = 'offline') {
  const reasons = new Map(state.reasons);
  if (ok) reasons.delete(id);
  else reasons.set(id, reason);
  set({
    ...state,
    uploading: without(state.uploading, id),
    failed: ok ? without(state.failed, id) : new Set(state.failed).add(id),
    reasons,
  });
}

/** Clears the failures and asks the sync for another pass. */
export function retryUploads() {
  set({ ...state, failed: new Set(), reasons: new Map(), nonce: state.nonce + 1 });
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
/** Which failure the strip speaks of when photos failed for different
 * reasons: the one the traveller has to act on first. */
const REASON_ORDER: PhotoUploadFailure[] = ['storage', 'limit', 'missing', 'rejected', 'offline'];

export function uploadSummary(
  pending: readonly string[],
  { uploading, failed, reasons }: Pick<PhotoUploadState, 'uploading' | 'failed'> & Partial<Pick<PhotoUploadState, 'reasons'>>,
):
  | { kind: 'uploading'; current: number; total: number }
  | { kind: 'waiting'; count: number; reason: PhotoUploadFailure }
  | null {
  if (!pending.length) return null;
  const sending = pending.findIndex((id) => uploading.has(id));
  if (sending >= 0) {
    // "1 of 2": the ones before it in the strip are done or being retried
    // later; counting from the one on the wire reads as progress.
    const done = pending.filter((id, i) => i < sending && !failed.has(id)).length;
    return { kind: 'uploading', current: done + 1, total: pending.length };
  }
  const waiting = pending.filter((id) => failed.has(id));
  if (!waiting.length) return null;
  const seen = new Set(waiting.map((id) => reasons?.get(id) ?? 'offline'));
  const reason = REASON_ORDER.find((r) => seen.has(r)) ?? 'offline';
  return { kind: 'waiting', count: waiting.length, reason };
}
