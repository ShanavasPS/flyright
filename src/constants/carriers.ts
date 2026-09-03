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
  W6: { name: 'Wizz Air', country: 'HU' },
  DY: { name: 'Norwegian', country: 'NO' },
  EW: { name: 'Eurowings', country: 'DE' },
  OS: { name: 'Austrian Airlines', country: 'AT' },
  SN: { name: 'Brussels Airlines', country: 'BE' },
  EI: { name: 'Aer Lingus', country: 'IE' },
  VY: { name: 'Vueling', country: 'ES' },
  AZ: { name: 'ITA Airways', country: 'IT' },
  LO: { name: 'LOT Polish Airlines', country: 'PL' },
  A3: { name: 'Aegean Airlines', country: 'GR' },
  TK: { name: 'Turkish Airlines', country: 'TR' },
  FI: { name: 'Icelandair', country: 'IS' },
  EK: { name: 'Emirates', country: 'AE' },
  QR: { name: 'Qatar Airways', country: 'QA' },
  VS: { name: 'Virgin Atlantic', country: 'GB' },
  DL: { name: 'Delta Air Lines', country: 'US' },
  UA: { name: 'United Airlines', country: 'US' },
  AA: { name: 'American Airlines', country: 'US' },
  AC: { name: 'Air Canada', country: 'CA' },
  PC: { name: 'Pegasus Airlines', country: 'TR' },
  HV: { name: 'Transavia', country: 'NL' },
  X3: { name: 'TUI fly', country: 'DE' },
  BY: { name: 'TUI Airways', country: 'GB' },
  DE: { name: 'Condor', country: 'DE' },
  BT: { name: 'airBaltic', country: 'LV' },
  UX: { name: 'Air Europa', country: 'ES' },
  OU: { name: 'Croatia Airlines', country: 'HR' },
  V7: { name: 'Volotea', country: 'ES' },
  LG: { name: 'Luxair', country: 'LU' },
  EY: { name: 'Etihad Airways', country: 'AE' },
};

export function carrierFor(flight: string) {
  const prefix = flight.slice(0, 2).toUpperCase();
  return { iata: prefix, ...(CARRIERS[prefix] ?? { name: prefix, country: '' }) };
}
