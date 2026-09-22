/** EU27 + EU261 also covers EEA states (IS, NO, LI) and applies via agreement to CH departures on EU carriers is murkier — kept out for now. */
const EU_MEMBERS = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'NO', 'LI',
]);

export const isEU = (country: string) => EU_MEMBERS.has(country);

/** The EU's outermost regions that carry their own ISO codes (Art. 349/355
 * TFEU): EU territory, so a flight between one of them and the rest of the
 * EU is intra-Community. The Canaries, Madeira and the Azores need no entry —
 * they are coded ES and PT. */
const OUTERMOST_REGIONS = new Set(['GP', 'MQ', 'GF', 'RE', 'YT', 'MF']);

/** Both ends in the EU/EEA, outermost regions included — the flights that
 * EU261 Art. 7(1)(b) caps at €400 however far they go (Paris–Réunion,
 * Helsinki–Tenerife). */
export const isIntraEU = (from: string, to: string) => isEUTerritory(from) && isEUTerritory(to);

/** An airport in the territory EU261 covers: the EU/EEA plus the outermost
 * regions. Airports, not airlines — a carrier's country stays `isEU`. */
export const isEUTerritory = (country: string) => EU_MEMBERS.has(country) || OUTERMOST_REGIONS.has(country);

/** The state whose enforcement body answers for an airport: the outermost
 * regions are France's (DGAC), everything else its own country. */
export const enforcementState = (country: string) => (OUTERMOST_REGIONS.has(country) ? 'FR' : country);
export const isUK = (country: string) => country === 'GB';
