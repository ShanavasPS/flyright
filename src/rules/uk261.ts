import { isUK } from './regions';
import type { Disruption, Journey, Verdict } from './types';
import { evaluateEU261 } from './eu261';

/**
 * UK261 (retained EU261 post-Brexit): same structure, GBP bands.
 * Applies to flights departing the UK, and arriving into the UK on UK/EU carriers.
 */
export function appliesUK261(journey: Journey): boolean {
  if (journey.mode !== 'flight') return false;
  return isUK(journey.from.country) || (isUK(journey.to.country) && isUK(journey.carrierCountry));
}

const GBP_BY_EUR: Record<number, number> = { 250: 220, 300: 260, 400: 350, 600: 520 };

export function evaluateUK261(journey: Journey, disruption: Disruption): Verdict {
  if (!appliesUK261(journey)) {
    return {
      eligible: false,
      regulation: null,
      compensation: null,
      reason: 'UK261 does not apply to this journey.',
    };
  }

  // Same tests as EU261; substitute the statutory GBP amounts and UK escalation path.
  const proxy = evaluateEU261(
    { ...journey, from: { ...journey.from, country: 'IE' } },
    disruption,
  );

  return {
    ...proxy,
    regulation: proxy.regulation ? 'UK261' : null,
    compensation: proxy.compensation
      ? { amount: GBP_BY_EUR[proxy.compensation.amount] ?? proxy.compensation.amount, currency: 'GBP' }
      : null,
    escalationBody: 'UK Civil Aviation Authority (PACT)',
  };
}
