import type { Disruption, Journey } from '@/rules/types';

/** Data-free showcase journey: powers "See a demo verdict" on the journeys
 * list, the journey-detail fallback, and the claim wizard's demo path — the
 * whole verdict → claim flow works without adding a real trip. */
export const DEMO_JOURNEY: Journey = {
  id: 'demo',
  mode: 'flight',
  carrier: 'Lufthansa',
  carrierCountry: 'DE',
  number: 'LH873',
  from: { code: 'HEL', country: 'FI' },
  to: { code: 'FRA', country: 'DE' },
  distanceKm: 1530,
  scheduledDeparture: '2026-08-10T08:00:00Z',
  scheduledArrival: '2026-08-10T10:30:00Z',
};

export const DEMO_DISRUPTION: Disruption = { type: 'delay', delayMinutes: 195 };

export const isDemoJourneyId = (id: string | undefined) => !id || id === 'demo';
