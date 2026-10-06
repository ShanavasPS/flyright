import { v, type Infer } from 'convex/values';

/** The lounge directory's shape (docs/lounges.md), shared by the server
 * table, the seed script's data and the app's engine
 * (src/services/lounge-access). Hours are the airport's local clock. */

const money = v.object({ amount: v.number(), currency: v.string() });
const alliance = v.union(v.literal('oneworld'), v.literal('Star Alliance'), v.literal('SkyTeam'));
const level = v.union(
  v.literal('ruby'),
  v.literal('sapphire'),
  v.literal('emerald'),
  v.literal('star-silver'),
  v.literal('star-gold'),
  v.literal('elite'),
  v.literal('elite-plus'),
);
const cabin = v.union(v.literal('economy'), v.literal('premium'), v.literal('business'), v.literal('first'));
const network = v.union(
  v.literal('priority-pass'),
  v.literal('dragonpass'),
  v.literal('loungekey'),
  v.literal('mastercard-travel-pass'),
);

export const loungeFields = {
  loungeId: v.string(),
  airport: v.string(),
  name: v.string(),
  terminal: v.union(v.string(), v.null()),
  /** Where it is, as a traveller would look for it: "Non-Schengen, near gate 52". */
  location: v.union(v.string(), v.null()),
  afterPassportControl: v.union(v.boolean(), v.null()),
  /** Which departures can reach it, where the airport splits them: a
   *  domestic terminal's lounge, or one for international flights only.
   *  Absent: any departure from the airport. */
  serves: v.optional(v.union(v.literal('international'), v.literal('domestic'))),
  hours: v.union(v.object({ open: v.string(), close: v.string() }), v.null()),
  access: v.object({
    /** Cabins that get in when flying one of `carriers`, any member of
     *  `alliance`, or any airline (`anyCarrier`); `internationalOnly` when
     *  the cabin only counts on international flights. */
    cabin: v.optional(
      v.object({
        cabins: v.array(cabin),
        carriers: v.optional(v.array(v.string())),
        alliance: v.optional(alliance),
        anyCarrier: v.optional(v.boolean()),
        internationalOnly: v.optional(v.boolean()),
      }),
    ),
    status: v.optional(
      v.object({ alliance, levels: v.array(level), internationalOnly: v.optional(v.boolean()) }),
    ),
    networks: v.optional(v.array(network)),
    door: v.optional(money),
  }),
  /** 'YYYY-MM-DD' a person last checked it against `source`. */
  checkedOn: v.string(),
  /** Where the facts were checked: the operator's own page. */
  source: v.string(),
};

export const loungeValidator = v.object(loungeFields);
export type LoungeRecord = Infer<typeof loungeValidator>;

/** At most this many airports per question: a trip with connections. */
export const MAX_AIRPORTS = 8;

export function isAirportCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** What is wrong with a directory entry, or null. The validator checks the
 * shape; this checks what the shape can't. */
export function loungeProblem(lounge: LoungeRecord): string | null {
  if (!isAirportCode(lounge.airport)) return `${lounge.loungeId}: airport must be three capital letters`;
  if (!lounge.loungeId.startsWith(`${lounge.airport.toLowerCase()}-`)) return `${lounge.loungeId}: id must start with the airport`;
  if (!lounge.name.trim()) return `${lounge.loungeId}: name is empty`;
  const clock = /^([01]\d|2[0-4]):[0-5]\d$/;
  if (lounge.hours && (!clock.test(lounge.hours.open) || !clock.test(lounge.hours.close))) {
    return `${lounge.loungeId}: hours must be HH:MM`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lounge.checkedOn)) return `${lounge.loungeId}: checkedOn must be YYYY-MM-DD`;
  if (!/^https:\/\//.test(lounge.source)) return `${lounge.loungeId}: source must be an https link`;
  const { cabin, status, networks, door } = lounge.access;
  if (!cabin && !status && !networks?.length && !door) return `${lounge.loungeId}: no way in`;
  if (cabin && !cabin.carriers?.length && !cabin.alliance && !cabin.anyCarrier) {
    return `${lounge.loungeId}: cabin access needs carriers, an alliance or anyCarrier`;
  }
  return null;
}
