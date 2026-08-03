import { isEU } from './regions';
import type { Disruption, Journey, Verdict } from './types';

const NOT_APPLICABLE: Verdict = {
  eligible: false,
  regulation: null,
  compensation: null,
  reason: 'EU261 does not apply to this journey.',
};

/**
 * Regulation (EC) No 261/2004.
 * Applies to any flight departing an EU/EEA airport, and to flights arriving
 * into the EU/EEA on an EU/EEA carrier.
 */
export function appliesEU261(journey: Journey): boolean {
  if (journey.mode !== 'flight') return false;
  if (isEU(journey.from.country)) return true;
  return isEU(journey.to.country) && isEU(journey.carrierCountry);
}

/** Distance bands per Article 7. Long-haul halves to 50% when delay < 4h (Art 7(2)(c)). */
function compensationAmount(distanceKm: number, delayMinutes: number): number {
  if (distanceKm <= 1500) return 250;
  if (distanceKm <= 3500) return 400;
  return delayMinutes < 240 ? 300 : 600;
}

export function evaluateEU261(journey: Journey, disruption: Disruption): Verdict {
  if (!appliesEU261(journey)) return NOT_APPLICABLE;

  const base = {
    regulation: 'EU261' as const,
    escalationBody: `National Enforcement Body of ${journey.from.country}`,
  };

  if (disruption.extraordinaryCircumstances) {
    return {
      ...base,
      eligible: false,
      compensation: null,
      reason:
        'The carrier claims extraordinary circumstances. Compensation is excluded only if the disruption was genuinely outside its control — technical faults and most crew strikes do NOT qualify. Worth contesting.',
    };
  }

  const delay = disruption.delayMinutes ?? 0;

  switch (disruption.type) {
    case 'delay': {
      if (delay < 180) {
        return {
          ...base,
          eligible: false,
          compensation: null,
          reason: `Arrival delay of ${delay} min is under the 3-hour EU261 threshold.`,
        };
      }
      const amount = compensationAmount(journey.distanceKm, delay);
      return {
        ...base,
        eligible: true,
        compensation: { amount, currency: 'EUR' },
        reason: `Arrival delay of ${delay} min on a ${journey.distanceKm} km flight qualifies under EU261 Article 7.`,
      };
    }

    case 'cancellation': {
      if ((disruption.noticeDays ?? 0) >= 14) {
        return {
          ...base,
          eligible: false,
          compensation: null,
          reason: 'Cancellation was notified 14+ days before departure — no compensation, but you are owed a full refund or rerouting.',
        };
      }
      const amount = compensationAmount(journey.distanceKm, delay);
      return {
        ...base,
        eligible: true,
        compensation: { amount, currency: 'EUR' },
        reason: 'Cancellation with less than 14 days notice qualifies under EU261 Article 5.',
      };
    }

    case 'denied_boarding': {
      const amount = compensationAmount(journey.distanceKm, Number.MAX_SAFE_INTEGER);
      return {
        ...base,
        eligible: true,
        compensation: { amount, currency: 'EUR' },
        reason: 'Involuntary denied boarding qualifies under EU261 Article 4.',
      };
    }

    default:
      return {
        ...base,
        eligible: false,
        compensation: null,
        reason: 'Baggage issues are covered by the Montreal Convention, not EU261.',
      };
  }
}
