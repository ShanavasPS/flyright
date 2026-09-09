/**
 * Connections between legs — pure, shared by the Convex functions (what a
 * follower is told) and the app (how the journal draws it), so both sides
 * agree on what counts as one itinerary.
 *
 * Two legs connect when the second leaves from the airport the first lands
 * at, after it lands, and within a day. That is the whole rule: no booking
 * reference needed (a self-transfer on two tickets is still a connection the
 * traveller has to make), no same-airline test, no minimum layover (a tight
 * one is exactly what the label is for).
 */

export const MAX_LAYOVER_MS = 24 * 60 * 60_000;

export interface LegLike {
  fromCode: string;
  toCode: string;
  scheduledDeparture: string;
  scheduledArrival: string;
}

/** A stored time as an instant, given the airport it belongs to. Zoned
 * strings parse as they are; a manual entry's bare wall clock is pinned to the
 * airport's zone, or the 04:15 typed at COK and the 06:00Z the lookup stored
 * for the next leg could never be compared. */
export type Instant = (iso: string, iata: string) => number;

/** Milliseconds between `a` landing and `b` leaving, when `b` is a connection
 * off `a`; null otherwise. */
export function layoverMs(a: LegLike, b: LegLike, instant: Instant): number | null {
  if (a.toCode !== b.fromCode) return null;
  const gap = instant(b.scheduledDeparture, b.fromCode) - instant(a.scheduledArrival, a.toCode);
  if (!Number.isFinite(gap) || gap <= 0 || gap > MAX_LAYOVER_MS) return null;
  return gap;
}

/** Legs grouped into itineraries, each in flying order. Greedy: every leg, in
 * departure order, joins the itinerary whose last leg it connects off, else
 * starts its own. Legs that don't connect to anything come back as
 * single-leg itineraries, so the caller can treat every trip the same way. */
export function chainLegs<T extends LegLike>(legs: T[], instant: Instant): T[][] {
  const ordered = [...legs].sort(
    (a, b) => instant(a.scheduledDeparture, a.fromCode) - instant(b.scheduledDeparture, b.fromCode),
  );
  const chains: T[][] = [];
  for (const leg of ordered) {
    const chain = chains.find((c) => layoverMs(c[c.length - 1]!, leg, instant) !== null);
    if (chain) chain.push(leg);
    else chains.push([leg]);
  }
  return chains;
}

/** The legs that follow `from` in the same itinerary, in flying order —
 * what a follower watching one leg is told about the rest of the journey. */
export function onwardFrom<T extends LegLike>(from: LegLike, legs: T[], instant: Instant): T[] {
  const out: T[] = [];
  let last: LegLike = from;
  const pool = [...legs].sort(
    (a, b) => instant(a.scheduledDeparture, a.fromCode) - instant(b.scheduledDeparture, b.fromCode),
  );
  for (;;) {
    const next = pool.find((leg) => layoverMs(last, leg, instant) !== null);
    if (!next) return out;
    out.push(next);
    last = next;
  }
}

/** Whether an itinerary still has travelling left in it: its last leg has not
 * departed. A trip is filed under Flown as a whole, once — never leg by leg,
 * which put the second half of a journey under Flown while the first half
 * was still the live card. */
export function itineraryPending(chain: LegLike[], now: number, instant: Instant): boolean {
  const last = chain[chain.length - 1];
  if (!last) return false;
  return instant(last.scheduledDeparture, last.fromCode) >= now;
}

/** "2h 55m" / "45m" / "1d 3h" — a layover, in the units a traveller says it in. */
export function layoverLabel(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

const ZONED = /(Z|[+-]\d\d:?\d\d)$/;
const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** An `Instant` built from an airport→zone lookup. A zoned string is its own
 * instant; a bare wall clock is pinned to the airport's zone via Intl (the
 * same arithmetic as the app's zonedTimestamp), falling back to the runtime's
 * reading when the zone is unknown. */
export function instantWith(zoneOf: (iata: string) => string | null): Instant {
  return (iso, iata) => {
    if (ZONED.test(iso)) return Date.parse(iso);
    const wall = WALL.exec(iso);
    const zone = zoneOf(iata);
    if (!wall || !zone) return Date.parse(iso);
    const [, y, mo, d, h, mi] = wall;
    const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
    try {
      // Offset of the zone at that instant, refined once for DST edges.
      let ms = asUtc - zoneOffsetMs(asUtc, zone);
      ms = asUtc - zoneOffsetMs(ms, zone);
      return ms;
    } catch {
      return Date.parse(iso);
    }
  };
}

function zoneOffsetMs(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return local - Math.floor(utcMs / 1000) * 1000;
}
