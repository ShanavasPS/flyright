import {
  asPassFormat,
  holderName,
  legFor,
  matrixToPath,
  passCovers,
  passFacts,
  storablePass,
  storableTicket,
  codeFacts,
} from './boarding-pass';
import { parseBcbp } from './bcbp';

const CANONICAL = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';
const TWO_LEG =
  'M2DOE/JOHNMR          EABC123 HELLHRAY 1331 242Y025A0042 10AAIRLINE-10DEF456 LHRJFKBA 0117 242J002B0007 100';

describe('asPassFormat', () => {
  it('folds the decoders’ spellings into ours', () => {
    expect(asPassFormat('pdf417')).toBe('pdf417');
    expect(asPassFormat('PDF417')).toBe('pdf417');
    expect(asPassFormat('org.iso.PDF417')).toBe('pdf417');
    expect(asPassFormat('qr')).toBe('qr');
    expect(asPassFormat('QR_CODE')).toBe('qr');
    expect(asPassFormat('aztec')).toBe('aztec');
    expect(asPassFormat('DATA_MATRIX')).toBe('datamatrix');
  });

  it('rejects symbologies a pass never uses', () => {
    expect(asPassFormat('code128')).toBeNull();
    expect(asPassFormat('ean13')).toBeNull();
    expect(asPassFormat(undefined)).toBeNull();
  });
});

describe('storablePass', () => {
  it('keeps a boarding pass in a known symbology', () => {
    expect(storablePass(CANONICAL, 'pdf417')).toEqual({ code: CANONICAL, format: 'pdf417' });
  });

  it('drops loyalty cards, unknown symbologies, and oversized payloads', () => {
    expect(storablePass('https://example.com/checkin', 'qr')).toBeNull();
    expect(storablePass(CANONICAL, 'code128')).toBeNull();
    expect(storablePass(CANONICAL + 'X'.repeat(2000), 'pdf417')).toBeNull();
  });
});

describe('legFor / passCovers', () => {
  it('picks the leg by flight and route', () => {
    const pass = parseBcbp(TWO_LEG)!;
    expect(legFor(pass, { number: 'BA117', fromCode: 'LHR', toCode: 'JFK' })?.seat).toBe('002B');
    expect(legFor(pass, { number: 'AY1331', fromCode: 'HEL', toCode: 'LHR' })?.seat).toBe('025A');
  });

  it('falls back to the route for a codeshare number', () => {
    const pass = parseBcbp(TWO_LEG)!;
    expect(legFor(pass, { number: 'AA6142', fromCode: 'LHR', toCode: 'JFK' })?.flight).toBe('BA117');
  });

  it('refuses a trip the pass does not name', () => {
    expect(passCovers(TWO_LEG, { number: 'AY1331', fromCode: 'HEL', toCode: 'LHR' })).toBe(true);
    expect(passCovers(TWO_LEG, { number: 'LH123', fromCode: 'FRA', toCode: 'MUC' })).toBe(false);
    expect(passCovers('not a pass', { number: 'AY1331', fromCode: 'HEL', toCode: 'LHR' })).toBe(false);
  });

  it('does not attach to a different route with the same flight number or another departure day', () => {
    expect(passCovers(TWO_LEG, { number: 'AY1331', fromCode: 'HEL', toCode: 'JFK' })).toBe(false);
    expect(passCovers(TWO_LEG, { number: 'AY1331', fromCode: 'HEL', toCode: 'LHR', date: '2026-08-31' })).toBe(false);
    expect(passCovers(TWO_LEG, { number: 'AY1331', fromCode: 'HEL', toCode: 'LHR', date: '2026-08-30' })).toBe(true);
  });
});

describe('holderName', () => {
  it('turns LAST/FIRST into First Last', () => {
    expect(holderName('DESMARAIS/LUC')).toBe('Luc Desmarais');
  });

  it('drops the glued-on title but not a short name that looks like one', () => {
    expect(holderName('DOE/JOHNMR')).toBe('John Doe');
    expect(holderName('SHAJI/SHANAVASMR')).toBe('Shanavas Shaji');
    expect(holderName('DOE/AMR')).toBe('Amr Doe');
    expect(holderName('SMITH/ANNA MARIEMRS')).toBe('Anna Marie Smith');
  });

  it('keeps a lone surname and hyphenated names', () => {
    expect(holderName('DOE')).toBe('Doe');
    expect(holderName('SMITH-JONES/MARY')).toBe('Mary Smith-Jones');
    expect(holderName('   ')).toBeNull();
  });
});

describe('passFacts', () => {
  it('reads the matching leg', () => {
    expect(passFacts(TWO_LEG, { number: 'BA117', fromCode: 'LHR', toCode: 'JFK' })).toEqual({
      holder: 'John Doe',
      seat: '2B',
      sequence: '7',
      pnr: 'DEF456',
      cabin: 'J',
      leg: 2,
      legs: 2,
    });
  });

  it('is null for a payload that is not a pass', () => {
    expect(passFacts('WIFI:S:lounge;;', { number: 'BA117', fromCode: 'LHR', toCode: 'JFK' })).toBeNull();
  });

  it('does not show another leg’s facts on an unrelated trip', () => {
    expect(passFacts(TWO_LEG, { number: 'LH123', fromCode: 'FRA', toCode: 'MUC' })).toBeNull();
  });
});

describe('ticket receipt codes', () => {
  const code = 'E                 17624000000010201   17624000000010201';
  it('preserves receipt payloads separately from boarding passes', () => {
    expect(storableTicket(code, 'PDF_417')).toEqual({ code, format: 'pdf417' });
    expect(storablePass(code, 'pdf417')).toBeNull();
    expect(storableTicket(CANONICAL, 'pdf417')).toBeNull();
    expect(storableTicket('https://example.com', 'qr')).toBeNull();
    expect(codeFacts(code, { number: 'EK533', fromCode: 'COK', toCode: 'DXB' })?.ticketNumber).toBe('176-2400000001');
  });
});

describe('matrixToPath', () => {
  it('merges each row’s dark runs into rectangles', () => {
    expect(matrixToPath({ width: 5, height: 2, rows: ['11010', '00111'] })).toBe(
      'M0 0h2v1h-2zM3 0h1v1h-1zM2 1h3v1h-3z',
    );
  });

  it('is empty for a blank matrix', () => {
    expect(matrixToPath({ width: 2, height: 1, rows: ['00'] })).toBe('');
  });
});
