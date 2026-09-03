import { DEMO_DISRUPTION, DEMO_JOURNEY } from '@/constants/demo-journey';
import { evaluate } from '@/rules/engine';

import {
  claimEmailSubject,
  claimPdfName,
  renderClaimLetter,
  renderClaimLetterText,
} from './letter';

const claimant = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  bookingReference: 'X4B2C1',
};

describe('claim letter', () => {
  const verdict = evaluate(DEMO_JOURNEY, DEMO_DISRUPTION);

  it('cites the statutory basis and the amount', () => {
    const html = renderClaimLetter(DEMO_JOURNEY, verdict, claimant);
    expect(html).toContain('Regulation (EC) No 261/2004');
    // 1530 km falls in the 1500–3500 km band.
    expect(html).toContain('400 EUR');
    expect(html).toContain('Sturgeon');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('X4B2C1');
    expect(html).toContain('LH873');
  });

  it('cites UK261 for UK departures with GBP amounts', () => {
    const ukJourney = {
      ...DEMO_JOURNEY,
      carrier: 'British Airways',
      carrierCountry: 'GB',
      number: 'BA795',
      from: { code: 'LHR', country: 'GB' },
      to: { code: 'HEL', country: 'FI' },
    };
    const ukVerdict = evaluate(ukJourney, DEMO_DISRUPTION);
    const html = renderClaimLetter(ukJourney, ukVerdict, claimant);
    expect(ukVerdict.regulation).toBe('UK261');
    expect(html).toContain('retained in UK law');
    expect(html).toContain('350 GBP');
    expect(html).toContain('UK Civil Aviation Authority');
  });

  it('renders the same letter as plain text for web forms', () => {
    const text = renderClaimLetterText(DEMO_JOURNEY, verdict, claimant);
    expect(text).toContain('Regulation (EC) No 261/2004');
    expect(text).toContain('400 EUR');
    expect(text).toContain('booking reference X4B2C1');
    expect(text).not.toMatch(/[<>*]/);
    expect(text.endsWith('Ada Lovelace\nada@example.com')).toBe(true);
  });

  it('builds a subject and a filename the carrier can file', () => {
    expect(claimEmailSubject(DEMO_JOURNEY, verdict)).toBe(
      'EU261 claim — Lufthansa LH873, 2026-08-10',
    );
    expect(claimPdfName(DEMO_JOURNEY, verdict)).toBe('EU261-claim-LH873-2026-08-10.pdf');
  });
});
