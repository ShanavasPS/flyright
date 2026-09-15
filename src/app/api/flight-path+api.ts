/**
 * GET /api/flight-path?flight=AY1331&date=2026-08-30&from=HEL&to=LHR&departure=2026-08-30T08:00:00Z
 *
 * The path a flight actually flew — or, before it leaves, the route it
 * filed — for the detail screen's inset map, which otherwise draws the great
 * circle. Proxies FlightAware AeroAPI so the key stays server-side; see
 * convex/flightPathShared.ts for the rules and the licence they encode.
 *
 * Answers `{ path, reason }`: `path` is the polyline or null, and `reason`
 * says why null when it is — none of which is an error the app can act on,
 * so they all come back 200 and the map simply keeps its great circle.
 * Only a genuine outage is a 5xx.
 *
 * In development with no key set, returns a deterministic mock so the map
 * can be worked on offline (see mockPath below).
 */

import {
  flightAwareConfigured,
  flightByIdentPath,
  historyEnabled,
  routePath,
  trackPath,
  type PathProviderResponse,
} from '../../../convex/flightPathFetch';
import {
  callCents,
  hasDeparted,
  hasLanded,
  historyWindow,
  isHistorical,
  lookupWindow,
  normalizeRoute,
  normalizeTrack,
  pathExpiry,
  pathProviderBills,
  pickFlight,
  type AeroFix,
  type AeroFlight,
  type AeroPosition,
  type FlightPath,
} from '../../../convex/flightPathShared';
import { identifyCaller } from '@/server/lookup-gate';
import { beginPath, pathCall, recordPath } from '@/server/path-gate';

/** The handful of airports the offline status mock and the E2E flows use;
 * enough to bow a believable line between them without shipping the whole
 * airport dataset in the worker. */
const MOCK_AIRPORTS: Record<string, [number, number]> = {
  HEL: [60.3172, 24.9633],
  FRA: [50.0379, 8.5622],
  LHR: [51.47, -0.4543],
  ARN: [59.6519, 17.9186],
  CPH: [55.618, 12.6508],
  JFK: [40.6413, -73.7781],
  DXB: [25.2532, 55.3657],
  LAX: [33.9416, -118.4085],
  SIN: [1.3644, 103.9915],
};

/** A gently bowed, slightly wobbly line between the two airports — recognisably
 * not the great circle, so it is obvious on screen that the path came from
 * the route. Past dates get a finished track, today a half-flown one, the
 * future a filed route. */
function mockPath(from: string, to: string, date: string): FlightPath | null {
  const a = MOCK_AIRPORTS[from];
  const b = MOCK_AIRPORTS[to];
  if (!a || !b) return null;
  const today = new Date().toISOString().slice(0, 10);
  const kind = date > today ? 'planned' : 'track';
  const steps = 24;
  const shown = date === today ? Math.floor(steps / 2) : steps;
  const points: [number, number][] = [];
  for (let i = 0; i <= shown; i += 1) {
    const t = i / steps;
    const lat = a[0] + (b[0] - a[0]) * t;
    const lon = a[1] + (b[1] - a[1]) * t;
    // Bow away from the straight line, plus a wobble a real track has.
    const bow = Math.sin(Math.PI * t) * 0.08 * Math.hypot(b[0] - a[0], b[1] - a[1]);
    const wobble = Math.sin(t * Math.PI * 6) * 0.15;
    points.push([lat + bow + wobble, lon - bow]);
  }
  return { kind, points, complete: kind === 'track' && date < today, updatedAt: new Date().toISOString() };
}

const IATA = /^[A-Z0-9]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `path` for the app, plus why there is none. */
function answer(path: FlightPath | null, reason: string | null, cache: 'hit' | 'miss'): Response {
  return Response.json(
    { path, reason: path ? null : reason },
    { headers: { 'x-flyright-cache': cache } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const flight = url.searchParams.get('flight')?.toUpperCase().replace(/\s/g, '');
  const date = url.searchParams.get('date');
  const from = url.searchParams.get('from')?.toUpperCase();
  const to = url.searchParams.get('to')?.toUpperCase();
  const departure = url.searchParams.get('departure');

  if (!flight || !date || !from || !to || !departure) {
    return Response.json({ error: 'flight, date, from, to and departure are required' }, { status: 400 });
  }
  if (!DAY.test(date) || !IATA.test(from) || !IATA.test(to) || Number.isNaN(Date.parse(departure))) {
    return Response.json({ error: 'malformed parameters' }, { status: 400 });
  }

  if (!flightAwareConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      return answer(mockPath(from, to, date), 'no_data', 'miss');
    }
    // Nothing to draw beyond the great circle — not an error.
    return answer(null, 'not_configured', 'miss');
  }

  const now = Date.now();
  const historical = isHistorical(departure, now);
  if (historical && !historyEnabled()) return answer(null, 'beyond_horizon', 'miss');
  const window = historical ? historyWindow(departure) : lookupWindow(departure, now);
  // Too far ahead for the provider to know the flight yet.
  if (!window) return answer(null, 'not_yet', 'miss');

  const caller = await identifyCaller(request);
  if (!caller.ok) return Response.json({ error: caller.error }, { status: caller.status });

  const begin = await beginPath(caller.subject, { flight, date });
  if (begin.outcome === 'unavailable') {
    return Response.json({ error: 'metering_unavailable' }, { status: 503 });
  }
  if (begin.outcome === 'cached') {
    return answer(begin.payload ? (JSON.parse(begin.payload) as FlightPath) : null, 'no_data', 'hit');
  }
  if (begin.outcome === 'refused') return answer(null, begin.reason, 'miss');

  let cents = 0;
  /** File what the calls cost, with or without an answer to keep. */
  const record = (path: FlightPath | null, flightSeen: AeroFlight | null, cacheable: boolean) =>
    recordPath({
      flight,
      date,
      payload: path ? JSON.stringify(path) : null,
      kind: path?.kind ?? 'none',
      expiresAt: pathExpiry(path, flightSeen, now),
      cents,
      cacheable,
    });
  const outage = async (upstream: PathProviderResponse) => {
    await record(null, null, false);
    return Response.json({ error: 'upstream error', status: upstream.status }, { status: 502 });
  };

  // 1. Which of the provider's flights is this journey.
  const summary = await pathCall(flightByIdentPath(flight, window, historical));
  if (pathProviderBills(summary.status, summary.ok)) {
    const flights = (summary.body as { flights?: unknown[] } | null)?.flights;
    cents += callCents(historical ? 'historyFlight' : 'flight', Array.isArray(flights) ? flights.length : 0);
  }
  // 400 is the provider's "no such ident in this window", 404 a flight it
  // never saw. Both are answers.
  if (!summary.ok && summary.status !== 404 && summary.status !== 400) return outage(summary);
  const flights = (summary.body as { flights?: AeroFlight[] } | null)?.flights ?? [];
  const picked = pickFlight(flights, { from, to, departure });
  if (!picked) {
    await record(null, null, true);
    return answer(null, 'no_data', 'miss');
  }

  // 2. The track once it has flown; the filed route while it is still to.
  let path: FlightPath | null = null;
  if (hasDeparted(picked)) {
    const track = await pathCall(trackPath(picked.fa_flight_id, historical));
    const positions = (track.body as { positions?: AeroPosition[] } | null)?.positions;
    if (pathProviderBills(track.status, track.ok)) {
      cents += callCents(historical ? 'historyTrack' : 'track', positions?.length ?? 0);
    }
    if (!track.ok && track.status !== 404) return outage(track);
    path = normalizeTrack(positions, hasLanded(picked), now);
  } else if (!historical) {
    const route = await pathCall(routePath(picked.fa_flight_id));
    const fixes = (route.body as { fixes?: AeroFix[] } | null)?.fixes;
    if (pathProviderBills(route.status, route.ok)) cents += callCents('route', fixes?.length ?? 0);
    if (!route.ok && route.status !== 404) return outage(route);
    path = normalizeRoute(fixes, now);
  }

  await record(path, picked, true);
  return answer(path, 'no_data', 'miss');
}
