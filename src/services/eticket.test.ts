import { parseEticketRecord } from './eticket';

// The stripe on an Emirates e-ticket receipt, as Vision and ML Kit decode it.
const EMIRATES =
  'E                                           17624000000010201                      17624000000010201                      17624000000010201';

describe('parseEticketRecord', () => {
  it('reads the airline and ticket number off an e-ticket stripe', () => {
    expect(parseEticketRecord(EMIRATES)).toEqual({
      ticketNumber: '176-2400000001',
      carrier: 'EK',
    });
  });

  it('accepts a single copy of the number, with or without the trailing digits', () => {
    expect(parseEticketRecord('E 6072400000001')).toEqual({
      ticketNumber: '607-2400000001',
      carrier: 'EY',
    });
    expect(parseEticketRecord('E10524000000010201')?.ticketNumber).toBe('105-2400000001');
  });

  it('names no carrier for an accounting code it does not know', () => {
    expect(parseEticketRecord('E 9992400000001')?.carrier).toBe('CA');
    expect(parseEticketRecord('E 5552400000001')).toEqual({
      ticketNumber: '555-2400000001',
      carrier: null,
    });
  });

  it('is null for anything else', () => {
    // A boarding pass.
    expect(parseEticketRecord('M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100')).toBeNull();
    // Copies that disagree, a short number, a URL, an empty payload.
    expect(parseEticketRecord('E 1762400000001 1762400000002')).toBeNull();
    expect(parseEticketRecord('E 17624000')).toBeNull();
    expect(parseEticketRecord('Ehttps://example.com')).toBeNull();
    expect(parseEticketRecord('E')).toBeNull();
    expect(parseEticketRecord('')).toBeNull();
  });
});
