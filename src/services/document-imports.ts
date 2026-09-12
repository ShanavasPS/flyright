/** Only trusted picker/share callbacks can register a document. A URL contains
 * an opaque handle, never a filesystem path the screen can read or delete. */
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { documentKind, readDocument, type PdfContents } from '../../modules/flyright-document-import';

const MAX_BYTES = 20 * 1024 * 1024;
const entries = new Map<string, { uri: string; name: string; mimeType: string; expires: number; reading?: Promise<PdfContents> }>();

export function inboxFile(uri: string, documentsUri: string): boolean {
  try {
    const parsed = new URL(uri);
    const root = new URL(documentsUri).pathname.replace(/\/$/, '') + '/Inbox/';
    // Reject encoded separators, ambiguous encodings, traversal and alternate authorities.
    if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash || /%(?:2f|5c|25|00)|\\/i.test(uri)) return false;
    const path = decodeURIComponent(parsed.pathname);
    return path.startsWith(decodeURIComponent(root)) && !path.slice(decodeURIComponent(root).length).includes('/') && !['', '.', '..'].includes(path.slice(decodeURIComponent(root).length));
  } catch { return false; }
}

export function registerDocument(doc: { uri: string; name?: string | null; mimeType?: string | null }): string {
  const source = new File(doc.uri);
  if (!source.exists || source.size <= 0 || source.size > MAX_BYTES) throw new Error('Choose a document under 20 MB.');
  const dir = new Directory(Paths.cache, 'document-imports');
  dir.create({ idempotent: true, intermediates: true });
  // Remove stale copies left by interrupted imports. Only our dedicated folder.
  for (const item of dir.list()) if (item instanceof File && item.modificationTime && item.modificationTime < Date.now() - 3600_000) item.delete();
  for (const [key, entry] of entries) {
    if (entry.expires < Date.now() || entries.size >= 20) {
      if (!entry.reading) { try { new File(entry.uri).delete(); } catch {} }
      entries.delete(key);
    }
  }
  const handle = randomUUID();
  const copy = new File(dir, handle);
  source.copy(copy);
  entries.set(handle, { uri: copy.uri, name: doc.name?.slice(0, 200) ?? '', mimeType: doc.mimeType ?? '', expires: Date.now() + 3600_000 });
  return handle;
}

export function registerInboxDocument(uri: string): string {
  if (!inboxFile(uri, Paths.document.uri)) throw new Error('Share this document from Files.');
  const handle = registerDocument({ uri, name: decodeURIComponent(uri.split('/').pop() ?? '') });
  // This exact Inbox copy is supplied by iOS; never delete arbitrary URL paths.
  new File(uri).delete();
  return handle;
}

export function importDocument(handle: string | undefined) {
  if (!handle) return null;
  const entry = entries.get(handle);
  if (!entry || entry.expires < Date.now()) return null;
  const kind = documentKind(entry.name || entry.uri, entry.mimeType || null);
  return {
    name: entry.name, kind,
    read(): Promise<PdfContents> {
      // StrictMode/remounts share one read and cleanup, never race file deletion.
      entry.reading ??= readDocument(entry.uri, kind).catch(reason =>
        readDocument(entry.uri, kind === 'image' ? 'pdf' : 'image').catch(() => { throw reason; }),
      ).finally(() => { try { new File(entry.uri).delete(); } catch {} });
      return entry.reading;
    },
  };
}
