import { parseBcbp, resolveFlightDate } from './bcbp';

// The canonical single-leg example from IATA Resolution 792.
const CANONICAL = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';

describe('parseBcbp', () => {
  it('parses the canonical IATA example', () => {
    const pass = parseBcbp(CANONICAL)!;
    expect(pass.passengerName).toBe('DESMARAIS/LUC');
    expect(pass.legs).toHaveLength(1);
    expect(pass.legs[0]).toEqual({
      pnr: 'ABC123',
      fromCode: 'YUL',
      toCode: 'FRA',
      flight: 'AC834',
      dayOfYear: 326,
      seat: '001A',
      cabin: 'J',
      sequence: '25',
      baggage: null,
    });
  });

  it('parses a two-leg pass, hopping over variable fields', () => {
    const pass = parseBcbp(
      // Leg 1 declares a 0x0A = 10-char variable field ('AIRLINE-10') that
      // the parser must hop over to find leg 2's block.
      'M2DOE/JOHN            EABC123 HELLHRAY 1331 242Y025A0042 10AAIRLINE-10DEF456 LHRJFKBA 0117 242J002B0007 100',
    )!;
    expect(pass.legs).toHaveLength(2);
    expect(pass.legs[0].flight).toBe('AY1331');
    expect(pass.legs[1]).toMatchObject({
      pnr: 'DEF456',
      fromCode: 'LHR',
      toCode: 'JFK',
      flight: 'BA117',
      dayOfYear: 242,
    });
  });

  it('keeps an alpha flight-number suffix', () => {
    const pass = parseBcbp(CANONICAL.replace('0834 ', '042A '))!;
    expect(pass.legs[0].flight).toBe('AC42A');
  });

  it('accepts a pass with security data appended', () => {
    expect(parseBcbp(`${CANONICAL}^460MEQCIQCVX...`)).not.toBeNull();
  });

  it('rejects payloads that are not boarding passes', () => {
    expect(parseBcbp('https://example.com/checkin')).toBeNull();
    expect(parseBcbp('WIFI:S:lounge;P:secret;;')).toBeNull();
    expect(parseBcbp('M0DOE/JOHN')).toBeNull();
    expect(parseBcbp('M1DOE/JOHN            E')).toBeNull();
    // Day-of-year out of range.
    expect(parseBcbp(CANONICAL.replace('326', '400'))).toBeNull();
    // Route codes must be letters.
    expect(parseBcbp(CANONICAL.replace('YUL', '12L'))).toBeNull();
  });
});

describe('resolveFlightDate', () => {
  it('lands on this year when the date is near today', () => {
    // Day 242 = Aug 30 in 2026.
    expect(resolveFlightDate(242, new Date(2026, 7, 30))).toBe('2026-08-30');
  });

  it('rolls forward across New Year', () => {
    // Day 5 scanned on Dec 28 → early January of next year.
    expect(resolveFlightDate(5, new Date(2026, 11, 28))).toBe('2027-01-05');
  });

  it('rolls back across New Year', () => {
    // Day 360 scanned on Jan 3 → late December of last year.
    expect(resolveFlightDate(360, new Date(2027, 0, 3))).toBe('2026-12-26');
  });

  it('only offers day 366 in leap years', () => {
    // 2028 is a leap year; scanned late 2028, day 366 must not become Jan 1 2028+1 midpick.
    expect(resolveFlightDate(366, new Date(2028, 11, 30))).toBe('2028-12-31');
  });
});

describe('free baggage allowance', () => {
  // IATA Resolution 792's two-leg example, with its conditional items.
  const TWO_LEGS =
    'M2DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 14D>6180WW6225BAC 00141234560032A0141234567890 1AC AC 1234567890123    20KYLX58ZDEF456 FRAGVALH 3664 327C012C0002 12E2A0141234567891 1AC AC 1234567890123    2PCNWQ^164GIWVC5EH7JNT684FVNJ91W2QA4DVN5J8K4F0L0GEQ3DF5TGBN8709HKT5D3DW3GBHFCVHMY7J5T6HFR41W2QA4DVN5J8K4F0L0GE';

  it('reads each leg its own allowance', () => {
    const pass = parseBcbp(TWO_LEGS)!;
    expect(pass.legs.map((l) => [l.flight, l.baggage])).toEqual([
      ['AC834', '20K'],
      ['LH3664', '2PC'],
    ]);
  });

  it('is null on a pass without the conditional items', () => {
    expect(parseBcbp(CANONICAL)!.legs[0]!.baggage).toBeNull();
  });
});
