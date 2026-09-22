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
export const isIntraEU = (from: string, to: string) => {
  const inEU = (c: string) => EU_MEMBERS.has(c) || OUTERMOST_REGIONS.has(c);
  return inEU(from) && inEU(to);
};
export const isUK = (country: string) => country === 'GB';
