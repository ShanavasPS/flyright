/** Operating-carrier country by IATA prefix — EU261's carrier test needs it and
 * flight-data providers don't return it. Unknown prefixes fall back to '', which
 * the rules engine treats conservatively (isEU('') is false).
 * Shared by the flight-status API route and the manual trip-entry form. */
export const CARRIERS: Record<string, { name: string; country: string }> = {
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

export function carrierFor(flight: string) {
  const prefix = flight.slice(0, 2).toUpperCase();
  return { iata: prefix, ...(CARRIERS[prefix] ?? { name: prefix, country: '' }) };
}
