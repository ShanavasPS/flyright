import { FlightLookupError, type FlightStatus } from '@/services/flight-lookup';

/** What the import screen knows about one leg once its lookup has settled
 * (or not): mirrors the screen's `Plan`, minus the journal's route. */
export type ImportPlan =
  | { kind: 'lookup'; flight: FlightStatus }
  | { kind: 'journal' }
  | { kind: 'incomplete' }
  | { kind: 'pending' };

export interface ImportStatusInput {
  /** The leg carries a boarding pass / a ticket code read off the document. */
  pass: boolean;
  ticket: boolean;
  /** A saved trip matches this leg and would take something new from it. */
  attachable: boolean;
  /** A saved trip matches this leg (with or without anything to take). */
  already: boolean;
  plan: ImportPlan;
  /** The traveller changed the year by hand. */
  edited: boolean;
  lookupError: unknown;
}

export type ImportStatusTone = 'good' | 'warn' | 'dim';

/** The line under a leg on the import screen. It states what saving will do
 * to the journal — never what the traveller has to do: the buttons carry the
 * actions, and a status that reads "update boarding pass" sounds like a
 * chore. Written as full sentences so a long one wraps rather than truncates. */
export function importStatus({ pass, ticket, attachable, already, plan, edited, lookupError }: ImportStatusInput): {
  text: string;
  tone: ImportStatusTone;
} {
  if (attachable) {
    return {
      text: pass
        ? 'Already in Flights · this boarding pass will be saved to it'
        : ticket
          ? 'Already in Flights · this ticket code will be saved to it'
          : 'Already in Flights · its details will be updated',
      tone: 'good',
    };
  }
  if (already) return { text: 'Already in Flights · nothing new to save', tone: 'dim' };
  if (plan.kind === 'pending') return { text: 'Looking up…', tone: 'dim' };
  if (plan.kind === 'lookup') {
    const f = plan.flight;
    if (f.landed) {
      // A null delay on a landed flight means the provider never reported
      // the arrival (see flightNormalize): it flew, and that is all we know.
      if (f.delayMinutes == null) return { text: 'Arrived', tone: 'good' };
      return f.delayMinutes > 0
        ? { text: `Arrived ${f.delayMinutes} min late · a verdict is waiting`, tone: 'warn' }
        : { text: 'Arrived on time', tone: 'good' };
    }
    return { text: "Scheduled · we'll watch it for delays", tone: 'dim' };
  }
  if (plan.kind === 'journal') {
    if (edited) return { text: 'Year changed by you · saved as printed', tone: 'dim' };
    // 404: the provider has no such flight. Any other failure (502, offline)
    // is the lookup's problem, not the flight's. No error at all means the
    // date was outside the provider's reach and the lookup never ran.
    const why =
      lookupError instanceof FlightLookupError && lookupError.signInRequired
        ? 'Live tracking needs a sign-in'
        : lookupError instanceof FlightLookupError && lookupError.quotaExceeded
          ? "Today's live lookups are used up"
          : lookupError instanceof FlightLookupError && lookupError.status === 404
            ? 'No live record for this flight'
            : lookupError
              ? 'Live lookup unavailable right now'
              : 'Outside live lookup';
    return { text: `${why} · saved as a journal entry, times as printed`, tone: 'dim' };
  }
  return { text: 'Route not recognised · needs its airports before it can be saved', tone: 'warn' };
}
