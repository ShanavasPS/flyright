/** JS boundary for reading shared travel documents — the native half of
 * "share a PDF to FlyRight". Two jobs:
 *
 *  1. Intake. Android delivers a shared file as an ACTION_SEND intent with no
 *     URL, which React Native's Linking never surfaces, so the Kotlin module
 *     copies the stream into the cache and hands the path over here — as a
 *     pending document on cold start, as an event when the app is already up.
 *     iOS needs neither: a "Copy to FlyRight" share arrives as a file:// URL
 *     through the normal linking path, and src/app/+native-intent.ts routes it.
 *
 *  2. Reading. `readPdf` renders each page's text (PDFKit / PDFBox) and
 *     decodes every barcode on it (Vision / ML Kit: PDF417, QR, Aztec, Data
 *     Matrix). Pure parsing of the result lives in src/services/itinerary.ts.
 *
 * On web the module is absent: `requireOptionalNativeModule` yields null and
 * every call degrades to "nothing shared / cannot read". */

import { requireOptionalNativeModule, type NativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export interface SharedDocument {
  /** file:// path of a private copy the app owns and should delete after reading. */
  uri: string;
  /** The sender's display name for the file, when known. */
  name: string | null;
}

export interface PdfPageContents {
  text: string;
  /** Raw string payloads of the barcodes found on the page, deduplicated. */
  barcodes: string[];
}

export interface PdfContents {
  /** Total pages in the file — may exceed pages.length when capped. */
  pageCount: number;
  pages: PdfPageContents[];
}

type Events = { onDocumentShared: (doc: SharedDocument) => void };

declare class DocumentImportModule extends NativeModule<Events> {
  consumePendingDocument(): SharedDocument | null;
  readPdf(uri: string, maxPages: number): Promise<PdfContents>;
}

const native = requireOptionalNativeModule<DocumentImportModule>('FlyRightDocumentImport');

/** Whether this binary can read documents at all (native only). */
export const canImportDocuments = native != null;

/** Pages past this are legal boilerplate on every receipt we've seen; capping
 * keeps the barcode render pass bounded on long fare-rule attachments. */
const MAX_PAGES = 8;

/** A document shared into the app before JS was ready (cold start). Returns
 * it once; subsequent calls yield null. */
export function consumePendingDocument(): SharedDocument | null {
  return native?.consumePendingDocument() ?? null;
}

/** A document shared while the app was already running. */
export function addDocumentSharedListener(
  listener: (doc: SharedDocument) => void,
): EventSubscription {
  if (!native) return { remove() {} };
  return native.addListener('onDocumentShared', listener);
}

export async function readPdf(uri: string): Promise<PdfContents> {
  if (!native) throw new Error('Document import is not available on this platform.');
  return native.readPdf(uri, MAX_PAGES);
}
