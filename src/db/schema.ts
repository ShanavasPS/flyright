import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const journeys = sqliteTable('journeys', {
  id: text('id').primaryKey(),
  /** Clerk user id; null while the device is anonymous. Backfilled on sign-in
   *  so the future cloud sync knows which rows belong to the account. */
  userId: text('user_id'),
  mode: text('mode', { enum: ['flight', 'train', 'bus', 'ferry'] }).notNull(),
  carrier: text('carrier').notNull(),
  carrierCountry: text('carrier_country').notNull(),
  number: text('number').notNull(),
  fromCode: text('from_code').notNull(),
  fromCountry: text('from_country').notNull(),
  toCode: text('to_code').notNull(),
  toCountry: text('to_country').notNull(),
  distanceKm: real('distance_km').notNull(),
  scheduledDeparture: text('scheduled_departure').notNull(),
  scheduledArrival: text('scheduled_arrival').notNull(),
  ticketPriceAmount: real('ticket_price_amount'),
  ticketPriceCurrency: text('ticket_price_currency'),
  /** The traveler's own words about the trip — the journal's free-text
   *  field. Null (never '') when nothing has been written. */
  notes: text('notes'),
  /** When `notes` last changed; shown on the card as "Edited …". Separate
   *  from updatedAt, which every field edit and the sync bump. */
  notesUpdatedAt: text('notes_updated_at'),
  /** The traveler's 1–5 rating of the flight, null until they tap a star.
   *  Feeds the "favourite airline" stat. */
  rating: integer('rating'),
  /** Booking reference (PNR) and seat — typed on the manual form or read
   *  off a scanned boarding pass. Null when unknown. */
  bookingReference: text('booking_reference'),
  seat: text('seat'),
  /** 'lookup' rows track a live flight via the status API; 'manual' rows are
   *  journal entries (historical or number-less) that must never be polled. */
  source: text('source', { enum: ['lookup', 'manual'] }).notNull().default('lookup'),
  createdAt: text('created_at').notNull(),
  /** Set on every write — last-write-wins merge key for the future cloud sync. */
  updatedAt: text('updated_at').notNull().default(''),
  /** Soft-delete tombstone, so the sync can propagate deletions. */
  deletedAt: text('deleted_at'),
  /** updatedAt value at the last successful push/pull. Row is dirty iff
   *  syncedAt IS NULL OR updatedAt > syncedAt. Never sent to Convex. */
  syncedAt: text('synced_at'),
});

/** Photos the traveler attached to a trip. The file lives in the app's
 *  document directory (file:// uri) once imported on this device, or at its
 *  Convex storage URL when it arrived through sync from another device.
 *  storageId is set once the upload landed; rows sync last-write-wins like
 *  journeys, with soft-delete tombstones. */
export const tripPhotos = sqliteTable('trip_photos', {
  id: text('id').primaryKey(),
  journeyId: text('journey_id').notNull().references(() => journeys.id),
  /** See journeys.userId. */
  userId: text('user_id'),
  uri: text('uri').notNull(),
  width: integer('width'),
  height: integer('height'),
  /** Convex _storage id after upload; null while local-only. */
  storageId: text('storage_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
  /** See journeys.syncedAt. */
  syncedAt: text('synced_at'),
});

export const travelDay = sqliteTable('travel_day', {
  journeyId: text('journey_id').primaryKey().references(() => journeys.id),
  /** Furthest TravelStage reached; null before the first tap. */
  stage: text('stage'),
  /** JSON Record<TravelStage, ISO timestamp> of every reached stage. */
  stamps: text('stamps').notNull().default('{}'),
  /** When a live surface (widget/ongoing notification) was first shown. */
  activityStartedAt: text('activity_started_at'),
  /** Set when the travel window closes and surfaces are torn down. */
  endedAt: text('ended_at'),
  updatedAt: text('updated_at').notNull(),
  /** See journeys.syncedAt — dirty rows push to the Convex live session. */
  syncedAt: text('synced_at'),
});

export const disruptions = sqliteTable('disruptions', {
  id: text('id').primaryKey(),
  journeyId: text('journey_id').notNull().references(() => journeys.id),
  type: text('type').notNull(),
  delayMinutes: integer('delay_minutes'),
  noticeDays: integer('notice_days'),
  extraordinaryCircumstances: integer('extraordinary', { mode: 'boolean' }),
  detectedAt: text('detected_at').notNull(),
});

export const claims = sqliteTable('claims', {
  id: text('id').primaryKey(),
  /** See journeys.userId. */
  userId: text('user_id'),
  journeyId: text('journey_id').notNull().references(() => journeys.id),
  regulation: text('regulation').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  status: text('status', {
    enum: ['draft', 'sent', 'acknowledged', 'paid', 'rejected', 'escalated'],
  }).notNull().default('draft'),
  sentAt: text('sent_at'),
  responseDeadline: text('response_deadline'),
  /** JSON SentSnapshot (see claim-status.ts) frozen at send time — the exact
   * email subject/cover note, the letter HTML, and who it addressed — so the
   * user can always re-read what actually went out. Null on old/draft rows. */
  sentSnapshot: text('sent_snapshot'),
  createdAt: text('created_at').notNull(),
});

export const evidence = sqliteTable('evidence', {
  id: text('id').primaryKey(),
  claimId: text('claim_id').notNull().references(() => claims.id),
  kind: text('kind', {
    enum: ['boarding_pass', 'pir', 'receipt', 'photo', 'correspondence'],
  }).notNull(),
  /** file:// URI inside the app's document directory */
  uri: text('uri').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
});
