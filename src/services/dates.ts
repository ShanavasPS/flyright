/** Pure date helpers for journey rows — kept UI-free so they're testable.
 *
 * Flight times are wall-clock facts of their airports, not moments to be
 * re-rendered wherever the reader happens to stand: a Stockholm departure is
 * 12:25 in Stockholm whether you read it from Arlanda or from Bengaluru, and
 * a traveler only ever needs the clock of the country they're physically in.
 * So every formatter here takes the IANA `zone` of the airport the time
 * belongs to — `airportZone(row.fromCode)` for a departure, the arrival
 * airport's for an arrival.
 *
 * Two storage shapes flow through these, the same split blockMinutes reads
 * (services/timeline):
 *
 *  - Zoned ("2026-11-28T11:25Z", "…+01:00") — lookup rows, a real instant.
 *    These get converted into `zone`; without one they fall back to the
 *    device, which is the bug this exists to avoid.
 *  - Zone-less ("2026-11-28T11:30:00") — manual entries, already a bare wall
 *    clock as the traveler typed it. Rendered as written, never shifted.
 *
 * Moments that really are the reader's own — when they wrote a note, when a
 * subscription lapses — stay device-local and don't pass a zone.
 */

/** A timestamp that pins itself to an instant, rather than naming a wall
 * clock and leaving the zone to context. */
const ZONED = /(Z|[+-]\d\d:?\d\d)$/;
/** A stored wall clock with no zone — a manual entry's "2026-09-09T04:15:00". */
const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** Formatting options for a stored timestamp: convert into the airport's
 * zone when the string is an instant and we know the zone, otherwise let the
 * runtime read it as written. */
function inZone(iso: string, zone: string | null | undefined): { timeZone?: string } {
  return ZONED.test(iso) && zone ? { timeZone: zone } : {};
}

/** 'YYYY-MM-DD' for an instant as that zone's calendar reads it — the
 * en-CA locale is ISO-ordered, which is what makes this a slice-free way to
 * ask "which day is it over there". */
function zonedDay(date: Date, zone: string | null | undefined): string {
  if (!zone) return localDateString(date);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    // An engine without full ICU (or a zone it has never heard of) must not
    // take a screen down over a date label.
    return localDateString(date);
  }
}

/** 'YYYY-MM-DD' in the device's local calendar, offset by `days`. */
export function localDateString(base: Date, days = 0): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Noon UTC on the calendar day a string names — a date the runtime can
 * format with `timeZone: 'UTC'` and get that same day back, whatever zone
 * the phone is in or thinks it is in. */
function utcNoon(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** "Wed, 5 Aug" — the short label Flighty-style chips and rows use. Pass the
 * airport's zone for a flight time, so a late-evening departure doesn't read
 * as tomorrow to a reader further east. */
export function formatDayLabel(isoDate: string, zone?: string | null): string {
  if (ZONED.test(isoDate) && zone) {
    return new Date(isoDate).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: zone,
    });
  }
  return utcNoon(isoDate).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "5 Aug 2015" — for past rows where a weekday or a "3650 days ago"
 * countdown reads worse than the plain date. */
export function formatDayLabelWithYear(isoDate: string, zone?: string | null): string {
  if (ZONED.test(isoDate) && zone) {
    return new Date(isoDate).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: zone,
    });
  }
  return utcNoon(isoDate).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "08:00" at the airport the time belongs to; '—' when unknown. Without a
 * `zone` a stored instant falls back to the device's clock — right only for
 * a reader who happens to be standing in that airport's country. */
export function formatTime(iso: string | null, zone?: string | null): string {
  if (!iso) return '—';
  // A bare wall clock is printed as written. It used to be parsed as
  // device-local and formatted device-local, two steps that cancel out only
  // while the runtime agrees with itself about the phone's zone — and it
  // doesn't for a while after the phone changes zone mid-trip, which is how
  // a 04:15 typed at COK read 01:45 on landing in DOH.
  const wall = WALL.exec(iso);
  if (wall) {
    const [, y, mo, d, h, mi] = wall;
    try {
      return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });
    } catch {
      return `${h}:${mi}`;
    }
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      ...inZone(iso, zone),
    });
  } catch {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}

/** How far ahead of UTC `zone` runs at `utcMs`, in milliseconds. */
function zoneOffsetMs(utcMs: number, zone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const at = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    // Some ICU builds render midnight as hour 24 under hour12: false.
    const asUtc = Date.UTC(
      at('year'),
      at('month') - 1,
      at('day'),
      at('hour') % 24,
      at('minute'),
      at('second'),
    );
    return Number.isFinite(asUtc) ? asUtc - utcMs : 0;
  } catch {
    return 0;
  }
}

/** The instant at which `clock` ("11:30") reads on `day` ("2026-11-28") in
 * `zone` — the inverse of formatTime, for turning a time a ticket printed
 * into one the app can count down to.
 *
 * Null when the zone is unknown or the input doesn't parse, which leaves the
 * caller holding a bare wall clock: still the right thing to show, just not
 * something instant arithmetic can use.
 */
export function zonedTimestamp(
  day: string,
  clock: string,
  zone: string | null | undefined,
): string | null {
  if (!zone) return null;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.slice(0, 10));
  const time = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!date || !time) return null;
  const wall = Date.UTC(+date[1], +date[2] - 1, +date[3], +time[1], +time[2]);
  if (!Number.isFinite(wall)) return null;
  // Twice: the offset depends on the instant, and the first guess can land on
  // the wrong side of a daylight-saving switch.
  let ms = wall - zoneOffsetMs(wall, zone);
  ms = wall - zoneOffsetMs(ms, zone);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** A stored timestamp as an instant: zoned strings pass through, a bare wall
 * clock is pinned to the airport's zone (the way zonedTimestamp does for a
 * printed ticket). Null when that isn't possible — no zone, or a string that
 * isn't a wall clock — so callers doing instant arithmetic can decline
 * rather than difference two clocks from different countries. */
export function pinToZone(iso: string, zone: string | null | undefined): string | null {
  if (ZONED.test(iso)) return iso;
  const wall = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return wall ? zonedTimestamp(wall[1], wall[2], zone) : null;
}

/** The clock a timestamp reads at its airport, as "HH:MM" — the shape the
 * add-flight form's time chips hold. A zone-less string is already a wall
 * clock and keeps its own; null when the timestamp doesn't parse. */
export function wallClock(iso: string | null | undefined, zone: string | null | undefined): string | null {
  if (!iso) return null;
  if (!ZONED.test(iso)) return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...inZone(iso, zone),
    }).formatToParts(date);
    const at = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    // Some ICU builds render midnight as hour 24 under hour12: false.
    return `${`${at('hour') % 24}`.padStart(2, '0')}:${`${at('minute')}`.padStart(2, '0')}`;
  } catch {
    return null;
  }
}

/** The day a flight leaves, as the departure board says it: 'YYYY-MM-DD' in
 * the origin airport's zone.
 *
 * Slicing the stored instant instead is wrong wherever local midnight and
 * UTC midnight fall on different days — a 00:15 departure from Auckland is
 * stored as 11:15Z the *previous* day, and every provider lookup is keyed on
 * the flight's local date, so the slice asks about a flight that doesn't
 * exist. Zone-less rows are already local and keep their date part.
 */
export function flightDay(iso: string, zone: string | null | undefined): string {
  if (!ZONED.test(iso) || !zone) return iso.slice(0, 10);
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso.slice(0, 10) : zonedDay(date, zone);
}

/** How many calendar days after the departure the flight lands, in the
 * airports' own calendars: a 23:59 Las Vegas departure landing 04:34 in
 * Dallas is +1, a seven-hour flight leaving Kochi at 04:15 is 0, and the
 * eastbound dateline hop from Apia that lands the day before is −1. Judged
 * by local dates, not elapsed hours — "+1" on a ticket means the arrival
 * clock reads on the next day's page. Null when either time can't be
 * placed on a day. */
export function dayOffset(
  departureIso: string,
  fromZone: string | null | undefined,
  arrivalIso: string,
  toZone: string | null | undefined,
): number | null {
  const depDay = flightDay(departureIso, fromZone);
  const arrDay = flightDay(arrivalIso, toZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depDay) || !/^\d{4}-\d{2}-\d{2}$/.test(arrDay)) return null;
  const ms = Date.UTC(+arrDay.slice(0, 4), +arrDay.slice(5, 7) - 1, +arrDay.slice(8, 10)) -
    Date.UTC(+depDay.slice(0, 4), +depDay.slice(5, 7) - 1, +depDay.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** The "+1" a timetable sets after an arrival clock that lands the next
 * day, as superscript glyphs ("⁺¹") so it hangs off the clock the way
 * Google Flights and the airlines' own tables print it, in any font and
 * in a plain string — a lock-screen widget renders it unchanged. Empty
 * for a same-day landing or an unknown offset. */
export function dayOffsetMark(offset: number | null): string {
  if (!offset) return '';
  const sign = offset > 0 ? '⁺' : '⁻';
  return sign + String(Math.abs(offset)).split('').map((d) => SUPERSCRIPT[d] ?? d).join('');
}

/** The same fact for a screen reader: "arrives next day". */
export function dayOffsetSpoken(offset: number | null): string | null {
  if (!offset) return null;
  if (offset === 1) return 'arrives next day';
  if (offset === -1) return 'arrives the day before';
  return offset > 0 ? `arrives ${offset} days later` : `arrives ${-offset} days earlier`;
}

/** A flight time as an instant for arithmetic: zoned strings parse as they
 * are; a bare wall clock is pinned to the airport's zone first, so "04:15 at
 * COK" is the same moment on a phone in Doha as on one in Kochi. Without a
 * zone to pin to it falls back to the runtime's reading — the one dependence
 * on the phone's clock left, and only for airports the table doesn't know. */
export function flightInstant(iso: string, zone?: string | null): number {
  return Date.parse(pinToZone(iso, zone) ?? iso);
}

/** The big left-column label on journey rows: time until (or since) departure. */
export function countdown(
  departureIso: string,
  now: Date,
  zone?: string | null,
): { value: number; unit: string } {
  const ms = flightInstant(departureIso, zone) - now.getTime();
  const abs = Math.abs(ms);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  if (abs < 3_600_000) return { value: 0, unit: 'now' };
  if (hours < 48) return { value: hours, unit: ms >= 0 ? 'hours' : 'hours ago' };
  return { value: days, unit: ms >= 0 ? 'days' : 'days ago' };
}

/** Whole days between two 'YYYY-MM-DD' calendar dates. */
function daysBetween(from: string, to: string): number {
  const at = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/** Calendar-day distance from `now` to `iso` — "tomorrow" is the next
 * calendar day, not 24 hours away. Read in `zone` for a flight time, so
 * departure day is the day it is at the airport; in the device's zone for
 * the reader's own moments. */
function calendarDayDiff(iso: string, now: Date, zone?: string | null): number {
  const target = new Date(iso);
  if (ZONED.test(iso) && zone) {
    return daysBetween(zonedDay(now, zone), zonedDay(target, zone));
  }
  // A bare wall clock already names its day; "today" is the day at the
  // airport when we know it, the phone's otherwise.
  if (WALL.test(iso)) return daysBetween(zone ? zonedDay(now, zone) : localDateString(now), iso.slice(0, 10));
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(target) - startOf(now)) / 86_400_000);
}

/** The trip screen's title: the day the flight leaves, in the departure
 * airport's own calendar — "Today" should mean the day it is where the
 * flight leaves from, not wherever the phone last synced its clock — with
 * the year once the trip isn't in this one.
 *
 * The date and nothing else. How far off the trip is — "In 3 days",
 * "Boarding soon", "Flown" — belongs to the route hero's chip a line below,
 * and while the title said it too the pair agreed word for word for the
 * whole week around a departure: "In 3 days" under "In 3 days". */
export function tripDateTitle(departureIso: string, now: Date, zone?: string | null): string {
  if (Number.isNaN(Date.parse(departureIso))) return '';
  const departureYear =
    ZONED.test(departureIso) && zone
      ? +zonedDay(new Date(departureIso), zone).slice(0, 4)
      : WALL.test(departureIso)
        ? +departureIso.slice(0, 4)
        : new Date(departureIso).getFullYear();
  return departureYear === now.getFullYear()
    ? formatDayLabel(departureIso, zone)
    : formatDayLabelWithYear(departureIso, zone);
}


/** "today at 09:15", "yesterday", "3 days ago", or the dated form — the
 * tail of a "Edited …" stamp, so recent edits read as recency and old ones
 * as a date. */
export function editedLabel(iso: string, now: Date): string {
  if (Number.isNaN(Date.parse(iso))) return '';
  const diff = calendarDayDiff(iso, now);
  if (diff === 0) return `today at ${formatTime(iso)}`;
  if (diff === -1) return 'yesterday';
  if (diff < -1 && diff >= -7) return `${-diff} days ago`;
  return formatDayLabelWithYear(iso);
}
