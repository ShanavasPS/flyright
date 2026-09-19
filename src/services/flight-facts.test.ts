import { EMPTY_FACTS } from '@/services/travel-day';

import { factTiles } from './flight-facts';

const facts = { ...EMPTY_FACTS, terminal: '2', checkInDesk: 'Area200', gate: '53', baggageBelt: '7', delayMinutes: 40 };

describe('factTiles', () => {
  it('leads with a real delay, then where to go', () => {
    expect(factTiles(facts, 'security', 'Europe/Helsinki').map((t) => t.label)).toEqual([
      'Delay',
      'Terminal',
      'Check-in',
      'Gate',
    ]);
  });

  it('drops the departure airport once the flight has left, and shows the belt after landing', () => {
    expect(factTiles(facts, 'departed', 'Europe/Helsinki').map((t) => t.label)).toEqual(['Delay']);
    expect(factTiles(facts, 'landed', 'Europe/Helsinki').map((t) => t.label)).toEqual(['Delay', 'Baggage']);
  });

  it('ignores a delay under half an hour', () => {
    expect(factTiles({ ...facts, delayMinutes: 20 }, null, null)[0]?.label).toBe('Terminal');
  });
});
