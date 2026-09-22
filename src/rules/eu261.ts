import { enforcementState, isEU, isEUTerritory, isIntraEU } from './regions';
import type { Disruption, Journey, Verdict } from './types';

const NOT_APPLICABLE: Verdict = {
  eligible: false,
  regulation: null,
  compensation: null,
  reason: 'EU261 does not apply to this journey.',
};

/**
 * Regulation (EC) No 261/2004, Art. 3(1).
 * Applies to any flight departing an airport in EU/EEA territory — the
 * outermost regions (Réunion, Guadeloupe, …) included — and to flights
 * arriving there from outside on an EU/EEA carrier.
 */
export function appliesEU261(journey: Journey): boolean {
  if (journey.mode !== 'flight') return false;
  if (isEUTerritory(journey.from.country)) return true;
  return isEUTerritory(journey.to.country) && isEU(journey.carrierCountry);
}

/** Distance bands per Article 7. Art 7(1)(b) puts EVERY intra-Community
 * flight over 1,500 km in the €400 band, however long — only flights leaving
 * or entering the EU reach €600. Long-haul halves to 50% when the delay is
 * under 4h (Art 7(2)(c)); that reduction belongs to the €600 band alone. */
function compensationAmount(distanceKm: number, delayMinutes: number, intraCommunity: boolean): number {
  if (distanceKm <= 1500) return 250;
  if (distanceKm <= 3500 || intraCommunity) return 400;
  return delayMinutes < 240 ? 300 : 600;
}

export interface Eu261Options {
  /** Override for whether the flight stays inside the regulation's own
   * territory. UK261 passes "within the UK" here, since it evaluates UK
   * departures through an EU proxy. Defaults to both ends in the EU/EEA. */
  intraCommunity?: boolean;
}

export function evaluateEU261(journey: Journey, disruption: Disruption, options: Eu261Options = {}): Verdict {
  if (!appliesEU261(journey)) return NOT_APPLICABLE;
  const intra = options.intraCommunity ?? isIntraEU(journey.from.country, journey.to.country);
  const amountFor = (delayMinutes: number) => compensationAmount(journey.distanceKm, delayMinutes, intra);

  const base = {
    regulation: 'EU261' as const,
    // The body of the state where the flight left from; for a flight into
    // the EU from outside, the state it arrived in (Art. 16(1)).
    escalationBody: `National Enforcement Body of ${enforcementState(
      isEUTerritory(journey.from.country) ? journey.from.country : journey.to.country,
    )}`,
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
      const amount = amountFor(delay);
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
      const amount = amountFor(delay);
      return {
        ...base,
        eligible: true,
        compensation: { amount, currency: 'EUR' },
        reason: 'Cancellation with less than 14 days notice qualifies under EU261 Article 5.',
      };
    }

    case 'denied_boarding': {
      const amount = amountFor(Number.MAX_SAFE_INTEGER);
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
