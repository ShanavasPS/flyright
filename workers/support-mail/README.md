# support-mail Email Worker

Receives everything addressed to `support@getflyright.com` (Cloudflare Email
Routing rule → this Worker). Messages to `support+<token>@` are parsed (hand-rolled
MIME: multipart, base64, quoted-printable) and posted to the Convex HTTP action `/support-inbound`, which
files them into the matching `supportThreads` conversation; the mail is then
forwarded to the human inbox unless it originated there.

Build: `npm install && npm run build` (→ `dist/worker.js`, gitignored).

Deploy: `CLOUDFLARE_API_TOKEN=<Workers Scripts: Edit token> node scripts/deploy-support-worker.mjs`
(keeps the bindings below). Or by hand: upload `dist/worker.js` as script `flyright-support-mail` on the
Cloudflare account with bindings `SUPPORT_INBOX` (plain), `CONVEX_INBOUND_URLS`
(plain, comma-separated `https://<deployment>.convex.site/support-inbound`,
production first, dev second so test threads get replies too) and `INBOUND_SECRET`
(secret, = Convex `SUPPORT_INBOUND_SECRET`). No HTTP route is needed — the
Worker only has an `email` handler. Zone setting `support_subaddress` must be
on so `support+token@` reaches the `support@` rule.

Sender authentication: the Worker forwards the visible `From:` header and
Cloudflare's `Authentication-Results:` header alongside the body. Convex
(`support.inbound`) files a message as FlyRight's own reply only when the
envelope sender AND the From header are the support inbox AND that domain has
an aligned DKIM or DMARC pass — a forged From, or a stolen thread token, can
only add a message on the traveler's side, never impersonate support.
