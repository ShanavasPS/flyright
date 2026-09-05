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
 *     Matrix). `readImage` does the same for a picture — a screenshot of a
 *     mobile pass, a photo of a paper one, as picked in the app — with the
 *     platform text recogniser standing in for the page text, and hands back
 *     a single page so callers can treat both alike. Pure parsing of the
 *     result lives in src/services/itinerary.ts.
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
  readImage(uri: string): Promise<PdfContents>;
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

/** A picture of a travel document: its barcodes, plus whatever text the
 * platform recogniser can read off it. Always one page. */
export async function readImage(uri: string): Promise<PdfContents> {
  if (!native) throw new Error('Document import is not available on this platform.');
  return native.readImage(uri);
}

/** Image extensions worth handing to `readImage` — what the pickers can
 * return and what the platform decoders read. */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|tiff?|bmp|gif)$/i;

export type DocumentKind = 'pdf' | 'image';

/** Which reader a file needs, from the mime type when a picker gave one (an
 * iOS photo can arrive with no extension at all) and the file name or URI
 * otherwise. PDF is the assumption: that is what every share hands over. */
export function documentKind(nameOrUri: string, mimeType?: string | null): DocumentKind {
  if (mimeType) return mimeType.startsWith('image/') ? 'image' : 'pdf';
  return IMAGE_EXTENSIONS.test(nameOrUri.split('?')[0]) ? 'image' : 'pdf';
}

/** Reads a travel document of either kind into pages. */
export async function readDocument(uri: string, kind: DocumentKind): Promise<PdfContents> {
  return kind === 'image' ? readImage(uri) : readPdf(uri);
}
