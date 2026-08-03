import { appliesEU261, evaluateEU261 } from './eu261';
import { evaluateEURail } from './rail-eu';
import type { Disruption, Journey, Verdict } from './types';
import { appliesUK261, evaluateUK261 } from './uk261';

/**
 * Single entry point: given a journey and what went wrong, return the best
 * applicable verdict. Pure and synchronous — runs on-device, works offline.
 */
export function evaluate(journey: Journey, disruption: Disruption): Verdict {
  switch (journey.mode) {
    case 'flight':
      // Departures from the EU are EU261 even on UK carriers; UK departures are UK261.
      if (appliesEU261(journey)) return evaluateEU261(journey, disruption);
      if (appliesUK261(journey)) return evaluateUK261(journey, disruption);
      break;
    case 'train':
      return evaluateEURail(journey, disruption);
    case 'bus':
    case 'ferry':
      // Reg 181/2011 (bus) and 1177/2010 (ferry) — planned for week 7.
      break;
  }

  return {
    eligible: false,
    regulation: null,
    compensation: null,
    reason: 'No passenger-rights regulation covers this journey yet.',
  };
}
