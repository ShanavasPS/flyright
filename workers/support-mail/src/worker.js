/**
 * Email Worker behind the support@getflyright.com routing rule.
 *
 * Every message to support@ (and, via sub-addressing, support+<token>@) lands
 * here. Messages carrying a thread token are parsed and posted to Convex
 * (http.ts /support-inbound) so the conversation shows up in the app; then
 * the mail is forwarded to the human inbox unless it came FROM that inbox
 * (support's own reply, which the inbox already has) or already lists it as
 * a recipient (a traveler's reply-all).
 *
 * MIME parsing is done by hand (multipart/*, base64, quoted-printable,
 * charset via TextDecoder) to keep the bundle tiny enough to deploy through
 * the API without tooling; a parse failure never loses mail — forwarding
 * happens regardless.
 *
 * Bindings: SUPPORT_INBOX, CONVEX_INBOUND_URL (plain text), INBOUND_SECRET.
 * Build + deploy: see README.md.
 */
export default {
  async email(message, env) {
    const inbox = (env.SUPPORT_INBOX || '').toLowerCase();
    const from = (message.from || '').toLowerCase();
    const match = /^support\+([a-z0-9]+)@/i.exec(message.to || '');
    const token = match ? match[1].toLowerCase() : null;

    if (token) {
      try {
        const bytes = new Uint8Array(await new Response(message.raw).arrayBuffer());
        const parsed = parseMime(bytes);
        const text = (parsed.text && parsed.text.trim()) || htmlToText(parsed.html || '');
        const res = await fetch(env.CONVEX_INBOUND_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.INBOUND_SECRET}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            token,
            from: message.from,
            subject: decodeWords(message.headers.get('subject') || ''),
            text,
            emailId: message.headers.get('message-id'),
          }),
        });
        if (!res.ok) console.warn('[support-mail] inbound rejected', res.status, await res.text());
      } catch (err) {
        console.error('[support-mail] inbound failed', err);
      }
    }

    const recipients = `${message.headers.get('to') || ''} ${message.headers.get('cc') || ''}`.toLowerCase();
    if (from !== inbox && !recipients.includes(inbox)) {
      await message.forward(inbox);
    }
  },
};

// --- minimal MIME -----------------------------------------------------------

const latin1 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return s;
};
const toBytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function decodeText(bytes, charset) {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Returns { text, html } — the first text/plain and text/html bodies found. */
function parseMime(bytes) {
  const out = { text: '', html: '' };
  walk(latin1(bytes), out);
  return out;
}

function walk(raw, out) {
  const sep = raw.search(/\r?\n\r?\n/);
  const headerText = sep >= 0 ? raw.slice(0, sep) : raw;
  const body = sep >= 0 ? raw.slice(sep).replace(/^\r?\n\r?\n/, '') : '';
  const headers = parseHeaders(headerText);
  const ct = headers['content-type'] || 'text/plain';
  const type = ct.split(';')[0].trim().toLowerCase();
  const params = parseParams(ct);

  if (type.startsWith('multipart/') && params.boundary) {
    const parts = body.split(`--${params.boundary}`);
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('--')) break;
      walk(part.replace(/^\r?\n/, ''), out);
      if (out.text) return; // plain text wins; stop at the first one
    }
    return;
  }
  if (type !== 'text/plain' && type !== 'text/html') return;

  const enc = (headers['content-transfer-encoding'] || '').trim().toLowerCase();
  let decoded;
  if (enc === 'base64') {
    decoded = decodeText(toBytes(atob(body.replace(/[^A-Za-z0-9+/=]/g, ''))), params.charset);
  } else if (enc === 'quoted-printable') {
    const qp = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    decoded = decodeText(toBytes(qp), params.charset);
  } else {
    decoded = decodeText(toBytes(body), params.charset);
  }
  if (type === 'text/plain' && !out.text) out.text = decoded;
  if (type === 'text/html' && !out.html) out.html = decoded;
}

function parseHeaders(text) {
  const headers = {};
  for (const line of text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return headers;
}

function parseParams(value) {
  const params = {};
  const re = /;\s*([\w-]+)\s*=\s*(?:"([^"]*)"|([^;\s]+))/g;
  let m;
  while ((m = re.exec(value))) params[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  return params;
}

/** RFC 2047 encoded words in headers, e.g. =?UTF-8?Q?Re=3A_hello?= */
function decodeWords(value) {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, kind, data) => {
    try {
      const bytes =
        kind.toUpperCase() === 'B'
          ? toBytes(atob(data))
          : toBytes(
              data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, h) => String.fromCharCode(parseInt(h, 16))),
            );
      return decodeText(bytes, charset);
    } catch {
      return data;
    }
  });
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
    .replace(/<blockquote[^>]*>/gi, '\n> ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
