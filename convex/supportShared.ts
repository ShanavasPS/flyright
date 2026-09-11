/** Pure helpers for the support inbound path, kept free of Convex imports so
 * the Jest suite can exercise them (src/services/support-shared.test.ts). */

/** First bare address in a From header or envelope sender, lowercased:
 * `"Support" <a@b.com>` → `a@b.com`. Empty when there is none. */
export function bareAddress(value: string): string {
  return value.toLowerCase().match(/[^\s<>",]+@[^\s<>",]+/)?.[0] ?? '';
}

export function addressDomain(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase() : '';
}

/** `d` is `domain` itself or a subdomain of it — DMARC's relaxed alignment. */
function aligned(d: string, domain: string): boolean {
  return d === domain || d.endsWith(`.${domain}`);
}

/**
 * Whether the mail receiver's Authentication-Results say the message was
 * genuinely sent on behalf of `domain`. Cloudflare Email Routing checks SPF,
 * DKIM and DMARC on every inbound message and records the outcome in an
 * `Authentication-Results:` header (RFC 8601); the Worker forwards that
 * header verbatim. A From address is trivial to forge — only an aligned
 * signature (or a DMARC pass, which implies one) proves the sender's domain.
 *
 * Accepts: `dmarc=pass` whose `header.from` aligns with the domain, or a
 * `dkim=pass` whose `header.d` aligns. SPF alone is not enough — it only
 * authenticates the envelope sender, which a forger controls. Missing or
 * unparseable results fail closed.
 */
export function senderAuthenticated(authResults: string | null | undefined, domain: string): boolean {
  if (!authResults || !domain) return false;
  const text = authResults.toLowerCase();
  const wanted = domain.toLowerCase();

  // Each method result is `method=result` followed by its properties, up to
  // the next `;`. Header folding is already undone by the Worker's Headers API.
  for (const clause of text.split(';')) {
    const dkim = clause.match(/^\s*dkim=pass\b[\s\S]*?header\.d=([a-z0-9.-]+)/);
    if (dkim && aligned(dkim[1], wanted)) return true;
    const dmarc = clause.match(/^\s*dmarc=pass\b[\s\S]*?header\.from=([a-z0-9.-]+)/);
    if (dmarc && aligned(dmarc[1], wanted)) return true;
  }
  return false;
}

/**
 * Whether an inbound support message may be filed as FlyRight's own reply
 * — the one path that shows in the app as "from FlyRight", pushes the
 * traveler and gets relayed to their mailbox. All three must hold: the
 * envelope sender is the inbox, the visible From is the inbox, and the
 * receiver authenticated the inbox's domain.
 */
export function isSupportReply(input: {
  envelopeFrom: string;
  headerFrom: string | null | undefined;
  authResults: string | null | undefined;
  inbox: string;
}): boolean {
  const inbox = input.inbox.trim().toLowerCase();
  if (!inbox) return false;
  if (bareAddress(input.envelopeFrom) !== inbox) return false;
  // Older Worker builds sent no From header; treat that as a mismatch rather
  // than trusting the envelope alone.
  if (bareAddress(input.headerFrom ?? '') !== inbox) return false;
  return senderAuthenticated(input.authResults, addressDomain(inbox));
}
