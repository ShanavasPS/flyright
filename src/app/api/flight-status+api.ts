/**
 * GET /api/flight-status?flight=LH873&date=2026-08-10[&inbound=1]
 *
 * Proxies AeroDataBox so the API key stays server-side. Deployed with
 * EAS Hosting; set AERODATABOX_API_KEY in the hosting environment.
 * The provider is swappable here without an app-store release.
 *
 * `inbound=1` additionally resolves the aircraft's previous rotation leg
 * (where our plane is coming from) — only attempted while the flight hasn't
 * departed, since that's the window where the inbound predicts anything.
 *
 * In development with no key set, returns a deterministic mock so the
 * add-flight flow and E2E tests work offline (see mockLeg below).
 */

import {
  flightByNumberPath,
  flightsByRegistrationPath,
  providerConfigured,
  providerFetch,
  type ProviderResponse,
} from '../../../convex/providerFetch';
import { normalizeLeg, toIso } from '../../../convex/flightNormalize';
import { cacheExpiry, flightPhase, maySpend } from '../../../convex/providerShared';
import { carrierFor } from '@/constants/carriers';
import { lookupDay } from '../../../convex/lookupShared';
import { beginLookup, identifyCaller, recordLookup } from '@/server/lookup-gate';

/** Offline/dev stand-in: HEL→FRA on the requested date. Past flights with an
 * odd flight number arrive 195 min late (EU261-eligible); even ones are on
 * time; today/future flights are still 'scheduled'. */
function mockLeg(flight: string, date: string) {
  const carrier = carrierFor(flight);
  const digits = parseInt(flight.replace(/\D/g, ''), 10) || 0;
  const today = new Date().toISOString().slice(0, 10);
  const isPast = date < today;

  // Mimic the provider's history horizon so the lookup-failed → add-manually
  // path is exercisable offline: anything older than a year 404s like prod.
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  if (date < yearAgo) return null;
  const delayMinutes = isPast ? (digits % 2 === 1 ? 195 : 0) : null;

  // Upcoming odd-numbered flights get a late inbound so the prediction UI
  // and its notification are exercisable offline (even = plane on time).
  const inboundLate = !isPast && digits % 2 === 1;

  return {
    flight,
    date,
    status: !isPast ? 'scheduled' : delayMinutes ? 'delayed' : 'arrived',
    landed: isPast,
    delayMinutes,
    distanceKm: 1531,
    carrier: { name: carrier.name, iata: carrier.iata },
    carrierCountry: carrier.country,
    from: { code: 'HEL', country: 'FI' },
    to: { code: 'FRA', country: 'DE' },
    aircraft: { reg: 'OH-LKO', model: 'Airbus A320' },
    inbound: isPast
      ? null
      : {
          flight: `${carrier.iata}${digits + 1}`,
          from: { code: 'ARN' },
          status: inboundLate ? 'Delayed' : 'EnRoute',
          landed: false,
          scheduledArrival: `${date}T06:50Z`,
          estimatedArrival: inboundLate ? `${date}T07:35Z` : `${date}T06:48Z`,
          actualArrival: null,
        },
    scheduledDeparture: `${date}T08:00Z`,
    scheduledArrival: `${date}T10:35Z`,
    // Travel-day facts, so the live timeline is exercisable offline.
    gate: '24',
    terminal: '2',
    checkInDesk: '210-231',
    baggageBelt: isPast ? '5' : null,
    boardingTime: `${date}T07:20Z`,
    estimatedDeparture: delayMinutes ? `${date}T11:15Z` : `${date}T08:00Z`,
    actualDeparture: isPast ? (delayMinutes ? `${date}T11:20Z` : `${date}T08:02Z`) : null,
    estimatedArrival: delayMinutes ? `${date}T13:50Z` : `${date}T10:35Z`,
    actualArrival: isPast ? (delayMinutes ? `${date}T13:50Z` : `${date}T10:31Z`) : null,
  };
}

/** What a set of provider calls cost, and the freshest thing the provider
 * said about what is left. The provider bills us, so its own reading beats
 * any counter of ours; the last response in a call carries the newest one. */
function poolCharge(responses: ProviderResponse[]): {
  units: number;
  reported: { remaining: number; limit: number } | null;
} {
  const units = responses.reduce((total, r) => total + r.units, 0);
  const latest = responses.reduce<ProviderResponse['budget']>(
    (seen, r) => r.budget ?? seen,
    null,
  );
  return {
    units,
    reported: latest ? { remaining: latest.remaining, limit: latest.limit } : null,
  };
}

/** Once the flight is operating, the inbound rotation is history — the
 * departure estimate itself carries the signal. */
const PRE_DEPARTURE = ['Unknown', 'Expected', 'CheckIn', 'Boarding', 'Delayed', 'GateClosed'];

/**
 * The previous rotation leg: where this aircraft is right now. Looks up the
 * registration's flights and picks the latest leg arriving at our departure
 * airport before our scheduled departure. Early-morning departures also try
 * the previous calendar date, since the inbound often lands the night before.
 * Best-effort by design — any provider hiccup just means `inbound: null`.
 */
async function fetchInbound(
  reg: string,
  depAirport: string,
  scheduledDeparture: string,
  date: string,
  spent: ProviderResponse[],
): Promise<Record<string, unknown> | null> {
  const departureMs = Date.parse(scheduledDeparture.replace(' ', 'T'));
  if (Number.isNaN(departureMs)) return null;

  const dates = [date];
  if (new Date(departureMs).getUTCHours() < 6) {
    dates.push(new Date(departureMs - 86_400_000).toISOString().slice(0, 10));
  }

  let best: any = null;
  let bestArrival = -Infinity;
  for (const day of dates) {
    const response = await providerFetch(flightsByRegistrationPath(reg, day));
    spent.push(response);
    if (!response.ok) continue;
    const legs = response.body as any[];
    if (!Array.isArray(legs)) continue;
    for (const leg of legs) {
      if (leg.arrival?.airport?.iata !== depAirport) continue;
      const scheduled = Date.parse(toIso(leg.arrival.scheduledTime?.utc) ?? '');
      // The inbound must be planned to land before we take off; the small
      // tolerance keeps a same-minute turnaround from being filtered out.
      if (Number.isNaN(scheduled) || scheduled > departureMs + 300_000) continue;
      if (scheduled > bestArrival) {
        bestArrival = scheduled;
        best = leg;
      }
    }
    if (best) break;
  }
  if (!best) return null;

  const arr = best.arrival ?? {};
  const landed = best.status === 'Arrived' || !!arr.actualTime?.utc || !!arr.runwayTime?.utc;
  return {
    flight: (best.number as string | undefined)?.replace(/\s/g, '') ?? null,
    from: { code: best.departure?.airport?.iata ?? null },
    status: best.status ?? 'unknown',
    landed,
    scheduledArrival: toIso(arr.scheduledTime?.utc),
    estimatedArrival: toIso(arr.predictedTime?.utc ?? arr.revisedTime?.utc),
    actualArrival: toIso(
      arr.actualTime?.utc ?? arr.runwayTime?.utc ?? (landed ? arr.revisedTime?.utc : null),
    ),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const flight = url.searchParams.get('flight')?.toUpperCase().replace(/\s/g, '');
  const date = url.searchParams.get('date');
  const wantInbound = url.searchParams.get('inbound') === '1';

  if (!flight || !date) {
    return Response.json({ error: 'flight and date are required' }, { status: 400 });
  }

  if (!providerConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[flight-status] no AERODATABOX_API_KEY — serving mock data');
      const leg = mockLeg(flight, date);
      return leg
        ? Response.json(leg)
        : Response.json({ error: 'flight not found' }, { status: 404 });
    }
    return Response.json(
      { error: 'flight data provider not configured' },
      { status: 501 },
    );
  }

  // Who is asking: a verified account, or the web checker by address.
  // Signed-out app users get 401 and are offered sign-in. (The mock is free,
  // so this only guards real provider calls.)
  const caller = await identifyCaller(request);
  if (!caller.ok) {
    return Response.json({ error: caller.error }, { status: caller.status });
  }

  const want = wantInbound ? 'inbound' : 'base';
  // The inbound rotation is an extra provider call, so it costs two units.
  const cost = wantInbound ? 2 : 1;
  // One round trip: is this answer already bought, is there pool left, and
  // does this caller have daily allowance?
  const begin = await beginLookup(caller.subject, {
    flight,
    date,
    want,
    cost,
  });

  // Someone already asked this question recently — free, and doesn't touch
  // anyone's allowance.
  if (begin.outcome === 'cached') {
    return new Response(begin.payload, {
      headers: { 'content-type': 'application/json', 'x-flyright-cache': 'hit' },
    });
  }

  if (begin.outcome === 'refused') {
    // A spent personal allowance is the caller's problem and resets at
    // midnight UTC; a spent monthly pool is ours, and saying so honestly
    // lets the app offer "add it manually" instead of "try again".
    return begin.reason === 'quota'
      ? Response.json({ error: 'quota_exceeded' }, { status: 429 })
      : Response.json(
          { error: 'live_data_paused', reason: 'provider_budget' },
          { status: 503 },
        );
  }

  const spent: ProviderResponse[] = [];

  /** A call that produced nothing cacheable still cost units — charge them,
   * or a run of "flight not found" lookups is invisible to the pool.
   *
   * `ours` says the failure was not the caller's doing (the provider unwell,
   * or our own pool dry), which hands their daily allowance back. A genuine
   * "no such flight" is theirs to pay for: the provider processed it and
   * bills us the same as a hit. */
  const chargePool = (responses: ProviderResponse[], ours = false) =>
    recordLookup({
      flight,
      date,
      want,
      payload: null,
      phase: 'uncacheable',
      expiresAt: 0,
      refund: ours ? { day: lookupDay(new Date()), cost, subject: caller.subject } : null,
      ...poolCharge(responses),
    });

  const upstream = await providerFetch(flightByNumberPath(flight, date));
  spent.push(upstream);

  // AeroDataBox answers 204 (empty body) when the flight/date has no data.
  if (upstream.status === 404 || upstream.status === 204) {
    await chargePool(spent);
    return Response.json({ error: 'flight not found' }, { status: 404 });
  }
  if (!upstream.ok) {
    await chargePool(spent, true);
    // The provider itself refusing on quota is the same user-visible state as
    // our own pool being spent, and must read the same way.
    return upstream.status === 429
      ? Response.json(
          { error: 'live_data_paused', reason: 'provider_budget' },
          { status: 503 },
        )
      : Response.json({ error: 'upstream error' }, { status: 502 });
  }

  const legs = upstream.body as any[];
  if (!Array.isArray(legs) || legs.length === 0) {
    await chargePool(spent);
    return Response.json({ error: 'flight not found' }, { status: 404 });
  }

  // One normalizer for both runtimes (convex/flightNormalize.ts) — the poll
  // chain reads these same cached records, so the shape must not diverge.
  const leg = legs[0];
  const dep = leg.departure ?? {};

  // The rotation lookup is another one or two provider calls, so it's opt-in
  // and only runs while the inbound can still tell the user something the
  // departure board doesn't — and only while the monthly pool has room for a
  // nicety (`speculative`). Its failure must never break the status response.
  const reg = leg.aircraft?.reg as string | undefined;
  let inbound: Record<string, unknown> | null = null;
  if (
    wantInbound &&
    maySpend(begin.level, 'speculative') &&
    reg &&
    dep.airport?.iata &&
    PRE_DEPARTURE.includes(leg.status) &&
    dep.scheduledTime?.utc
  ) {
    inbound = await fetchInbound(
      reg,
      dep.airport.iata,
      dep.scheduledTime.utc,
      date,
      spent,
    ).catch(() => null);
  }

  const facts = normalizeLeg(leg, flight, date, inbound);

  // File the answer so the next caller asking the same question — the other
  // traveller on this flight, this journey's detail screen reopened, the next
  // poll in the chain — gets it for free. How long it stays usable follows
  // the flight's phase: a landed flight is history, one boarding now is not.
  const payload = JSON.stringify(facts);
  const now = Date.now();
  await recordLookup({
    flight,
    date,
    want,
    payload,
    phase: flightPhase(facts, now),
    expiresAt: cacheExpiry(facts, now),
    ...poolCharge(spent),
  });

  return new Response(payload, {
    headers: { 'content-type': 'application/json', 'x-flyright-cache': 'miss' },
  });
}
