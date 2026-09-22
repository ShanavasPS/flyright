/**
 * Which saved claims carry the pre-fix EU261 amount for an intra-EU flight
 * (docs: commit "Cap intra-EU flights over 1,500 km at 400 EUR"). Pure, so the
 * rule is pinned by tests; services/claims-repair applies it to the database.
 *
 * Until 2026-09-22 the rules engine paid 600 EUR — or 300 EUR for a 3–4 hour
 * delay — on any flight over 3,500 km, including ones inside the EU, where
 * Art. 7(1)(b) caps every flight over 1,500 km at 400 EUR. A claim stores the
 * amount its verdict gave, so those claims still show the wrong figure.
 */
import { isIntraEU } from '@/rules/regions';
import type { ClaimStatus } from '@/services/claim-status';

export const INTRA_EU_CAP_EUR = 400;

/** Claims still in play. A paid or rejected claim is history: what the
 * airline did is on record and its amount is left as it was. */
const OPEN: ReadonlySet<ClaimStatus> = new Set(['draft', 'sent', 'acknowledged', 'escalated']);

export interface RepairCandidate {
  regulation: string;
  currency: string;
  amount: number;
  status: ClaimStatus;
  fromCountry: string;
  toCountry: string;
  distanceKm: number;
}

/** True when the claim's amount came from the old intra-EU long-haul band and
 * should read 400 EUR. Only the two amounts the old engine could produce for
 * such a flight (600, and 300 for a 3–4 h delay) are touched. */
export function needsIntraEuCap(c: RepairCandidate): boolean {
  return (
    c.regulation === 'EU261' &&
    c.currency === 'EUR' &&
    (c.amount === 600 || c.amount === 300) &&
    OPEN.has(c.status) &&
    c.distanceKm > 1500 &&
    isIntraEU(c.fromCountry, c.toCountry)
  );
}
