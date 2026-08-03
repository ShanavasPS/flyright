import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const journeys = sqliteTable('journeys', {
  id: text('id').primaryKey(),
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
  createdAt: text('created_at').notNull(),
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
  journeyId: text('journey_id').notNull().references(() => journeys.id),
  regulation: text('regulation').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  status: text('status', {
    enum: ['draft', 'sent', 'acknowledged', 'paid', 'rejected', 'escalated'],
  }).notNull().default('draft'),
  sentAt: text('sent_at'),
  responseDeadline: text('response_deadline'),
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
