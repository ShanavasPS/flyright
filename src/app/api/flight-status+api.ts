/**
 * GET /api/flight-status?flight=LH873&date=2026-08-10
 *
 * Proxies AeroDataBox so the API key stays server-side. Deployed with
 * EAS Hosting; set AERODATABOX_API_KEY in the hosting environment.
 * The provider is swappable here without an app-store release.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const flight = url.searchParams.get('flight');
  const date = url.searchParams.get('date');

  if (!flight || !date) {
    return Response.json({ error: 'flight and date are required' }, { status: 400 });
  }

  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey) {
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

  if (!upstream.ok) {
    return Response.json({ error: 'upstream error' }, { status: 502 });
  }

  const legs: any[] = await upstream.json();
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

  return Response.json({
    flight,
    date,
    status: leg.status ?? 'unknown',
    delayMinutes,
    distanceKm: leg.greatCircleDistance?.km ?? null,
    from: { code: leg.departure?.airport?.iata, country: leg.departure?.airport?.countryCode },
    to: { code: leg.arrival?.airport?.iata, country: leg.arrival?.airport?.countryCode },
  });
}
