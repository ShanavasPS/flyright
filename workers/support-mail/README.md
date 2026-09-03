# support-mail Email Worker

Receives everything addressed to `support@getflyright.com` (Cloudflare Email
Routing rule → this Worker). Messages to `support+<token>@` are parsed (hand-rolled
MIME: multipart, base64, quoted-printable) and posted to the Convex HTTP action `/support-inbound`, which
files them into the matching `supportThreads` conversation; the mail is then
forwarded to the human inbox unless it originated there.

Build: `npm install && npm run build` (→ `dist/worker.js`, gitignored).

Deploy: upload `dist/worker.js` as script `flyright-support-mail` on the
Cloudflare account with bindings `SUPPORT_INBOX` (plain), `CONVEX_INBOUND_URL`
(plain, `https://<prod>.convex.site/support-inbound`) and `INBOUND_SECRET`
(secret, = Convex `SUPPORT_INBOUND_SECRET`). No HTTP route is needed — the
Worker only has an `email` handler. Zone setting `support_subaddress` must be
on so `support+token@` reaches the `support@` rule.
