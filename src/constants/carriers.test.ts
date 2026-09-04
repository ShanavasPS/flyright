import { carrierCodeForName } from './carriers';

describe('carrierCodeForName', () => {
  it.each([
    ['Alaska Airlines', 'AS'],
    ['ALASKA', 'AS'],
    ['HORIZON AIR AS ALASKAHORIZON', 'QX'],
    ['Qatar Airways', 'QR'],
    ['QATAR AIRWAYS', 'QR'],
    ['Lufthansa CityLine', 'CL'],
    ['Lufthansa', 'LH'],
    ['British Airways', 'BA'],
  ])('%s → %s', (name, code) => {
    expect(carrierCodeForName(name)).toBe(code);
  });

  it('returns null for unknown or empty names', () => {
    expect(carrierCodeForName('Flight')).toBeNull();
    expect(carrierCodeForName('Some Regional Carrier')).toBeNull();
    expect(carrierCodeForName('')).toBeNull();
    expect(carrierCodeForName(null)).toBeNull();
  });
});
