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
  /** What the ticket said before the airline moved the flight — set only
   *  once a schedule change has been adopted, so the card can show what it
   *  changed from. Null while the trip still departs when it was booked to.
   *  See services/schedule-change.ts. */
  ticketedDeparture: text('ticketed_departure'),
  ticketedArrival: text('ticketed_arrival'),
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
  /** The cabin flown — 'economy' | 'premium' | 'business' | 'first'
   *  (services/cabin). Typed, or read off a boarding pass or booking
   *  document. Null when unknown. */
  cabin: text('cabin'),
  /** The baggage allowance as JSON (services/baggage): personal item,
   *  carry-on, checked bags. Typed, or read off a booking document or a
   *  boarding pass. Private like the seat and the price. Null when unknown. */
  baggage: text('baggage'),
  /** The boarding-pass barcode read off a scanned or imported pass, kept so
   *  the trip can show it again at the gate: the payload exactly as decoded
   *  and the symbology it came in (services/boarding-pass). One per trip,
   *  the traveller's own; a rescan replaces it. Null until a pass is read. */
  passCode: text('pass_code'),
  passFormat: text('pass_format'),
  /** When the code was read — "Scanned 12 Sep" on the card. */
  passCapturedAt: text('pass_captured_at'),
  /** The aircraft the flight was (or is to be) flown on, as the provider
   *  names it — "Airbus A350-900", "Boeing 737-800" — and its registration.
   *  Known only for flights found by number; a journal entry has neither.
   *  Feeds the aircraft section of Travel stats. */
  aircraftModel: text('aircraft_model'),
  aircraftReg: text('aircraft_reg'),
  /** The trip's airport record — the departure terminal, check-in desk,
   *  gate and boarding time, the belt at the other end, and when the flight
   *  really took off and landed. Written as the airport posts them (and kept
   *  once the live facts are gone), or typed by the traveller; null until
   *  known. Boarding and actual times are instants (ISO with offset). */
  terminal: text('terminal'),
  checkInDesk: text('check_in_desk'),
  gate: text('gate'),
  boardingTime: text('boarding_time'),
  baggageBelt: text('baggage_belt'),
  actualDeparture: text('actual_departure'),
  actualArrival: text('actual_arrival'),
  /** JSON array of the record's fields the traveller typed themselves
   *  ("gate", "baggageBelt"…) — shown as "Added by you" until the airport
   *  posts that field, which then wins. Null when none. */
  factsByUser: text('facts_by_user'),
  /** Receipt code for check-in; retained when a boarding pass is added. */
  ticketCode: text('ticket_code'),
  ticketFormat: text('ticket_format'),
  ticketCapturedAt: text('ticket_captured_at'),
  /** Hidden from the traveler's circle: members never see this trip in
   *  People, get no push about it, and aren't folded into its live session.
   *  A link the traveler shares explicitly still works — the token is the
   *  invitation. Default false: circles see every trip unless told not to. */
  hiddenFromCircle: integer('hidden_from_circle', { mode: 'boolean' }).notNull().default(false),
  /** Only the traveler's: nobody in the circle, close or not, sees this trip,
   *  hears about it, or can follow it — a surprise visit, an interview. Wins
   *  over hiddenFromCircle when both are set; see services/trip-visibility. */
  privateTrip: integer('private_trip', { mode: 'boolean' }).notNull().default(false),
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
  /** SHA-256 of the file as imported, so the same picture is not added to a
   * trip twice (importPhotos). Local only; null for photos that arrived
   * through sync or were imported before it existed. */
  contentHash: text('content_hash'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
  /** See journeys.syncedAt. */
  syncedAt: text('synced_at'),
});

/** The booking document a trip was imported from, kept when the traveller
 *  leaves "Keep the document" on. The file lives in the app's document
 *  directory (file:// uri) on the phone that imported it, or at its Convex
 *  storage URL on another device until it is opened there. One row and one
 *  copy of the file per trip. Syncs like tripPhotos. */
export const tripDocuments = sqliteTable('trip_documents', {
  id: text('id').primaryKey(),
  journeyId: text('journey_id').notNull().references(() => journeys.id),
  /** See journeys.userId. */
  userId: text('user_id'),
  uri: text('uri').notNull(),
  /** The file name as it was shared. */
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
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
  /** JSON TravelStage[]: the steps the traveller chose for this leg in the
   * trip progress editor; null keeps the suggested walk (stagePlan). */
  plan: text('plan'),
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
  /** JSON `[{ status, at }]`: each outcome recorded after sending, with when
   * it was recorded (services/claim-history), so the claim's timeline can
   * date "acknowledged", "paid" and the rest. Null on claims older than the
   * column and on ones with no recorded outcome. */
  statusHistory: text('status_history'),
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

/** The traveller's frequent flyer memberships (docs/memberships.md): one row
 * per programme card on the Memberships screen. Local to this device and
 * never synced — a membership number is the traveller's own, and nothing
 * on the server needs it. Everything past the number is optional and typed
 * by the traveller; no airline is asked. */
export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(),
  /** See journeys.userId: which account added it, null while anonymous. */
  userId: text('user_id'),
  /** A programme in services/loyalty-programmes, or 'other'. */
  programme: text('programme').notNull(),
  /** Only for 'other': the airline and the programme as the traveller
   *  names them. */
  customAirline: text('custom_airline'),
  customProgramme: text('custom_programme'),
  /** The membership number exactly as typed. */
  number: text('number').notNull(),
  /** Tier name as the programme words it ("Gold"); null for the entry tier. */
  tier: text('tier'),
  /** Redeemable balance (miles, Avios, points) the traveller last saw. */
  balance: integer('balance'),
  /** Qualifying credit so far this period and the next tier's threshold,
   *  in the programme's own unit (Qpoints, tier miles, XP …). */
  qualifying: integer('qualifying'),
  qualifyingTarget: integer('qualifying_target'),
  /** Last month the current tier holds, 'YYYY-MM'. */
  tierUntil: text('tier_until'),
  /** Miles that run out, and when ('YYYY-MM-DD'). */
  expiringAmount: integer('expiring_amount'),
  expiringOn: text('expiring_on'),
  /** Card order in the stack, lowest first. */
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

/** Lounge passes beside the airline cards in Memberships (docs/lounges.md):
 * Priority Pass, DragonPass and the like. Device-only, never synced, like
 * memberships. The free visits left are counted here, not fetched: what the
 * traveller typed as used when adding it, plus the visits logged since. */
export const loungePasses = sqliteTable('lounge_passes', {
  id: text('id').primaryKey(),
  /** See journeys.userId. */
  userId: text('user_id'),
  /** A LoungeNetwork ('priority-pass', 'dragonpass' …). */
  network: text('network').notNull(),
  /** The plan as the pass names it ("Standard Plus"), optional. */
  plan: text('plan'),
  /** Membership number exactly as typed; masked like memberships. */
  number: text('number').notNull(),
  /** Free visits a membership year; null for unlimited. */
  freeVisits: integer('free_visits'),
  /** Visits already used this membership year when the pass was added. */
  usedBefore: integer('used_before').notNull().default(0),
  /** The day the membership year starts again, 'YYYY-MM-DD'. */
  renewsOn: text('renews_on'),
  /** What a visit past the allowance and a guest cost, in minor units of
   *  `currency`. */
  extraVisitCents: integer('extra_visit_cents'),
  guestCents: integer('guest_cents'),
  currency: text('currency'),
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

/** Lounge visits the traveller logged ("I'm in the lounge"), by any way in.
 * Device-only; followers never see them (no travel-day stage). A visit
 * with no leftAt closes itself at the leave-by time. */
export const loungeVisits = sqliteTable('lounge_visits', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  /** The trip it was on; null for one logged without a trip. */
  journeyId: text('journey_id'),
  /** The directory's loungeId, and the name and airport as shown then. */
  loungeId: text('lounge_id').notNull(),
  loungeName: text('lounge_name').notNull(),
  airport: text('airport').notNull(),
  /** How they got in: 'status' | 'cabin' | 'pass' | 'pay'. */
  way: text('way').notNull(),
  /** The pass a 'pass' visit (or a paid one past its allowance) used. */
  passId: text('pass_id'),
  guests: integer('guests').notNull().default(0),
  paidCents: integer('paid_cents'),
  currency: text('currency'),
  enteredAt: text('entered_at').notNull(),
  leftAt: text('left_at'),
  /** The leave-by time the visit had, an instant. */
  leaveBy: text('leave_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});
