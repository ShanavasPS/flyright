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

import { carrierFor } from '@/constants/carriers';
import { gateLookup } from '@/server/lookup-gate';

/** AeroDataBox uses "2026-08-10 08:00Z"; the app stores strict ISO. */
function toIso(s: string | undefined): string | null {
  return s ? s.replace(' ', 'T') : null;
}

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

const ADB_HOST = 'aerodatabox.p.rapidapi.com';

function adbFetch(path: string, apiKey: string) {
  return fetch(`https://${ADB_HOST}${path}`, {
    headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': ADB_HOST },
  });
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
  apiKey: string,
  reg: string,
  depAirport: string,
  scheduledDeparture: string,
  date: string,
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
    const response = await adbFetch(`/flights/reg/${encodeURIComponent(reg)}/${day}`, apiKey);
    if (!response.ok) continue;
    const legs: any[] = await response.json().catch(() => null);
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

  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) {
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

  // Real provider calls are metered per caller: a verified account, or the
  // web checker by address. Signed-out app users get 401 and are offered
  // sign-in; a spent budget gets 429. The inbound rotation is a second
  // provider call, so it costs two units. (The mock above is free.)
  const gate = await gateLookup(request, wantInbound ? 2 : 1);
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  const upstream = await adbFetch(
    `/flights/number/${encodeURIComponent(flight)}/${date}`,
    apiKey,
  );

  // AeroDataBox answers 204 (empty body) when the flight/date has no data.
  if (upstream.status === 404 || upstream.status === 204) {
    return Response.json({ error: 'flight not found' }, { status: 404 });
  }
  if (!upstream.ok) {
    return Response.json({ error: 'upstream error' }, { status: 502 });
  }

  const legs: any[] = await upstream.json().catch(() => null);
  if (!Array.isArray(legs) || legs.length === 0) {
    return Response.json({ error: 'flight not found' }, { status: 404 });
  }

  // Normalize to the shape the app needs: the rules-engine fields plus the
  // travel-day facts (gate/terminal/times) the live timeline renders.
  const leg = legs[0];
  const dep = leg.departure ?? {};
  const arr = leg.arrival ?? {};

  // AeroDataBox's live fields: runwayTime is an actual (touchdown/takeoff),
  // revisedTime the airline's current estimate — which, once the flight has
  // landed, is the last known gate-arrival time (actualTime often never fills
  // in). predictedTime exists even for unflown flights.
  const landed = leg.status === 'Arrived' || !!arr.actualTime?.utc || !!arr.runwayTime?.utc;
  const actualArrival =
    arr.actualTime?.utc ?? arr.runwayTime?.utc ?? (landed ? arr.revisedTime?.utc : null);

  // Before landing, an airline-announced revision always counts as a delay
  // signal, but predictedTime is a speculative ML estimate — it exists for
  // flights days away, so it only counts once the flight is operating. Either
  // way a slip within a few minutes of schedule is jitter, not a delay; delay
  // alerts start at 30 min, so a 15-min floor loses no signal.
  const OPERATING = ['CheckIn', 'Boarding', 'GateClosed', 'Departed', 'EnRoute', 'Approaching', 'Delayed', 'Diverted'];
  const PREDICTED_SLIP_MIN = 15;
  const scheduled = arr.scheduledTime?.utc;
  const arrivalBasis = landed
    ? actualArrival
    : (arr.revisedTime?.utc ?? (OPERATING.includes(leg.status) ? arr.predictedTime?.utc : null));
  const rawDelay =
    scheduled && arrivalBasis
      ? Math.max(0, Math.round((Date.parse(arrivalBasis) - Date.parse(scheduled)) / 60000))
      : null;
  const delayMinutes = landed || (rawDelay ?? 0) >= PREDICTED_SLIP_MIN ? rawDelay : null;
  const carrier = carrierFor(flight);

  // The rotation lookup is a second provider call, so it's opt-in and only
  // runs while the inbound can still tell the user something the departure
  // board doesn't. Its failure must never break the status response.
  const reg = leg.aircraft?.reg as string | undefined;
  let inbound: Record<string, unknown> | null = null;
  if (wantInbound && reg && dep.airport?.iata && PRE_DEPARTURE.includes(leg.status) && dep.scheduledTime?.utc) {
    inbound = await fetchInbound(
      apiKey,
      reg,
      dep.airport.iata,
      dep.scheduledTime.utc,
      date,
    ).catch(() => null);
  }

  return Response.json({
    aircraft: reg ? { reg, model: leg.aircraft?.model ?? null } : null,
    inbound,
    flight,
    date,
    status: leg.status ?? 'unknown',
    landed,
    delayMinutes,
    distanceKm: leg.greatCircleDistance?.km ?? null,
    carrier: { name: leg.airline?.name ?? carrier.name, iata: leg.airline?.iata ?? carrier.iata },
    carrierCountry: carrier.country,
    from: { code: dep.airport?.iata, country: dep.airport?.countryCode },
    to: { code: arr.airport?.iata, country: arr.airport?.countryCode },
    scheduledDeparture: toIso(dep.scheduledTime?.utc),
    scheduledArrival: toIso(arr.scheduledTime?.utc),
    gate: dep.gate ?? null,
    terminal: dep.terminal ?? null,
    checkInDesk: dep.checkInDesk ?? null,
    baggageBelt: arr.baggageBelt ?? null,
    // AeroDataBox has no separate boarding time; the widget derives one.
    boardingTime: null,
    estimatedDeparture: toIso(dep.predictedTime?.utc ?? dep.revisedTime?.utc),
    actualDeparture: toIso(dep.actualTime?.utc ?? dep.runwayTime?.utc),
    estimatedArrival: toIso(arr.predictedTime?.utc ?? arr.revisedTime?.utc),
    actualArrival: toIso(actualArrival),
  });
}
