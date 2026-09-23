/** Free lookup responses are itinerary data, with final historical arrival
 * facts for manual eligibility checks. Never expose live fields from a paid
 * cache entry through the free add-flight endpoint. */
export function freeFlightDetails(facts: { flight?: unknown; date?: unknown; from?: unknown; to?: unknown; carrier?: unknown; carrierCountry?: unknown; distanceKm?: unknown; scheduledDeparture?: unknown; scheduledArrival?: unknown; actualArrival?: unknown; actualDeparture?: unknown; landed?: unknown; delayMinutes?: unknown }, now = Date.now()) {
  const arrival = typeof facts.actualArrival === 'string' ? Date.parse(facts.actualArrival) : NaN;
  const final = facts.landed === true && Number.isFinite(arrival) && arrival <= now;
  return {
    flight: facts.flight,
    date: facts.date,
    from: facts.from,
    to: facts.to,
    carrier: facts.carrier,
    carrierCountry: facts.carrierCountry,
    distanceKm: facts.distanceKm,
    scheduledDeparture: facts.scheduledDeparture,
    scheduledArrival: facts.scheduledArrival,
    status: final ? 'arrived' : 'scheduled',
    landed: final,
    delayMinutes: final ? facts.delayMinutes : null,
    actualDeparture: final ? facts.actualDeparture : null,
    actualArrival: final ? facts.actualArrival : null,
  };
}
