import { and, eq } from 'drizzle-orm';
import Storage from 'expo-sqlite/kv-store';

import { db } from '@/db/client';
import { claims, journeys } from '@/db/schema';
import { trackEvent } from '@/services/analytics';
import { INTRA_EU_CAP_EUR, needsIntraEuCap } from '@/services/claim-repair-rule';

const DONE_KEY = 'claims-repair-intra-eu-400-v1';

/**
 * One-time repair, run once the database is open: claims saved before the
 * intra-EU 400 EUR cap still carry the old 600 (or 300) EUR amount. They are
 * corrected in place; the sent-letter snapshot is left untouched, since it
 * records what actually went to the airline.
 *
 * Not a SQL migration on purpose: a failed migration blocks the whole app
 * ("Couldn't open your journal"). This never throws — a failure is left for
 * the next launch — and it is marked done only once it has succeeded.
 */
export async function repairIntraEuClaims(): Promise<void> {
  try {
    if (Storage.getItemSync(DONE_KEY) === 'done') return;
    const rows = await db
      .select()
      .from(claims)
      .innerJoin(journeys, eq(claims.journeyId, journeys.id))
      .where(eq(claims.regulation, 'EU261'));
    let fixed = 0;
    for (const { claims: claim, journeys: journey } of rows) {
      const candidate = {
        regulation: claim.regulation,
        currency: claim.currency,
        amount: claim.amount,
        status: claim.status,
        fromCountry: journey.fromCountry,
        toCountry: journey.toCountry,
        distanceKm: journey.distanceKm,
      };
      if (!needsIntraEuCap(candidate)) continue;
      // Guarded on the amount read, so a claim changed meanwhile is left alone.
      await db
        .update(claims)
        .set({ amount: INTRA_EU_CAP_EUR })
        .where(and(eq(claims.id, claim.id), eq(claims.amount, claim.amount)));
      fixed++;
    }
    Storage.setItemSync(DONE_KEY, 'done');
    if (fixed) trackEvent('claims_repaired_intra_eu', { count: fixed });
  } catch {
    // Try again next launch; the old amount is wrong but harmless meanwhile.
  }
}
