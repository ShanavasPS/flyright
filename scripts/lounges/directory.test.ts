import { loungeProblem, type LoungeRecord } from '../../convex/loungeShared';
import { getAirport } from '../../src/services/airports';
import directory from './directory.json';

const entries = Object.entries(directory as Record<string, LoungeRecord[]>);

describe('lounge directory', () => {
  it('has only valid entries', () => {
    const problems = entries.flatMap(([, lounges]) => lounges.map(loungeProblem).filter(Boolean));
    expect(problems).toEqual([]);
  });

  it('files each lounge under its own, known airport', () => {
    for (const [airport, lounges] of entries) {
      expect(getAirport(airport)).toBeTruthy();
      for (const lounge of lounges) expect(lounge.airport).toBe(airport);
    }
  });

  it('never repeats an id', () => {
    const ids = entries.flatMap(([, lounges]) => lounges.map((l) => l.loungeId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
