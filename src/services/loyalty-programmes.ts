/** Frequent flyer programmes FlyRight knows by name (docs/memberships.md):
 * which airlines earn in each, what the balance and the status credit are
 * called, the tier ladder, and how a card looks. Pure data and pure
 * functions — the traveller's own memberships live in the local
 * `memberships` table (services/memberships).
 *
 * Tier thresholds are given only where the programme publishes one simple
 * number per tier; the traveller can always type their own target, which
 * wins. Nothing here is fetched from an airline. */

export type Alliance = 'oneworld' | 'Star Alliance' | 'SkyTeam';

/** The alliance-wide status a programme tier carries, which is what an
 * alliance lounge desk honours: oneworld Ruby, Sapphire and Emerald, Star
 * Alliance Silver and Gold, SkyTeam Elite and Elite Plus. */
export type AllianceLevel = 'ruby' | 'sapphire' | 'emerald' | 'star-silver' | 'star-gold' | 'elite' | 'elite-plus';

/** One rung of a programme's ladder. */
export interface Tier {
  name: string;
  /** Status credit to reach it, in statusUnit; null where there is no
   *  single published number. */
  threshold: number | null;
  /** The alliance status it carries, as of 2026; absent for the entry tier
   *  and for programmes outside an alliance. */
  level?: AllianceLevel;
}

export interface LoyaltyProgramme {
  id: string;
  /** The airline as printed on the card, e.g. "Qatar Airways". */
  airline: string;
  /** How a one-line summary names it: "Qatar Gold · Emirates Silver". */
  short: string;
  /** The programme's own name, e.g. "Privilege Club". */
  name: string;
  alliance: Alliance | null;
  /** IATA codes whose flights earn here directly (the programme's own
   *  airlines). Alliance partners come from ALLIANCES. */
  carriers: string[];
  /** What the redeemable balance is called ("Avios", "Miles"). */
  currency: string;
  /** What status is counted in ("Qpoints", "tier miles"); null when the
   *  programme has no single status credit. */
  statusUnit: string | null;
  /** Tier ladder from the entry tier up. */
  tiers: Tier[];
  /** Card colours: the two gradient stops and the stripe. */
  card: { from: string; to: string; accent: string };
}

/** Alliance members by IATA code, as of 2026. Used for "can earn" hints and
 * the smart tip only, never to promise an amount. */
export const ALLIANCES: Record<Alliance, string[]> = {
  oneworld: ['AA', 'AS', 'AY', 'BA', 'CX', 'FJ', 'IB', 'JL', 'MH', 'QF', 'QR', 'RJ', 'UL', 'WY', 'AT'],
  'Star Alliance': [
    'A3', 'AC', 'AI', 'AV', 'BR', 'CA', 'CM', 'ET', 'LH', 'LO', 'LX', 'MS', 'NH', 'NZ', 'OS', 'OU', 'OZ',
    'SA', 'SN', 'SQ', 'TG', 'TK', 'TP', 'UA', 'ZH',
  ],
  SkyTeam: ['AF', 'AM', 'AR', 'CI', 'DL', 'GA', 'KE', 'KL', 'KQ', 'ME', 'MF', 'MU', 'RO', 'SK', 'SV', 'UX', 'VN', 'VS'],
};

const GOLD = { from: '#2A2238', to: '#3A2536', accent: '#B0657F' };

export const PROGRAMMES: LoyaltyProgramme[] = [
  {
    id: 'qr',
    short: 'Qatar',
    airline: 'Qatar Airways',
    name: 'Privilege Club',
    alliance: 'oneworld',
    carriers: ['QR'],
    currency: 'Avios',
    statusUnit: 'Qpoints',
    tiers: [
      { name: 'Burgundy', threshold: null },
      { name: 'Silver', threshold: 150, level: 'ruby' },
      { name: 'Gold', threshold: 300, level: 'sapphire' },
      { name: 'Platinum', threshold: 600, level: 'emerald' },
    ],
    card: GOLD,
  },
  {
    id: 'ek',
    short: 'Emirates',
    airline: 'Emirates',
    name: 'Skywards',
    alliance: null,
    carriers: ['EK', 'FZ'],
    currency: 'Skywards Miles',
    statusUnit: 'tier miles',
    tiers: [
      { name: 'Blue', threshold: null },
      { name: 'Silver', threshold: 25000 },
      { name: 'Gold', threshold: 50000 },
      { name: 'Platinum', threshold: 150000 },
    ],
    card: { from: '#2A2534', to: '#3A2A2E', accent: '#C27A6E' },
  },
  {
    id: 'ay',
    short: 'Finnair',
    airline: 'Finnair',
    name: 'Finnair Plus',
    alliance: 'oneworld',
    carriers: ['AY'],
    currency: 'Avios',
    statusUnit: 'tier points',
    tiers: [
      { name: 'Basic', threshold: null },
      { name: 'Silver', threshold: null, level: 'ruby' },
      { name: 'Gold', threshold: null, level: 'sapphire' },
      { name: 'Platinum', threshold: null, level: 'emerald' },
      { name: 'Platinum Lumo', threshold: null, level: 'emerald' },
    ],
    card: { from: '#14284A', to: '#1C3A66', accent: '#7FA8F0' },
  },
  {
    id: 'ba',
    short: 'BA',
    airline: 'British Airways',
    name: 'The British Airways Club',
    alliance: 'oneworld',
    carriers: ['BA'],
    currency: 'Avios',
    statusUnit: 'Tier Points',
    tiers: [
      { name: 'Blue', threshold: null },
      { name: 'Bronze', threshold: 3500, level: 'ruby' },
      { name: 'Silver', threshold: 7500, level: 'sapphire' },
      { name: 'Gold', threshold: 20000, level: 'emerald' },
    ],
    card: { from: '#1A2440', to: '#26304F', accent: '#C9A0A6' },
  },
  {
    id: 'aa',
    short: 'American',
    airline: 'American Airlines',
    name: 'AAdvantage',
    alliance: 'oneworld',
    carriers: ['AA'],
    currency: 'Miles',
    statusUnit: 'Loyalty Points',
    tiers: [
      { name: 'Member', threshold: null },
      { name: 'Gold', threshold: 40000, level: 'ruby' },
      { name: 'Platinum', threshold: 75000, level: 'sapphire' },
      { name: 'Platinum Pro', threshold: 125000, level: 'emerald' },
      { name: 'Executive Platinum', threshold: 200000, level: 'emerald' },
    ],
    card: { from: '#1E2A40', to: '#2C3A52', accent: '#9FB3C8' },
  },
  {
    id: 'lh',
    short: 'Miles & More',
    airline: 'Lufthansa Group',
    name: 'Miles & More',
    alliance: 'Star Alliance',
    carriers: ['LH', 'LX', 'OS', 'SN', 'EW', 'EN', 'WK'],
    currency: 'Miles',
    statusUnit: 'Points',
    tiers: [
      { name: 'Member', threshold: null },
      { name: 'Frequent Traveller', threshold: 650, level: 'star-silver' },
      { name: 'Senator', threshold: 2000, level: 'star-gold' },
      { name: 'HON Circle', threshold: 6000, level: 'star-gold' },
    ],
    card: { from: '#1A2238', to: '#28324E', accent: '#E9CF9A' },
  },
  {
    id: 'ua',
    short: 'United',
    airline: 'United',
    name: 'MileagePlus',
    alliance: 'Star Alliance',
    carriers: ['UA'],
    currency: 'Miles',
    statusUnit: 'PQP',
    tiers: [
      { name: 'Member', threshold: null },
      { name: 'Premier Silver', threshold: null, level: 'star-silver' },
      { name: 'Premier Gold', threshold: null, level: 'star-gold' },
      { name: 'Premier Platinum', threshold: null, level: 'star-gold' },
      { name: 'Premier 1K', threshold: null, level: 'star-gold' },
    ],
    card: { from: '#1A2A4A', to: '#22385E', accent: '#6F9DF0' },
  },
  {
    id: 'sq',
    short: 'KrisFlyer',
    airline: 'Singapore Airlines',
    name: 'KrisFlyer',
    alliance: 'Star Alliance',
    carriers: ['SQ', 'TR'],
    currency: 'KrisFlyer miles',
    statusUnit: 'Elite miles',
    tiers: [
      { name: 'KrisFlyer', threshold: null },
      { name: 'Elite Silver', threshold: 25000, level: 'star-silver' },
      { name: 'Elite Gold', threshold: 50000, level: 'star-gold' },
    ],
    card: { from: '#2A2A1E', to: '#3A3424', accent: '#D9B866' },
  },
  {
    id: 'tk',
    short: 'Turkish',
    airline: 'Turkish Airlines',
    name: 'Miles&Smiles',
    alliance: 'Star Alliance',
    carriers: ['TK'],
    currency: 'Miles',
    statusUnit: 'status miles',
    tiers: [
      { name: 'Classic', threshold: null },
      { name: 'Classic Plus', threshold: null, level: 'star-silver' },
      { name: 'Elite', threshold: null, level: 'star-gold' },
      { name: 'Elite Plus', threshold: null, level: 'star-gold' },
    ],
    card: { from: '#33202A', to: '#432630', accent: '#E07A7A' },
  },
  {
    id: 'fb',
    short: 'Flying Blue',
    airline: 'Air France–KLM',
    name: 'Flying Blue',
    alliance: 'SkyTeam',
    carriers: ['AF', 'KL', 'HV', 'TO'],
    currency: 'Miles',
    statusUnit: 'XP',
    tiers: [
      { name: 'Explorer', threshold: null },
      { name: 'Silver', threshold: 100, level: 'elite' },
      { name: 'Gold', threshold: 180, level: 'elite-plus' },
      { name: 'Platinum', threshold: 300, level: 'elite-plus' },
    ],
    card: { from: '#142A4A', to: '#1A3A62', accent: '#5FA8E8' },
  },
  {
    id: 'dl',
    short: 'Delta',
    airline: 'Delta',
    name: 'SkyMiles',
    alliance: 'SkyTeam',
    carriers: ['DL'],
    currency: 'Miles',
    statusUnit: 'MQDs',
    tiers: [
      { name: 'Member', threshold: null },
      { name: 'Silver Medallion', threshold: 5000, level: 'elite' },
      { name: 'Gold Medallion', threshold: 10000, level: 'elite-plus' },
      { name: 'Platinum Medallion', threshold: 15000, level: 'elite-plus' },
      { name: 'Diamond Medallion', threshold: 28000, level: 'elite-plus' },
    ],
    card: { from: '#2A1E2E', to: '#3A2236', accent: '#D0627A' },
  },
  {
    id: 'sk',
    short: 'SAS',
    airline: 'SAS',
    name: 'EuroBonus',
    alliance: 'SkyTeam',
    carriers: ['SK'],
    currency: 'Points',
    statusUnit: 'level points',
    tiers: [
      { name: 'Member', threshold: null },
      { name: 'Silver', threshold: null, level: 'elite' },
      { name: 'Gold', threshold: null, level: 'elite-plus' },
      { name: 'Diamond', threshold: null, level: 'elite-plus' },
    ],
    card: { from: '#16243E', to: '#203252', accent: '#8FB4E6' },
  },
  {
    id: 'ey',
    short: 'Etihad',
    airline: 'Etihad',
    name: 'Etihad Guest',
    alliance: null,
    carriers: ['EY'],
    currency: 'Etihad Guest Miles',
    statusUnit: 'tier points',
    tiers: [
      { name: 'Bronze', threshold: null },
      { name: 'Silver', threshold: null },
      { name: 'Gold', threshold: null },
      { name: 'Platinum', threshold: null },
    ],
    card: { from: '#2A2620', to: '#3A3226', accent: '#C9A86A' },
  },
];

/** A programme the catalogue does not list: the traveller names it. */
export const OTHER_PROGRAMME = 'other';

const OTHER_CARD = { from: '#1B2740', to: '#243352', accent: '#8796AF' };

export function programmeById(id: string): LoyaltyProgramme | undefined {
  return PROGRAMMES.find((p) => p.id === id);
}

/** What a membership row needs for its card and hints. */
export interface MembershipLike {
  id: string;
  programme: string;
  customAirline: string | null;
  customProgramme: string | null;
  number: string;
  tier: string | null;
  balance: number | null;
  qualifying: number | null;
  qualifyingTarget: number | null;
  tierUntil: string | null;
  expiringAmount: number | null;
  expiringOn: string | null;
}

/** The airline, programme name, units and colours a card shows, for a
 * catalogue programme or one the traveller named. */
export function describeMembership(m: MembershipLike) {
  const p = programmeById(m.programme);
  return {
    airline: p?.airline ?? m.customAirline?.trim() ?? 'Airline',
    short: p?.short ?? m.customAirline?.trim() ?? m.customProgramme?.trim() ?? 'Membership',
    name: p?.name ?? m.customProgramme?.trim() ?? 'Membership',
    currency: p?.currency ?? 'Points',
    statusUnit: p?.statusUnit ?? null,
    alliance: p?.alliance ?? null,
    card: p?.card ?? OTHER_CARD,
  };
}

/** The alliance status a membership's tier carries, or null: no tier, a
 * programme outside an alliance, or a tier the catalogue doesn't know. */
export function allianceLevelOf(m: Pick<MembershipLike, 'programme' | 'tier'>): AllianceLevel | null {
  if (!m.tier) return null;
  const tier = programmeById(m.programme)?.tiers.find((t) => t.name.toLowerCase() === m.tier!.trim().toLowerCase());
  return tier?.level ?? null;
}

/** The tier above the one held, where the ladder knows it. */
export function nextTier(m: MembershipLike): Tier | null {
  const p = programmeById(m.programme);
  if (!p) return null;
  const at = m.tier ? p.tiers.findIndex((t) => t.name.toLowerCase() === m.tier!.toLowerCase()) : 0;
  return at >= 0 && at + 1 < p.tiers.length ? p.tiers[at + 1] : null;
}

/** "412 / 600 Qpoints" and "to Platinum" with a 0–1 fraction, or null when
 * the traveller has not given a balance of status credit, or there is no
 * target to measure it against. The typed target wins over the catalogue's. */
export function tierProgress(m: MembershipLike) {
  if (m.qualifying == null) return null;
  const next = nextTier(m);
  const target = m.qualifyingTarget ?? next?.threshold ?? null;
  if (!target || target <= 0) return null;
  const unit = describeMembership(m).statusUnit ?? 'points';
  return {
    text: `${formatCount(m.qualifying)} / ${formatCount(target)} ${unit}`,
    next: next ? `to ${next.name}` : null,
    fraction: Math.max(0, Math.min(1, m.qualifying / target)),
  };
}

/** "Gold until Mar 2027", "Gold", or null for no tier. */
export function tierLine(m: MembershipLike): string | null {
  if (!m.tier) return null;
  const until = monthLabel(m.tierUntil);
  return until ? `${m.tier} until ${until}` : m.tier;
}

/** "4 000 miles expire on 31 Dec 2026", or null. */
export function expiryLine(m: MembershipLike): string | null {
  if (!m.expiringAmount || !m.expiringOn) return null;
  const date = new Date(`${m.expiringOn}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  // "miles" and "points" are common nouns; Avios and Skywards Miles are names.
  const currency = describeMembership(m).currency;
  const unit = /^(Miles|Points)$/.test(currency) ? currency.toLowerCase() : currency;
  return `${formatCount(m.expiringAmount)} ${unit} expire on ${day}`;
}

/** "•••• 4821": the last four characters of the number, the rest hidden.
 * Spaces in what was typed are ignored. */
export function maskNumber(number: string): string {
  const bare = number.replace(/\s+/g, '');
  if (bare.length <= 4) return bare;
  return `•••• ${bare.slice(-4)}`;
}

/** 62 400 — thin grouping the way the trip screen prints distances. */
export function formatCount(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function monthLabel(yyyyMm: string | null): string | null {
  const match = yyyyMm ? /^(\d{4})-(\d{2})$/.exec(yyyyMm) : null;
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 15));
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The two-letter airline code of a flight designator ("AY1337" → "AY"). */
export function carrierCode(flightNumber: string): string | null {
  return /^([A-Z0-9]{2})\s?\d/.exec(flightNumber.trim().toUpperCase())?.[1] ?? null;
}

export function allianceOf(code: string): Alliance | null {
  for (const [alliance, members] of Object.entries(ALLIANCES) as [Alliance, string[]][]) {
    if (members.includes(code)) return alliance;
  }
  return null;
}

/** How a flight on `code` relates to the traveller's memberships: earned in
 * one of them directly ('own'), or through an alliance partner ('partner').
 * The first match in stack order wins; null when none applies. */
export function earningFor<M extends MembershipLike>(
  code: string | null,
  memberships: M[],
): { membership: M; kind: 'own' | 'partner' } | null {
  if (!code) return null;
  const own = memberships.find((m) => programmeById(m.programme)?.carriers.includes(code));
  if (own) return { membership: own, kind: 'own' };
  const alliance = allianceOf(code);
  if (!alliance) return null;
  const partner = memberships.find((m) => programmeById(m.programme)?.alliance === alliance);
  return partner ? { membership: partner, kind: 'partner' } : null;
}

/** "Earns Qpoints · Privilege Club Gold" for a trip, or null. */
export function earningLine(code: string | null, memberships: MembershipLike[]): string | null {
  const match = earningFor(code, memberships);
  if (!match) return null;
  const d = describeMembership(match.membership);
  const what = d.statusUnit ?? d.currency;
  const tier = match.membership.tier ? ` ${match.membership.tier}` : '';
  return `${match.kind === 'own' ? 'Earns' : 'Can earn'} ${what} · ${d.name}${tier}`;
}

/** The smart tip: upcoming flights on an alliance partner the traveller has
 * no card for, which could credit to a programme they hold. Picks the
 * airline with the most such flights; null when there is nothing to say. */
export function creditTip(
  upcomingFlightNumbers: string[],
  memberships: MembershipLike[],
  airlineName: (code: string) => string,
) {
  const counts = new Map<string, number>();
  for (const number of upcomingFlightNumbers) {
    const code = carrierCode(number);
    if (!code) continue;
    const match = earningFor(code, memberships);
    if (match?.kind !== 'partner') continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [code, count] = best;
  const match = earningFor(code, memberships)!;
  const d = describeMembership(match.membership);
  const alliance = d.alliance!;
  const next = nextTier(match.membership);
  const airline = airlineName(code);
  const unit = d.statusUnit ?? d.currency;
  const flights = count === 1 ? `Your upcoming ${airline} flight` : `Your ${count} upcoming ${airline} flights`;
  return {
    title: `Credit your ${airline} flights`,
    body:
      `${airline} is ${alliance}, like ${d.airline}. ${flights} can earn ${unit}` +
      (next ? ` toward ${d.name} ${next.name}.` : ` in ${d.name}.`),
    membershipId: match.membership.id,
  };
}
