// Web build — same static-fallback pattern as journeys.web.ts. The web app
// never adds a trip, so the default is a constant and nothing is stored.

import type { TripVisibility } from '@/services/trip-visibility';

export function getDefaultTripVisibility(): TripVisibility {
  return 'circle';
}

export function setDefaultTripVisibility(_value: TripVisibility) {}
