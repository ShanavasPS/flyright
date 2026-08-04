/** Client for GET /api/flight-status. Relative fetch resolves against the dev
 * server in development and the expo-router `origin` in production builds. */

export interface FlightStatus {
  flight: string;
  date: string;
  status: string;
  delayMinutes: number | null;
  distanceKm: number | null;
  carrier: { name: string; iata: string };
  carrierCountry: string;
  from: { code: string | null; country: string | null };
  to: { code: string | null; country: string | null };
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
}

export class FlightLookupError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FlightLookupError';
  }
}

/** IATA flight designator: 2-char airline code + 1–4 digits (+ optional suffix). */
const FLIGHT_NUMBER = /^([A-Z]{2}|[A-Z]\d|\d[A-Z])\d{1,4}[A-Z]?$/;

export function normalizeFlightNumber(input: string): string | null {
  const compact = input.toUpperCase().replace(/\s/g, '');
  return FLIGHT_NUMBER.test(compact) ? compact : null;
}

export async function lookupFlight(flight: string, date: string): Promise<FlightStatus> {
  const response = await fetch(
    `/api/flight-status?flight=${encodeURIComponent(flight)}&date=${encodeURIComponent(date)}`,
  );

  if (!response.ok) {
    const message =
      response.status === 404
        ? 'No flight found for that number and day.'
        : response.status === 501
          ? 'Flight lookup is not configured yet.'
          : 'Flight lookup failed — try again.';
    throw new FlightLookupError(message, response.status);
  }

  return response.json();
}
