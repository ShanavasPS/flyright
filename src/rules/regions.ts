/** EU27 + EU261 also covers EEA states (IS, NO, LI) and applies via agreement to CH departures on EU carriers is murkier — kept out for now. */
const EU_MEMBERS = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'NO', 'LI',
]);

export const isEU = (country: string) => EU_MEMBERS.has(country);
export const isUK = (country: string) => country === 'GB';
