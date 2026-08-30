/** Pure inbound-rotation outlook — no fetch, no DB, fully unit-testable.
 *
 * The idea: before departure, the best delay predictor isn't the departure
 * board, it's where the aircraft currently is. If the inbound rotation leg is
 * running late, the knock-on delay is (inbound expected arrival + turnaround)
 * minus our scheduled departure. Schedule slack absorbs some lateness: an
 * airline that planned a 90-minute turnaround can swallow an hour of inbound
 * delay, one that planned 35 can't swallow any.
 */

import type { FlightStatus } from '@/services/flight-lookup';

/** A realistic minimum turnaround for narrow-body operations. When the
 * schedule plans less than this, trust the airline's own plan instead. */
const MIN_TURNAROUND_MIN = 35;

/** Predicted knock-on below this is jitter, not news. */
const WATCH_MIN = 15;
/** From here on the slip is worth a proactive heads-up. */
const LIKELY_MIN = 30;

export interface InboundOutlook {
  /** "AY1330", or null when the provider hid the rotation's number. */
  flight: string | null;
  /** IATA code the plane is coming from, e.g. "ARN". */
  fromCode: string | null;
  /** True once the aircraft is on the ground at our departure airport. */
  landed: boolean;
  /** How late the inbound itself is running (0 when on time or early). */
  lateMinutes: number;
  /** Knock-on delay for our departure after turnaround slack (≥ 0). */
  predictedDepartureDelayMinutes: number;
  /** What the airline has already admitted on the departure board (≥ 0). */
  announcedDepartureDelayMinutes: number;
  severity: 'none' | 'watch' | 'likely';
}

const minutesBetween = (laterIso: string, earlierIso: string) =>
  Math.round((Date.parse(laterIso) - Date.parse(earlierIso)) / 60_000);

/**
 * Null when there's nothing to say: no inbound data, the flight has already
 * departed, or timestamps are unparseable. Otherwise always returns the
 * outlook — including the happy path — so surfaces can also say "your plane
 * is on its way, on time".
 */
export function inboundOutlook(status: FlightStatus): InboundOutlook | null {
  const inbound = status.inbound;
  if (!inbound?.scheduledArrival || !status.scheduledDeparture) return null;
  if (status.actualDeparture) return null;

  const expectedArrival =
    inbound.actualArrival ?? inbound.estimatedArrival ?? inbound.scheduledArrival;
  const scheduledTurnaround = minutesBetween(status.scheduledDeparture, inbound.scheduledArrival);
  const lateMinutes = Math.max(0, minutesBetween(expectedArrival, inbound.scheduledArrival));
  if ([scheduledTurnaround, lateMinutes].some(Number.isNaN) || scheduledTurnaround <= 0) {
    return null;
  }

  const turnaround = Math.min(scheduledTurnaround, MIN_TURNAROUND_MIN);
  const readyMs = Date.parse(expectedArrival) + turnaround * 60_000;
  const predicted = Math.max(
    0,
    Math.round((readyMs - Date.parse(status.scheduledDeparture)) / 60_000),
  );

  const announcedBasis = status.estimatedDeparture ?? null;
  const announced = announcedBasis
    ? Math.max(0, minutesBetween(announcedBasis, status.scheduledDeparture))
    : 0;

  return {
    flight: inbound.flight,
    fromCode: inbound.from?.code ?? null,
    landed: inbound.landed,
    lateMinutes,
    predictedDepartureDelayMinutes: predicted,
    announcedDepartureDelayMinutes: Number.isNaN(announced) ? 0 : announced,
    severity: predicted >= LIKELY_MIN ? 'likely' : predicted >= WATCH_MIN ? 'watch' : 'none',
  };
}

/** A heads-up only earns a push when we know something the departure board
 * doesn't — the predicted slip is serious AND meaningfully beyond whatever
 * the airline has already announced. */
export function inboundNewsworthy(outlook: InboundOutlook): boolean {
  return (
    outlook.severity === 'likely' &&
    outlook.predictedDepartureDelayMinutes - outlook.announcedDepartureDelayMinutes >= WATCH_MIN
  );
}
