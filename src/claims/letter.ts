import type { Journey, Verdict } from '@/rules/types';

export interface Claimant {
  fullName: string;
  email: string;
  bookingReference?: string;
}

/** Statutory basis per verdict.regulation — the letter must cite the exact
 * instrument or carriers dismiss it as a form letter. */
const LEGAL_BASIS: Record<string, { instrument: string; compensationArticle: string }> = {
  EU261: {
    instrument: 'Regulation (EC) No 261/2004',
    compensationArticle:
      'Article 7 of Regulation (EC) No 261/2004, as interpreted by the Court of Justice in Joined Cases C-402/07 and C-432/07 (Sturgeon)',
  },
  UK261: {
    instrument: 'Regulation (EC) No 261/2004 as retained in UK law ("UK261")',
    compensationArticle:
      'Article 7 of retained Regulation (EC) No 261/2004, as interpreted in Joined Cases C-402/07 and C-432/07 (Sturgeon), which continues to apply as retained case law',
  },
  'EU Rail 2021/782': {
    instrument: 'Regulation (EU) 2021/782 on rail passengers’ rights',
    compensationArticle: 'Article 19 of Regulation (EU) 2021/782',
  },
};

const fallbackBasis = (regulation: string) => ({
  instrument: regulation,
  compensationArticle: `the compensation provisions of ${regulation}`,
});

export function formattedAmount(verdict: Verdict): string {
  return verdict.compensation
    ? `${verdict.compensation.amount} ${verdict.compensation.currency}`
    : '';
}

/** "flight LH873" for tracked flights, "the 10 Aug service from HEL to FRA"
 * shape for number-less rows — the wizard only opens on eligible verdicts,
 * which today always carry a number, but the letter shouldn't print blanks. */
function serviceLabel(journey: Journey): string {
  return journey.number ? `${journey.mode} ${journey.number}` : `your ${journey.mode} service`;
}

/** The letter's paragraphs, in order, with inline emphasis marked as
 * `**bold**` — rendered to HTML for the PDF and to plain text for pasting
 * into an airline's web form, so both say exactly the same thing. */
function letterParagraphs(journey: Journey, verdict: Verdict, claimant: Claimant): string[] {
  const basis = LEGAL_BASIS[verdict.regulation ?? ''] ?? fallbackBasis(verdict.regulation ?? '');
  const date = journey.scheduledDeparture.slice(0, 10);
  const booking = claimant.bookingReference
    ? ` (booking reference **${claimant.bookingReference}**)`
    : '';

  return [
    `To the Customer Relations department of ${journey.carrier},`,
    `Claim for compensation under ${basis.instrument}`,
    `I was booked on ${serviceLabel(journey)} from ${journey.from.code} to ${journey.to.code} on ${date}${booking}.`,
    verdict.reason,
    `I hereby claim compensation of **${formattedAmount(verdict)}** per passenger under ${basis.compensationArticle}.`,
    `Please pay this amount by bank transfer within 14 days. If I do not receive a substantive response within 6 weeks, I will refer this claim to the ${verdict.escalationBody ?? 'competent national enforcement body'} and reserve the right to pursue it through the courts, including claiming interest and costs.`,
  ];
}

const BOLD = /\*\*(.+?)\*\*/g;

/**
 * HTML claim letter — rendered to PDF with expo-print and attached to a
 * pre-filled email to the carrier's claims address.
 */
export function renderClaimLetter(
  journey: Journey,
  verdict: Verdict,
  claimant: Claimant,
): string {
  const [salutation, heading, ...body] = letterParagraphs(journey, verdict, claimant);
  const html = (text: string) => text.replace(BOLD, '<strong>$1</strong>');

  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, Helvetica, sans-serif; line-height: 1.5; padding: 40px;">
  <p>${html(salutation)}</p>

  <h3>${html(heading)}</h3>

${body.map((text) => `  <p>${html(text)}</p>`).join('\n\n')}

  <p>Yours faithfully,<br/>${claimant.fullName}<br/>${claimant.email}</p>
</body></html>`;
}

/** The same letter as plain text — for carriers that only take claims through
 * a web form, where the user pastes this into the description field. */
export function renderClaimLetterText(
  journey: Journey,
  verdict: Verdict,
  claimant: Claimant,
): string {
  const paragraphs = letterParagraphs(journey, verdict, claimant).map((text) =>
    text.replace(BOLD, '$1'),
  );
  return [...paragraphs, `Yours faithfully,\n${claimant.fullName}\n${claimant.email}`].join(
    '\n\n',
  );
}

/** "EU261 claim — Lufthansa LH873, 2026-08-10" */
export function claimEmailSubject(journey: Journey, verdict: Verdict): string {
  const flight = journey.number ? ` ${journey.number}` : '';
  return `${verdict.regulation ?? 'Compensation'} claim — ${journey.carrier}${flight}, ${journey.scheduledDeparture.slice(0, 10)}`;
}

/** Short cover note; the letter itself travels as the PDF attachment. */
export function claimEmailBody(journey: Journey, verdict: Verdict, claimant: Claimant): string {
  return [
    'Dear Customer Relations,',
    '',
    `Please find attached my claim for ${formattedAmount(verdict)} compensation under ${verdict.regulation} for ${serviceLabel(journey)} from ${journey.from.code} to ${journey.to.code} on ${journey.scheduledDeparture.slice(0, 10)}.`,
    '',
    'I look forward to your response within 6 weeks.',
    '',
    'Kind regards,',
    claimant.fullName,
  ].join('\n');
}

/** "EU261-claim-LH873-2026-08-10.pdf" — the filename the carrier receives. */
export function claimPdfName(journey: Journey, verdict: Verdict): string {
  const flight = journey.number || `${journey.from.code}-${journey.to.code}`;
  return `${verdict.regulation ?? 'claim'}-claim-${flight}-${journey.scheduledDeparture.slice(0, 10)}.pdf`;
}
