/** AeroDataBox fetch + normalizer for the poll chain. Mirrors the EAS
 * Hosting route (src/app/api/flight-status+api.ts) but runs inside Convex
 * actions with its own AERODATABOX_API_KEY env var — the hosting route is
 * unauthenticated and would add a public hop. Missing key → null, so dev
 * deployments degrade to traveler-written facts only. */

declare const process: { env: Record<string, string | undefined> };

export interface FlightFactsPatch {
  flightStatus: string | null;
  delayMinutes: number | null;
  gate: string | null;
  terminal: string | null;
  baggageBelt: string | null;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
}

const toIso = (s: string | undefined): string | null => (s ? s.replace(' ', 'T') : null);

export async function fetchFlightFacts(
  flight: string,
  date: string,
): Promise<FlightFactsPatch | null> {
  const apiKey = process.env.AERODATABOX_API_KEY;
  if (!apiKey || !flight || !date) return null;

  const upstream = await fetch(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flight)}/${date}`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
    },
  );
  if (!upstream.ok) return null;

  const legs: any[] = await upstream.json().catch(() => null);
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const leg = legs[0];

  const scheduled = leg.arrival?.scheduledTime?.utc;
  const actual = leg.arrival?.actualTime?.utc ?? leg.arrival?.predictedTime?.utc;
  const delayMinutes =
    scheduled && actual
      ? Math.max(0, Math.round((Date.parse(actual) - Date.parse(scheduled)) / 60000))
      : null;

  return {
    flightStatus: leg.status ?? null,
    delayMinutes,
    gate: leg.departure?.gate ?? null,
    terminal: leg.departure?.terminal ?? null,
    baggageBelt: leg.arrival?.baggageBelt ?? null,
    estimatedDeparture: toIso(leg.departure?.predictedTime?.utc),
    actualDeparture: toIso(leg.departure?.actualTime?.utc),
    estimatedArrival: toIso(leg.arrival?.predictedTime?.utc),
    actualArrival: toIso(leg.arrival?.actualTime?.utc),
  };
}
