/** Kept booking documents: the local `trip_documents` table plus the file
 * each row points at. The import screen keeps the PDF or picture a trip was
 * read from (unless the traveller turns that off), one copy per trip in the
 * app's document directory; on another device a row arrives through sync
 * pointing at its Convex storage URL and is fetched the first time it is
 * opened, then kept there too — a booking is wanted at the airport, offline. */

import { and, asc, eq, isNull } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import { MAX_DOCUMENT_BYTES } from '../../convex/uploadShared';
import { db } from '@/db/client';
import { tripDocuments } from '@/db/schema';
import { useLiveRows } from '@/services/live-rows';
import { openLocalDocument } from '@/services/open-document';
import type { RemoteDocument, TripDocumentRow } from '@/services/trip-document-sync-plan';

export type { TripDocumentRow };

const documentDir = () => new Directory(Paths.document, 'trip-documents');

const EXTENSION: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

function newDocumentId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** What the bytes are, not what the file was called: a share names its file
 * anything, and the server takes only these three. */
export function sniffDocumentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && [37, 80, 68, 70, 45].every((b, i) => bytes[i] === b)) return 'application/pdf';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

/** iOS can move the app's data container during an update: keep the file
 * name, resolve our directory against this installation. */
export function resolveDocumentUri(uri: string): string {
  const name = uri.startsWith('file:///')
    ? /\/trip-documents\/([a-zA-Z0-9_-]+\.(?:pdf|jpg|png))$/.exec(uri)?.[1]
    : undefined;
  return name ? new File(Paths.document, 'trip-documents', name).uri : uri;
}

/** A trip's kept documents, oldest first. Live; undefined until the first read. */
export function useTripDocuments(journeyId: string): TripDocumentRow[] | undefined {
  const { data } = useLiveRows(
    db
      .select()
      .from(tripDocuments)
      .where(and(eq(tripDocuments.journeyId, journeyId), isNull(tripDocuments.deletedAt)))
      .orderBy(asc(tripDocuments.createdAt)),
    [journeyId],
  );
  return data?.map((row) => ({ ...row, uri: resolveDocumentUri(row.uri) }));
}

/** Keeps the document the trips were imported from: one copy per trip, so a
 * trip's document goes with that trip alone. A trip that already holds this
 * document (same name and size — the same file imported again) is skipped.
 * Resolves to how many were kept; 0 for a file the server would not take. */
export async function keepDocument(
  journeyIds: string[],
  userId: string | null | undefined,
  source: { uri: string; name: string },
): Promise<number> {
  const file = new File(source.uri);
  if (!file.exists || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) return 0;
  const mimeType = sniffDocumentType(await file.bytes());
  if (!mimeType) return 0;
  const name = (source.name || `Booking.${EXTENSION[mimeType]}`).slice(0, 200);
  const dir = documentDir();
  if (!dir.exists) dir.create({ intermediates: true });
  let kept = 0;
  for (const journeyId of new Set(journeyIds)) {
    const [already] = await db
      .select()
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.journeyId, journeyId),
          eq(tripDocuments.name, name),
          eq(tripDocuments.size, file.size),
          isNull(tripDocuments.deletedAt),
        ),
      );
    if (already) continue;
    const id = newDocumentId();
    const target = new File(dir, `${id}.${EXTENSION[mimeType]}`);
    file.copySync(target);
    const now = new Date().toISOString();
    await db.insert(tripDocuments).values({
      id,
      journeyId,
      userId: userId ?? null,
      uri: target.uri,
      name,
      mimeType,
      size: file.size,
      storageId: null,
      createdAt: now,
      updatedAt: now,
    });
    kept += 1;
  }
  return kept;
}

/** Opens the document in the system viewer (the share sheet's preview on
 * iOS, the PDF or image viewer on Android — services/open-document). One that arrived through sync is fetched first
 * and kept on this phone, so the next time needs no connection. */
export async function openTripDocument(row: TripDocumentRow): Promise<void> {
  let uri = resolveDocumentUri(row.uri);
  if (!uri.startsWith('file://') || !new File(uri).exists) {
    if (!/^https:\/\//.test(row.uri)) throw new Error('This document is not on this phone yet.');
    const dir = documentDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const target = new File(dir, `${row.id}.${EXTENSION[row.mimeType] ?? 'pdf'}`);
    if (target.exists) target.delete();
    const downloaded = await File.downloadFileAsync(row.uri, target);
    uri = downloaded.uri;
    // Not a change to sync: the row's stamps stay as they are.
    await db.update(tripDocuments).set({ uri }).where(eq(tripDocuments.id, row.id));
  }
  // The viewer titles the file by its name on disk, which is our row id; hand
  // it a copy under the name it was shared with.
  const shareDir = new Directory(Paths.cache, 'trip-document-share');
  if (shareDir.exists) shareDir.delete();
  shareDir.create({ intermediates: true });
  const named = new File(shareDir, shareName(row));
  new File(uri).copySync(named);
  await openLocalDocument(named.uri, row.mimeType, row.name);
}

/** The shared name as a safe file name, with the extension its bytes carry. */
export function shareName(row: Pick<TripDocumentRow, 'name' | 'mimeType'>): string {
  const extension = EXTENSION[row.mimeType] ?? 'pdf';
  const stem = row.name
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${stem || 'Booking document'}.${extension}`;
}

/** Soft delete: the tombstone lets the sync free the stored file; the local
 * copy goes now. */
export async function deleteTripDocument(id: string): Promise<void> {
  const [row] = await db.select().from(tripDocuments).where(eq(tripDocuments.id, id));
  const now = new Date().toISOString();
  await db.update(tripDocuments).set({ deletedAt: now, updatedAt: now }).where(eq(tripDocuments.id, id));
  removeLocalFile(row?.uri);
}

/** A removed trip takes its documents with it. */
export async function deleteDocumentsOf(journeyId: string): Promise<void> {
  const rows = await db
    .select()
    .from(tripDocuments)
    .where(and(eq(tripDocuments.journeyId, journeyId), isNull(tripDocuments.deletedAt)));
  for (const row of rows) await deleteTripDocument(row.id);
}

function removeLocalFile(uri: string | undefined) {
  if (!uri?.startsWith('file://')) return;
  try {
    const file = new File(resolveDocumentUri(uri));
    if (file.exists) file.delete();
  } catch {
    // Best effort — a stranded file is harmless.
  }
}

// ---------------------------------------------------------------------------
// Sync plumbing (see components/trip-document-sync.tsx).

export {
  planDocumentSync,
  toRemoteDocument,
  type DocumentSyncPlan,
  type RemoteDocument,
} from '@/services/trip-document-sync-plan';

/** POSTs the file's bytes to a Convex upload URL and returns the storageId.
 * Bytes read first, as photo-files.ts explains: iOS's background uploader
 * crashes the process on an unreadable file. */
export async function uploadTripDocument(row: TripDocumentRow, uploadUrl: string): Promise<string> {
  const uri = resolveDocumentUri(row.uri);
  if (!uri.startsWith('file:///')) throw new Error('Document is not stored on this device.');
  const file = new File(uri);
  if (!file.exists || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) throw new Error('Document file is unavailable.');
  const bytes = await file.bytes();
  const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': row.mimeType }, body: bytes });
  if (!response.ok) throw new Error(`Document upload failed (${response.status})`);
  const result = (await response.json()) as { storageId?: unknown };
  if (typeof result.storageId !== 'string' || !result.storageId) throw new Error('Document upload did not return a storage ID.');
  return result.storageId;
}

/** Records the upload without touching updatedAt beyond the planned stamp,
 * so the push carries it and the tie afterwards reads as "in sync". */
export async function markDocumentUploaded(id: string, storageId: string, updatedAt: string): Promise<void> {
  await db.update(tripDocuments).set({ storageId, updatedAt }).where(eq(tripDocuments.id, id));
}

/** Forget the stored file of documents the server would not accept, so the
 * sync uploads them again. */
export async function clearDocumentUploads(ids: string[]): Promise<void> {
  for (const id of ids) await db.update(tripDocuments).set({ storageId: null }).where(eq(tripDocuments.id, id));
}

export async function markDocumentsSynced(rows: { id: string; updatedAt: string }[]): Promise<void> {
  for (const { id, updatedAt } of rows) {
    await db
      .update(tripDocuments)
      .set({ syncedAt: updatedAt })
      .where(and(eq(tripDocuments.id, id), eq(tripDocuments.updatedAt, updatedAt)));
  }
}

/** Writes a remote winner locally. A document this device already holds
 * keeps its file:// uri; one it has never seen points at the storage URL
 * until it is first opened. */
export async function applyRemoteDocument(remote: RemoteDocument, userId: string): Promise<void> {
  const [existing] = await db.select().from(tripDocuments).where(eq(tripDocuments.id, remote.documentId));
  if (remote.deletedAt) {
    if (!existing) return;
    await db
      .update(tripDocuments)
      .set({ deletedAt: remote.deletedAt, updatedAt: remote.updatedAt, syncedAt: remote.updatedAt })
      .where(eq(tripDocuments.id, remote.documentId));
    removeLocalFile(existing.uri);
    return;
  }
  const localUri = existing?.uri.startsWith('file://') ? resolveDocumentUri(existing.uri) : null;
  const uri = localUri && new File(localUri).exists ? localUri : remote.url;
  if (!uri) return; // the server has no file for it yet
  const columns = {
    journeyId: remote.journeyKey,
    userId,
    uri,
    name: remote.name,
    mimeType: remote.mimeType,
    size: remote.size,
    storageId: remote.storageId,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    deletedAt: null,
    syncedAt: remote.updatedAt,
  };
  await db
    .insert(tripDocuments)
    .values({ id: remote.documentId, ...columns })
    .onConflictDoUpdate({ target: tripDocuments.id, set: columns });
}
