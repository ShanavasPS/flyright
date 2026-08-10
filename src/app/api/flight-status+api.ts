/**
 * GET /api/flight-status?flight=LH873&date=2026-08-10
 *
 * Proxies AeroDataBox so the API key stays server-side. Deployed with
 * EAS Hosting; set AERODATABOX_API_KEY in the hosting environment.
 * The provider is swappable here without an app-store release.
 *
 * In development with no key set, returns a deterministic mock so the
 * add-flight flow and E2E tests work offline (see mockLeg below).
 */

/** Operating-carrier country by IATA prefix — EU261's carrier test needs it and
 * flight-data providers don't return it. Unknown prefixes fall back to ''. */
const CARRIERS: Record<string, { name: string; country: string }> = {
  AY: { name: 'Finnair', country: 'FI' },
  LH: { name: 'Lufthansa', country: 'DE' },
  BA: { name: 'British Airways', country: 'GB' },
  AF: { name: 'Air France', country: 'FR' },
  KL: { name: 'KLM', country: 'NL' },
  FR: { name: 'Ryanair', country: 'IE' },
  U2: { name: 'easyJet', country: 'GB' },
  SK: { name: 'SAS', country: 'SE' },
  LX: { name: 'Swiss', country: 'CH' },
  IB: { name: 'Iberia', country: 'ES' },
  TP: { name: 'TAP Air Portugal', country: 'PT' },
};

function carrierFor(flight: string) {
  const prefix = flight.slice(0, 2).toUpperCase();
  return { iata: prefix, ...(CARRIERS[prefix] ?? { name: prefix, country: '' }) };
}

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
  const isPast = date < new Date().toISOString().slice(0, 10);
  const delayMinutes = isPast ? (digits % 2 === 1 ? 195 : 0) : null;

  return {
    flight,
    date,
    status: !isPast ? 'scheduled' : delayMinutes ? 'delayed' : 'arrived',
    delayMinutes,
    distanceKm: 1531,
    carrier: { name: carrier.name, iata: carrier.iata },
    carrierCountry: carrier.country,
    from: { code: 'HEL', country: 'FI' },
    to: { code: 'FRA', country: 'DE' },
    scheduledDeparture: `${date}T08:00Z`,
    scheduledArrival: `${date}T10:35Z`,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const flight = url.searchParams.get('flight')?.toUpperCase().replace(/\s/g, '');
  const date = url.searchParams.get('date');

  if (!flight || !date) {
    return Response.json({ error: 'flight and date are required' }, { status: 400 });
  }

  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[flight-status] no AERODATABOX_API_KEY — serving mock data');
      return Response.json(mockLeg(flight, date));
    }
    return Response.json(
      { error: 'flight data provider not configured' },
      { status: 501 },
    );
  }

  const upstream = await fetch(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flight)}/${date}`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
    },
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

  // Normalize to the shape the app's rules engine needs — nothing more.
  const leg = legs[0];
  const scheduled = leg.arrival?.scheduledTime?.utc;
  const actual = leg.arrival?.actualTime?.utc ?? leg.arrival?.predictedTime?.utc;
  const delayMinutes =
    scheduled && actual
      ? Math.max(0, Math.round((Date.parse(actual) - Date.parse(scheduled)) / 60000))
      : null;
  const carrier = carrierFor(flight);

  return Response.json({
    flight,
    date,
    status: leg.status ?? 'unknown',
    delayMinutes,
    distanceKm: leg.greatCircleDistance?.km ?? null,
    carrier: { name: leg.airline?.name ?? carrier.name, iata: leg.airline?.iata ?? carrier.iata },
    carrierCountry: carrier.country,
    from: { code: leg.departure?.airport?.iata, country: leg.departure?.airport?.countryCode },
    to: { code: leg.arrival?.airport?.iata, country: leg.arrival?.airport?.countryCode },
    scheduledDeparture: toIso(leg.departure?.scheduledTime?.utc),
    scheduledArrival: toIso(leg.arrival?.scheduledTime?.utc),
  });
}
