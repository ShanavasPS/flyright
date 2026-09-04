import { carrierCodeForName, operatingBrand } from './carriers';

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

describe('operatingBrand', () => {
  it.each([
    // US DOT form: the brand after "as" wins.
    ['HORIZON AIR AS ALASKAHORIZON', 'QR', 'AS'],
    ['SkyWest Airlines as Delta Connection', 'DL', 'DL'],
    ['SkyWest Airlines dba United Express', 'UA', 'UA'],
    ['Envoy Air as American Eagle', 'AA', 'AA'],
    // EU form: corporate name only — regionals resolve to their parent brand.
    ['Horizon Air', 'QR', 'AS'],
    ['Lufthansa CityLine', 'LH', 'LH'],
    ['KLM Cityhopper', 'KL', 'KL'],
    // Regionals with several parents take whoever sold the ticket.
    ['SkyWest Airlines', 'DL', 'DL'],
    ['Republic Airways', 'AA', 'AA'],
    // Majors are their own brand.
    ['ALASKA', 'QR', 'AS'],
    ['QATAR AIRWAYS', 'QR', 'QR'],
    ['British Airways', 'AY', 'BA'],
  ])('%s (sold by %s) → %s', (text, marketing, code) => {
    expect(operatingBrand(text, marketing)).toBe(code);
  });

  it('returns null for unknown operators', () => {
    expect(operatingBrand('Some Regional Carrier', 'QR')).toBeNull();
    expect(operatingBrand('', 'QR')).toBeNull();
  });
});
