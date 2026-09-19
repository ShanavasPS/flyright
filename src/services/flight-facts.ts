import { formatTime } from '@/services/dates';
import { hasLanded, type FlightFacts, type TravelStage } from '@/services/travel-day';

export interface FactTile {
  label: string;
  value: string;
  tone?: 'danger';
}

/** The airport's facts worth a glance on the day, in the order a traveller
 * needs them: a real delay first (half an hour or more, the app's one
 * threshold), then where to go — terminal, check-in, gate — and when to
 * board, until take-off; the belt once landed. Clocks read in the departure
 * airport's zone. */
export function factTiles(facts: FlightFacts, stage: TravelStage | null, departureZone: string | null): FactTile[] {
  const tiles: FactTile[] = [];
  if (facts.delayMinutes != null && facts.delayMinutes >= 30) {
    tiles.push({ label: 'Delay', value: `${facts.delayMinutes} min`, tone: 'danger' });
  }
  // The departure airport's facts matter until the wheels are up; after
  // that the gate someone left from is noise.
  if (stage !== 'departed' && !hasLanded(stage)) {
    if (facts.terminal) tiles.push({ label: 'Terminal', value: facts.terminal });
    if (facts.checkInDesk) tiles.push({ label: 'Check-in', value: facts.checkInDesk });
    if (facts.gate) tiles.push({ label: 'Gate', value: facts.gate });
    if (facts.boardingTime) tiles.push({ label: 'Boarding', value: formatTime(facts.boardingTime, departureZone) });
  }
  if (hasLanded(stage) && facts.baggageBelt) tiles.push({ label: 'Baggage', value: facts.baggageBelt });
  return tiles;
}
