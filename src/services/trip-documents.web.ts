// Web build: no SQLite and no document import — the same API surface with
// static fallbacks, like photos.web.ts.

import type { TripDocumentRow } from './trip-document-sync-plan';

export type { TripDocumentRow };

export interface BookingHint {
  carrier: string | null;
  flight: string | null;
  pnr: string | null;
  date: string | null;
}

export function useTripDocuments(_journeyId: string): TripDocumentRow[] | undefined {
  return [];
}

export async function keepDocument(): Promise<number> {
  return 0;
}

export async function openTripDocument(_row: TripDocumentRow): Promise<void> {
  throw new Error('Documents are not supported on web yet.');
}

export async function deleteTripDocument(_id: string): Promise<void> {}

export async function deleteDocumentsOf(_journeyId: string): Promise<void> {}
