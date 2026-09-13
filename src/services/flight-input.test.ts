import { classifyFlightInput } from './flight-input';

describe('classifyFlightInput', () => {
  it('recognises flight designators and names known airlines', () => {
    expect(classifyFlightInput('ay 1331')).toEqual({
      kind: 'flight',
      flight: 'AY1331',
      carrier: 'Finnair',
    });
    expect(classifyFlightInput('U2 8001')).toMatchObject({ kind: 'flight', flight: 'U28001' });
  });

  it('flags a designator whose airline code is not in the table', () => {
    // Shaped like a flight, but also exactly what a booking reference can look like.
    expect(classifyFlightInput('ZQ1234')).toEqual({ kind: 'flight', flight: 'ZQ1234', carrier: null });
  });

  it('spots a booking reference', () => {
    expect(classifyFlightInput('K7QX2M')).toEqual({ kind: 'pnr' });
    expect(classifyFlightInput('abc123')).toEqual({ kind: 'pnr' });
    expect(classifyFlightInput('A1B2C3')).toEqual({ kind: 'pnr' });
  });

  it('spots an e-ticket number and names the issuing airline', () => {
    expect(classifyFlightInput('176-2208710619')).toEqual({ kind: 'ticket', carrier: 'Emirates' });
    expect(classifyFlightInput('1052208710619')).toEqual({ kind: 'ticket', carrier: 'Finnair' });
    expect(classifyFlightInput('9992208710619 0001')).toEqual({ kind: 'ticket', carrier: 'Air China' });
  });

  it('treats a ticket number still being typed as a ticket', () => {
    expect(classifyFlightInput('1762208710')).toEqual({ kind: 'ticket', carrier: 'Emirates' });
  });

  it('names nothing for an unknown accounting prefix', () => {
    expect(classifyFlightInput('0002208710619')).toEqual({ kind: 'ticket', carrier: null });
  });

  it('leaves partial and odd input alone', () => {
    expect(classifyFlightInput('')).toEqual({ kind: 'empty' });
    expect(classifyFlightInput('   ')).toEqual({ kind: 'empty' });
    expect(classifyFlightInput('AY')).toEqual({ kind: 'unknown' });
    expect(classifyFlightInput('1331')).toEqual({ kind: 'unknown' });
    expect(classifyFlightInput('FIN1331')).toEqual({ kind: 'unknown' });
    expect(classifyFlightInput('123456')).toEqual({ kind: 'unknown' });
  });
});
