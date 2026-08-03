import type { Journey, Verdict } from '@/rules/types';

export interface Claimant {
  fullName: string;
  email: string;
  bookingReference?: string;
}

/**
 * HTML claim letter — rendered to PDF with expo-print and attached to a
 * pre-filled email to the carrier's claims address.
 */
export function renderEU261Letter(journey: Journey, verdict: Verdict, claimant: Claimant): string {
  const amount = verdict.compensation
    ? `${verdict.compensation.amount} ${verdict.compensation.currency}`
    : '';

  return `
<html><body style="font-family: -apple-system, Helvetica, sans-serif; line-height: 1.5; padding: 40px;">
  <p>To the Customer Relations department of ${journey.carrier},</p>

  <h3>Claim for compensation under Regulation (EC) No 261/2004</h3>

  <p>
    I was booked on flight <strong>${journey.number}</strong> from ${journey.from.code}
    to ${journey.to.code} on ${journey.scheduledDeparture.slice(0, 10)}
    ${claimant.bookingReference ? `(booking reference <strong>${claimant.bookingReference}</strong>)` : ''}.
  </p>

  <p>${verdict.reason}</p>

  <p>
    I hereby claim compensation of <strong>${amount}</strong> per passenger under
    Article 7 of Regulation (EC) No 261/2004, as interpreted by the Court of Justice
    in Cases C-402/07 and C-432/07 (Sturgeon).
  </p>

  <p>
    Please pay this amount by bank transfer within 14 days. If I do not receive a
    substantive response within 6 weeks, I will refer this claim to the
    ${verdict.escalationBody ?? 'competent national enforcement body'} and reserve
    the right to pursue it through the courts, including claiming interest and costs.
  </p>

  <p>Yours faithfully,<br/>${claimant.fullName}<br/>${claimant.email}</p>
</body></html>`;
}
