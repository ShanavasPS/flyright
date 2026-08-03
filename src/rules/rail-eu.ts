import { isEU } from './regions';
import type { Disruption, Journey, Verdict } from './types';

/**
 * Regulation (EU) 2021/782 (rail passengers' rights, replaced 1371/2007 in June 2023).
 * Compensation: 25% of ticket price for 60–119 min arrival delay, 50% for 120+ min.
 */
export function evaluateEURail(journey: Journey, disruption: Disruption): Verdict {
  const notApplicable: Verdict = {
    eligible: false,
    regulation: null,
    compensation: null,
    reason: 'EU rail passenger rights do not apply to this journey.',
  };

  if (journey.mode !== 'train') return notApplicable;
  if (!isEU(journey.from.country) && !isEU(journey.to.country)) return notApplicable;
  if (disruption.type !== 'delay' && disruption.type !== 'cancellation') return notApplicable;

  const price = journey.ticketPrice;
  if (!price) {
    return {
      eligible: false,
      regulation: 'EU Rail 2021/782',
      compensation: null,
      reason: 'Add your ticket price to calculate compensation (25–50% of fare).',
    };
  }

  const delay = disruption.delayMinutes ?? 0;
  const pct = delay >= 120 ? 0.5 : delay >= 60 ? 0.25 : 0;

  if (pct === 0) {
    return {
      eligible: false,
      regulation: 'EU Rail 2021/782',
      compensation: null,
      reason: `Arrival delay of ${delay} min is under the 60-minute threshold.`,
    };
  }

  return {
    eligible: true,
    regulation: 'EU Rail 2021/782',
    compensation: {
      amount: Math.round(price.amount * pct * 100) / 100,
      currency: price.currency,
    },
    reason: `${delay} min delay entitles you to ${pct * 100}% of the ticket price.`,
    escalationBody: `National rail enforcement body of ${journey.from.country}`,
  };
}
