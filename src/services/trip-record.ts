/** The trip's airport record — terminal, check-in desk, gate, boarding time,
 * baggage belt and the real take-off and landing — kept on the journey row
 * so a trip still says where it left from and where the bags came out long
 * after the live facts are gone. Pure: the writes live in trip-record-store.
 *
 * Two sources fill it. The airport's feed writes every value it posts, and
 * what it posts wins. The traveller can type any of the five airport fields
 * the feed hasn't (or a journal trip that has no feed); those are listed in
 * `factsByUser` and read "Added by you" until the airport posts that field. */

import type { JourneyRow } from '@/services/journeys';
import type { FlightFacts } from '@/services/travel-day';
import { airportZone } from '@/services/airports';
import { flightDay, flightInstant } from '@/services/dates';

/** The record fields a traveller may type. */
export const TYPED_FIELDS = ['terminal', 'checkInDesk', 'gate', 'boardingTime', 'baggageBelt'] as const;
export type TypedField = (typeof TYPED_FIELDS)[number];

/** Everything the airport's feed can write into the record. */
const AIRPORT_FIELDS = [...TYPED_FIELDS, 'actualDeparture', 'actualArrival'] as const;
type AirportField = (typeof AIRPORT_FIELDS)[number];

export type RecordRow = Pick<JourneyRow, AirportField | 'factsByUser'>;
export type RecordPatch = Partial<Pick<JourneyRow, AirportField | 'factsByUser'>>;

/** The fields the traveller typed, from the row's JSON list. */
export function typedFields(row: Pick<JourneyRow, 'factsByUser'>): Set<TypedField> {
  if (!row.factsByUser) return new Set();
  try {
    const parsed: unknown = JSON.parse(row.factsByUser);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key): key is TypedField => (TYPED_FIELDS as readonly string[]).includes(key))
        : [],
    );
  } catch {
    return new Set();
  }
}

const serialize = (fields: Set<TypedField>): string | null =>
  fields.size ? JSON.stringify(TYPED_FIELDS.filter((key) => fields.has(key))) : null;

/** What the airport's latest facts change in the record, or null when
 * nothing. A value the airport posts replaces what the row holds — a typed
 * one included, which stops being the traveller's — and a value it drops
 * (the gate after take-off) stays recorded. */
export function airportPatch(row: RecordRow, facts: FlightFacts): RecordPatch | null {
  const typed = typedFields(row);
  const patch: RecordPatch = {};
  for (const key of AIRPORT_FIELDS) {
    const posted = facts[key];
    if (!posted) continue;
    const wasTyped = typed.delete(key as TypedField);
    if (posted !== row[key] || wasTyped) patch[key] = posted;
  }
  if (!Object.keys(patch).length) return null;
  const list = serialize(typed);
  if (list !== (row.factsByUser ?? null)) patch.factsByUser = list;
  return patch;
}

/** The traveller typing (or clearing) one field. */
export function typedPatch(row: RecordRow, field: TypedField, value: string | null): RecordPatch {
  const typed = typedFields(row);
  if (value) typed.add(field);
  else typed.delete(field);
  return { [field]: value, factsByUser: serialize(typed) };
}

/** The live facts with the record filling what the feed hasn't posted (or
 * no longer carries) — so a gate typed by the traveller reaches the Lock
 * Screen, and a journal trip's typed facts count like a tracked one's. */
export function withRecord(facts: FlightFacts, row: RecordRow): FlightFacts {
  const merged = { ...facts };
  for (const key of AIRPORT_FIELDS) {
    if (!merged[key] && row[key]) merged[key] = row[key];
  }
  return merged;
}

/** "15:30", "3:30 pm", "1530", "15.30" → minutes after midnight, or null. */
export function parseClock(text: string): number | null {
  const match = text
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})[:.\s]?(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.startsWith('p') ? 'pm' : match[3] ? 'am' : null;
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'pm' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** A typed boarding clock as an instant: that wall clock at the departure
 * airport on the departure's own day — the day before when the clock falls
 * after the departure (boarding at 23:40 for a 00:20 flight). Null when the
 * departure can't be placed. */
export function boardingInstant(
  row: Pick<JourneyRow, 'scheduledDeparture' | 'fromCode'>,
  minutes: number,
): string | null {
  const zone = airportZone(row.fromCode);
  const day = flightDay(row.scheduledDeparture, zone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const wall = `${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
  let at = flightInstant(wall, zone);
  const departure = flightInstant(row.scheduledDeparture, zone);
  if (Number.isNaN(at)) return null;
  if (!Number.isNaN(departure) && at > departure) at -= 86_400_000;
  return new Date(at).toISOString();
}
