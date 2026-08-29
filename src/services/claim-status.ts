/** The claim lifecycle after the wizard: which outcomes the user can record
 * at each stage, and how each stage presents. Pure — the claims store applies
 * the graph, the UI renders the labels. */

export type ClaimStatus = 'draft' | 'sent' | 'acknowledged' | 'paid' | 'rejected' | 'escalated';

/** Outcomes the user may record next. Forward-leaning but honest about the
 * real process: an airline can settle after rejecting (goodwill or an NEB
 * ruling), and an escalated claim ends paid or rejected. `draft` stays the
 * wizard's business and `paid` is terminal. */
export const NEXT_STATUSES: Record<ClaimStatus, ClaimStatus[]> = {
  draft: [],
  sent: ['acknowledged', 'paid', 'rejected'],
  acknowledged: ['paid', 'rejected'],
  rejected: ['escalated', 'paid'],
  escalated: ['paid', 'rejected'],
  paid: [],
};

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

/** Chip text — the state as a noun, not a sentence. */
export const STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  acknowledged: 'Acknowledged',
  paid: 'Paid',
  rejected: 'Rejected',
  escalated: 'Escalated',
};

/** Menu entries for recording an outcome — phrased as what happened. */
export const OUTCOME_LABELS: Record<ClaimStatus, string> = {
  draft: 'Back to draft', // unreachable; keeps the record total
  sent: 'Sent', // unreachable; keeps the record total
  acknowledged: 'The airline acknowledged it',
  paid: 'Compensation was paid',
  rejected: 'The airline rejected it',
  escalated: 'I escalated to the enforcement body',
};

/** Paid and rejected claims read as history; everything else still needs the
 * user's attention (a rejected claim moves back up when escalated). */
export function isClosed(status: ClaimStatus): boolean {
  return status === 'paid' || status === 'rejected';
}

/** Exactly what went out, frozen at send time: the email subject and cover
 * note, the letter HTML behind the PDF, and who it addressed. Stored as JSON
 * in claims.sent_snapshot so the user can always re-read their own claim. */
export interface SentSnapshot {
  subject: string;
  body: string;
  letterHtml: string;
  /** Who the letter addresses — the app never sees the composer's To field. */
  recipient: string;
  claimantName: string;
  claimantEmail: string;
  pdfName: string;
  via: 'email' | 'share';
}

export function parseSentSnapshot(json: string | null | undefined): SentSnapshot | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as SentSnapshot;
    return typeof value?.letterHtml === 'string' && typeof value?.subject === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}
