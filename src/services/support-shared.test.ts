import { bareAddress, isSupportReply, senderAuthenticated } from '../../convex/supportShared';

const INBOX = 'owner@gmail.com';
const GMAIL_PASS =
  'mx.cloudflare.net; dkim=pass header.d=gmail.com header.s=20230601 header.b=abc123; ' +
  'spf=pass (mx.cloudflare.net: domain of owner@gmail.com designates 209.85.1.1 as permitted sender) ' +
  'smtp.mailfrom=gmail.com; dmarc=pass header.from=gmail.com policy.dmarc=none; arc=none';

describe('bareAddress', () => {
  it('extracts the address out of a display-name form', () => {
    expect(bareAddress('Support <Owner@Gmail.com>')).toBe('owner@gmail.com');
    expect(bareAddress('owner@gmail.com')).toBe('owner@gmail.com');
    expect(bareAddress('"Quoted, Name" <a@b.co>')).toBe('a@b.co');
    expect(bareAddress('nothing here')).toBe('');
  });
});

describe('senderAuthenticated', () => {
  it('accepts an aligned DKIM pass', () => {
    expect(senderAuthenticated('mx.cloudflare.net; dkim=pass header.d=gmail.com header.s=x', 'gmail.com')).toBe(true);
  });
  it('accepts an aligned DMARC pass', () => {
    expect(senderAuthenticated('mx.cloudflare.net; dmarc=pass header.from=gmail.com policy.dmarc=none', 'gmail.com')).toBe(true);
  });
  it('accepts a subdomain signature (relaxed alignment)', () => {
    expect(senderAuthenticated('x; dkim=pass header.d=mail.example.com', 'example.com')).toBe(true);
  });
  it('rejects a DKIM pass for a different domain', () => {
    expect(senderAuthenticated('x; dkim=pass header.d=attacker.com; spf=pass smtp.mailfrom=attacker.com', 'gmail.com')).toBe(false);
  });
  it('rejects a look-alike domain that merely ends with the wanted one', () => {
    expect(senderAuthenticated('x; dkim=pass header.d=notgmail.com', 'gmail.com')).toBe(false);
  });
  it('rejects SPF alone — the envelope sender is forgeable', () => {
    expect(senderAuthenticated('x; spf=pass smtp.mailfrom=gmail.com; dkim=none; dmarc=fail header.from=gmail.com', 'gmail.com')).toBe(false);
  });
  it('rejects dkim=fail and dmarc=fail even when aligned', () => {
    expect(senderAuthenticated('x; dkim=fail header.d=gmail.com; dmarc=fail header.from=gmail.com', 'gmail.com')).toBe(false);
  });
  it('fails closed without results', () => {
    expect(senderAuthenticated(null, 'gmail.com')).toBe(false);
    expect(senderAuthenticated('', 'gmail.com')).toBe(false);
    expect(senderAuthenticated('mx.cloudflare.net; none', 'gmail.com')).toBe(false);
  });
});

describe('isSupportReply', () => {
  it('files a genuine reply from the inbox as support', () => {
    expect(
      isSupportReply({ envelopeFrom: INBOX, headerFrom: `Owner <${INBOX}>`, authResults: GMAIL_PASS, inbox: INBOX }),
    ).toBe(true);
  });
  it('rejects a forged From header carried by a third-party envelope', () => {
    expect(
      isSupportReply({
        envelopeFrom: 'bounce@attacker.com',
        headerFrom: `FlyRight Support <${INBOX}>`,
        authResults: 'x; spf=pass smtp.mailfrom=attacker.com; dkim=pass header.d=attacker.com; dmarc=none',
        inbox: INBOX,
      }),
    ).toBe(false);
  });
  it('rejects a forged envelope sender whose signature belongs to someone else', () => {
    expect(
      isSupportReply({
        envelopeFrom: INBOX,
        headerFrom: INBOX,
        authResults: 'x; spf=softfail smtp.mailfrom=gmail.com; dkim=pass header.d=attacker.com; dmarc=fail header.from=gmail.com',
        inbox: INBOX,
      }),
    ).toBe(false);
  });
  it('rejects when the visible From differs from the envelope', () => {
    expect(
      isSupportReply({ envelopeFrom: INBOX, headerFrom: 'someone@else.com', authResults: GMAIL_PASS, inbox: INBOX }),
    ).toBe(false);
  });
  it('rejects a payload from an older Worker that sent no From header', () => {
    expect(isSupportReply({ envelopeFrom: INBOX, headerFrom: null, authResults: GMAIL_PASS, inbox: INBOX })).toBe(false);
  });
  it('rejects everything when no inbox is configured', () => {
    expect(isSupportReply({ envelopeFrom: INBOX, headerFrom: INBOX, authResults: GMAIL_PASS, inbox: '' })).toBe(false);
  });
});
