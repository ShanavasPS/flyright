/** Pure merge planning for Convex sync — no I/O, no deps, fully testable.
 *
 * Model: local SQLite is the source of truth; Convex is the mirror. Rows
 * carry ISO-string `updatedAt` stamps and merge last-write-wins by plain
 * string comparison ('' — the pre-0003 legacy value — sorts oldest for free).
 * A local row is dirty (needs pushing) iff `syncedAt` is unset or older than
 * `updatedAt`. Equal `updatedAt` on both sides means "in sync, do nothing" —
 * that tie is the fixpoint that makes sync loops structurally impossible.
 */

import type { JourneyRow } from '@/services/journeys';

/** The wire shape pushed to and returned from Convex (userId lives only
 * server-side; Convex system fields like _id are ignored). */
export interface RemoteJourney {
  naturalKey: string;
  mode: string;
  carrier: string;
  carrierCountry: string;
  number: string;
  fromCode: string;
  fromCountry: string;
  toCode: string;
  toCountry: string;
  distanceKm: number;
  scheduledDeparture: string;
  scheduledArrival: string;
  ticketPriceAmount: number | null;
  ticketPriceCurrency: string | null;
  /** Optional on the wire: rows pushed by clients older than the notes
   * feature omit both, and rows that never had a note carry null. */
  notes?: string | null;
  notesUpdatedAt?: string | null;
  rating?: number | null;
  bookingReference?: string | null;
  seat?: string | null;
  /** The boarding-pass barcode and when it was read; omitted by clients
   * older than the pass feature, null when the trip has none. */
  passCode?: string | null;
  passFormat?: string | null;
  passCapturedAt?: string | null;
  ticketCode?: string | null;
  ticketFormat?: string | null;
  ticketCapturedAt?: string | null;
  /** The aircraft type and registration; omitted by clients older than the
   * aircraft stats, null when the flight was never looked up. */
  aircraftModel?: string | null;
  aircraftReg?: string | null;
  /** Omitted by clients older than trip privacy; absent means visible. */
  hiddenFromCircle?: boolean;
  privateTrip?: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncPlan {
  /** Dirty local rows the server doesn't have a newer version of. */
  pushRows: JourneyRow[];
  /** Remote winners to write into SQLite. */
  applyLocally: RemoteJourney[];
}

export function isDirty(row: Pick<JourneyRow, 'updatedAt' | 'syncedAt'>): boolean {
  return row.syncedAt == null || row.updatedAt > row.syncedAt;
}

export function toRemoteJourney(row: JourneyRow): RemoteJourney {
  return {
    naturalKey: row.id,
    mode: row.mode,
    carrier: row.carrier,
    carrierCountry: row.carrierCountry,
    number: row.number,
    fromCode: row.fromCode,
    fromCountry: row.fromCountry,
    toCode: row.toCode,
    toCountry: row.toCountry,
    distanceKm: row.distanceKm,
    scheduledDeparture: row.scheduledDeparture,
    scheduledArrival: row.scheduledArrival,
    ticketPriceAmount: row.ticketPriceAmount,
    ticketPriceCurrency: row.ticketPriceCurrency,
    notes: row.notes,
    notesUpdatedAt: row.notesUpdatedAt,
    rating: row.rating,
    bookingReference: row.bookingReference,
    seat: row.seat,
    passCode: row.passCode,
    passFormat: row.passFormat,
    passCapturedAt: row.passCapturedAt,
    ticketCode: row.ticketCode,
    ticketFormat: row.ticketFormat,
    ticketCapturedAt: row.ticketCapturedAt,
    aircraftModel: row.aircraftModel,
    aircraftReg: row.aircraftReg,
    hiddenFromCircle: row.hiddenFromCircle,
    privateTrip: row.privateTrip,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function planSync(local: JourneyRow[], remote: RemoteJourney[]): SyncPlan {
  const remoteByKey = new Map(remote.map((r) => [r.naturalKey, r]));
  const localIds = new Set(local.map((r) => r.id));

  const pushRows: JourneyRow[] = [];
  const applyLocally: RemoteJourney[] = [];

  for (const row of local) {
    const counterpart = remoteByKey.get(row.id);
    if (!counterpart) {
      if (isDirty(row)) pushRows.push(row);
    } else if (counterpart.updatedAt > row.updatedAt) {
      applyLocally.push(counterpart);
    } else if (row.updatedAt > counterpart.updatedAt && isDirty(row)) {
      pushRows.push(row);
    }
    // Equal updatedAt: in sync — the loop-breaking fixpoint.
  }

  for (const row of remote) {
    if (!localIds.has(row.naturalKey)) applyLocally.push(row);
  }

  return { pushRows, applyLocally };
}
