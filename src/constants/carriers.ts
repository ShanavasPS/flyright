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
  // Non-EU majors: no EU261 carrier test to pass, but their designators still
  // need recognising on scanned passes and shared receipts, and their names
  // on manual/imported rows.
  AS: { name: 'Alaska Airlines', country: 'US' },
  B6: { name: 'JetBlue', country: 'US' },
  WN: { name: 'Southwest Airlines', country: 'US' },
  NK: { name: 'Spirit Airlines', country: 'US' },
  F9: { name: 'Frontier Airlines', country: 'US' },
  HA: { name: 'Hawaiian Airlines', country: 'US' },
  WS: { name: 'WestJet', country: 'CA' },
  QF: { name: 'Qantas', country: 'AU' },
  NZ: { name: 'Air New Zealand', country: 'NZ' },
  SQ: { name: 'Singapore Airlines', country: 'SG' },
  CX: { name: 'Cathay Pacific', country: 'HK' },
  JL: { name: 'Japan Airlines', country: 'JP' },
  NH: { name: 'ANA', country: 'JP' },
  KE: { name: 'Korean Air', country: 'KR' },
  OZ: { name: 'Asiana Airlines', country: 'KR' },
  AI: { name: 'Air India', country: 'IN' },
  '6E': { name: 'IndiGo', country: 'IN' },
  TG: { name: 'Thai Airways', country: 'TH' },
  MH: { name: 'Malaysia Airlines', country: 'MY' },
  GA: { name: 'Garuda Indonesia', country: 'ID' },
  VN: { name: 'Vietnam Airlines', country: 'VN' },
  CA: { name: 'Air China', country: 'CN' },
  MU: { name: 'China Eastern', country: 'CN' },
  CZ: { name: 'China Southern', country: 'CN' },
  ET: { name: 'Ethiopian Airlines', country: 'ET' },
  MS: { name: 'EgyptAir', country: 'EG' },
  SV: { name: 'Saudia', country: 'SA' },
  GF: { name: 'Gulf Air', country: 'BH' },
  WY: { name: 'Oman Air', country: 'OM' },
  RJ: { name: 'Royal Jordanian', country: 'JO' },
  LY: { name: 'El Al', country: 'IL' },
  LA: { name: 'LATAM Airlines', country: 'CL' },
  AM: { name: 'Aeroméxico', country: 'MX' },
  CM: { name: 'Copa Airlines', country: 'PA' },
  AV: { name: 'Avianca', country: 'CO' },
  // Regional operators that fly under a major's number ("Operated by: HORIZON
  // AIR" on a Qatar-sold ticket). EU261 judges the operating carrier, so the
  // import records these, not the marketing airline, on codeshare legs.
  QX: { name: 'Horizon Air', country: 'US' },
  OO: { name: 'SkyWest Airlines', country: 'US' },
  MQ: { name: 'Envoy Air', country: 'US' },
  YX: { name: 'Republic Airways', country: 'US' },
  CL: { name: 'Lufthansa CityLine', country: 'DE' },
  WA: { name: 'KLM Cityhopper', country: 'NL' },
  CJ: { name: 'BA CityFlyer', country: 'GB' },
  EN: { name: 'Air Dolomiti', country: 'IT' },
  N7: { name: 'Nordic Regional Airlines', country: 'FI' },
};

/** Regional operators → the brand they fly under. Null means "whoever sold
 * the ticket": SkyWest and Republic fly as Delta Connection, United Express
 * or American Eagle depending on the leg, so the marketing carrier is the
 * brand. Codes not listed here are their own brand. */
const BRAND_OF_OPERATOR: Record<string, string | null> = {
  QX: 'AS',
  MQ: 'AA',
  CL: 'LH',
  EN: 'LH',
  WA: 'KL',
  CJ: 'BA',
  N7: 'AY',
  OO: null,
  YX: null,
};

/** Brand names as they appear after "as" in the disclosure line ("operated by
 * Horizon Air as AlaskaHorizon"), normalised, → the brand's carrier code. */
const BRAND_ALIASES: Record<string, string> = {
  ALASKAHORIZON: 'AS',
  ALASKASKYWEST: 'AS',
  'DELTA CONNECTION': 'DL',
  'UNITED': 'UA',
  'AMERICAN EAGLE': 'AA',
  'LUFTHANSA REGIONAL': 'LH',
  'KLM CITYHOPPER': 'KL',
  'BA CITYFLYER': 'BA',
  'AIR FRANCE HOP': 'AF',
  HOP: 'AF',
  'IBERIA REGIONAL': 'IB',
  'AUSTRIAN': 'OS',
  'SWISS': 'LX',
  'SAS LINK': 'SK',
  'SAS CONNECT': 'SK',
};

/**
 * The airline a passenger experiences on a leg, from the disclosure line
 * airlines must print: "operated by <corporate name> as <brand>" (US DOT
 * form) or just "operated by <corporate name>" (EU 2111/2005 form).
 *
 *  - A brand after "as" wins ("HORIZON AIR AS ALASKAHORIZON" → Alaska).
 *  - Otherwise a regional's parent brand (Horizon → Alaska, CityLine →
 *    Lufthansa); regionals that fly for several majors resolve to whoever
 *    sold the ticket (`marketing`).
 *  - Anything else is its own brand.
 *
 * Null when the text names no carrier we know.
 */
export function operatingBrand(disclosure: string, marketing: string | null): string | null {
  const text = disclosure.replace(/\s+/g, ' ').trim();
  const asBrand = /\s+(?:AS|D\/?B\/?A|DBA)\s+(.+)$/i.exec(text);
  if (asBrand) {
    const brand = brandCodeForName(asBrand[1]) ?? carrierCodeForName(asBrand[1]);
    if (brand) return brand;
  }
  const corporate = carrierCodeForName(asBrand ? text.slice(0, asBrand.index) : text);
  if (!corporate) return null;
  if (!(corporate in BRAND_OF_OPERATOR)) return corporate;
  return BRAND_OF_OPERATOR[corporate] ?? marketing;
}

function brandCodeForName(name: string): string | null {
  const target = normalizeCarrierName(name);
  for (const [alias, code] of Object.entries(BRAND_ALIASES)) {
    const known = normalizeCarrierName(alias);
    if (target === known || target.startsWith(`${known} `)) return code;
  }
  return null;
}

/** "Horizon Air" / "HORIZON AIR AS ALASKAHORIZON" / "Alaska" → the carrier
 * code, matched on the name with the generic airline words stripped. Null
 * when no known carrier fits — callers fall back to the flight prefix. */
export function carrierCodeForName(name: string | null | undefined): string | null {
  if (!name) return null;
  const target = normalizeCarrierName(name);
  if (target.length < 3) return null;
  let best: { code: string; length: number } | null = null;
  for (const [code, carrier] of Object.entries(CARRIERS)) {
    const known = normalizeCarrierName(carrier.name);
    if (known.length < 3) continue;
    // Exact, or the document text starts with the known name ("HORIZON AIR AS
    // ALASKAHORIZON"). Not the reverse: "Lufthansa" must not become CityLine.
    const fits = target === known || target.startsWith(`${known} `);
    if (fits && (!best || known.length > best.length)) best = { code, length: known.length };
  }
  return best?.code ?? null;
}

function normalizeCarrierName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(AIRLINES?|AIRWAYS|AIR LINES|AIR|AVIATION|FLY|EXPRESS|INTERNATIONAL|THE)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function carrierFor(flight: string) {
  const prefix = flight.slice(0, 2).toUpperCase();
  return { iata: prefix, ...(CARRIERS[prefix] ?? { name: prefix, country: '' }) };
}
