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
  via: SentVia;
}

/** How the letter left the app: the mail composer, the share sheet, or the
 * airline's own web form (letter on the clipboard). */
export type SentVia = 'email' | 'share' | 'form';

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

/** The first lines of a sent letter as plain text, for a preview beside the
 * claim (the full letter stays on /claim-letter). Tags, styles and scripts go;
 * the common entities are decoded; the cut lands on a word, with an ellipsis. */
export function letterExcerpt(html: string, max = 180): string {
  const text = html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&pound;/g, '£')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

export interface SummaryItem {
  value: string;
  label: string;
  /** An amount — drawn in the money colour. */
  money: boolean;
}

/** The figures over a wide window's claims list: what is in progress, what
 * has been paid, and how many claims there are. Amounts only add up within
 * one currency; mixed currencies count instead, like the Claims eyebrow. */
export function claimsSummary(
  claims: readonly { status: ClaimStatus; amount: number; currency: string }[],
): SummaryItem[] {
  const total = (rows: typeof claims, label: string): SummaryItem => {
    const currency = rows[0].currency;
    return rows.every((r) => r.currency === currency)
      ? { value: `${rows.reduce((sum, r) => sum + r.amount, 0)} ${currency}`, label, money: true }
      : { value: String(rows.length), label, money: false };
  };
  const open = claims.filter((c) => !isClosed(c.status));
  const paid = claims.filter((c) => c.status === 'paid');
  const rejected = claims.filter((c) => c.status === 'rejected');
  const items: SummaryItem[] = [];
  if (open.length) items.push(total(open, 'in progress'));
  if (paid.length) items.push(total(paid, 'paid'));
  if (!open.length && rejected.length) items.push({ value: String(rejected.length), label: 'rejected', money: false });
  if (claims.length) items.push({ value: String(claims.length), label: claims.length === 1 ? 'claim' : 'claims', money: false });
  return items.slice(0, 3);
}
