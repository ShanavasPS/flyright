export type TransportMode = 'flight' | 'train' | 'bus' | 'ferry';

export type DisruptionType =
  | 'delay'
  | 'cancellation'
  | 'denied_boarding'
  | 'baggage_delayed'
  | 'baggage_lost'
  | 'baggage_damaged';

export interface Money {
  amount: number;
  currency: 'EUR' | 'GBP' | 'USD';
}

export interface Place {
  /** IATA airport code or station code */
  code: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
}

export interface Journey {
  id: string;
  mode: TransportMode;
  carrier: string;
  /** ISO country of the operating carrier, used for EU261 carrier tests */
  carrierCountry: string;
  number: string;
  from: Place;
  to: Place;
  /** great-circle distance; EU261 bands are distance-based */
  distanceKm: number;
  scheduledDeparture: string;
  scheduledArrival: string;
  ticketPrice?: Money;
}

export interface Disruption {
  type: DisruptionType;
  /** arrival delay in minutes, for delay/cancellation-rerouting cases */
  delayMinutes?: number;
  /** days of advance notice, for cancellations */
  noticeDays?: number;
  /** airline claims weather/strike/etc. — kills EU261 compensation but not care duties */
  extraordinaryCircumstances?: boolean;
}

export interface Verdict {
  eligible: boolean;
  /** e.g. 'EU261', 'UK261', 'EU Rail 2021/782' — null when nothing applies */
  regulation: string | null;
  compensation: Money | null;
  /** human-readable explanation shown in the verdict screen */
  reason: string;
  /** where to escalate if the carrier stonewalls */
  escalationBody?: string;
}
