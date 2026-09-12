**FlyRight security review — 12 September 2026**

Remediation is recorded separately in [security/remediation-2026-09-12.md](security/remediation-2026-09-12.md). The findings and line numbers below describe the original reviewed code.

The review found exploitable application logic defects relevant to impersonation, automated abuse, and data loss. The existing controls are useful, but the app should not be considered adequately protected from these threats until the priority findings below are addressed. This review found vulnerabilities; it did not establish that anybody has exploited them.

Reviewed the working tree at commit `95a0c17`, app version `1.0.32`: Expo routes, Convex public functions and HTTP handlers, Clerk authentication, RevenueCat entitlements, OneSignal identity and notifications, support email, trip sharing, file storage, native document intake, dependency metadata, and selected secret patterns. Read the required [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/). Existing demo/recording edits were left alone. No application code, provider settings, deployment, or account data was changed.

**Priority findings**

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | High | Searchable profile email can impersonate another person | Local reproduction |
| 2 | High | File ownership bypass can delete another account's photo | Local reproduction; known file ID required |
| 3 | High | Document deep link can request deletion of an arbitrary app-private file | Actual import effect reproduced with native deletion stubbed |
| 4 | High / Medium | Multiple public functions permit bot abuse despite existing limits | Four local reproductions |
| 5 | High if identity verification is disabled | OneSignal login trusts a public user ID without server proof | Code and vendor documentation; dashboard setting unverified |
| 6 | Medium | Paid API and notification meters allow calls when metering fails | Local lookup reproduction; notification path reviewed |
| 7 | Medium | Lifetime refund handling can preserve permanent Pro access | Local event reproduction |
| 8 | Medium | Single-flight link can grant access to the traveller's wider circle | Code trace; product permission design issue |
| 9 | Moderate | Known denial-of-service dependency is used by URL parsing | npm audit and installed call site |

**1. High — searchable email is controlled by the client**

[convex/users.ts:192](/Users/sshaji/Documents/Projects/flyRight/convex/users.ts:192) authenticates the caller but accepts `email`, `name`, and `imageUrl` from that caller. It writes the supplied email into the profile search index without comparing it with a verified Clerk email. [convex/circle.ts:184](/Users/sshaji/Documents/Projects/flyRight/convex/circle.ts:184) then finds this profile when someone searches for the supplied address.

A normal account can claim a friend's email, copy their name/photo, and appear when a traveller searches for that friend. This does not take over the friend's Clerk account, but it defeats the trust users place in exact-email discovery and can trick them into sharing their travel with an impersonator. An arbitrary avatar URL also gives the profile owner an opportunity to track image requests.

Reproduced: a caller authenticated as `attacker@example.invalid` stored `friend@example.invalid`; a second caller searching for the friend received the attacker's account.

Fix: derive searchable email only from authenticated, verified Clerk claims or a server-side Clerk lookup. If the current Convex token lacks email, retain the trusted webhook value and perform server-side reconciliation. Ignore legacy client email arguments. Verify the primary email's verification status in the webhook too. Rebuild existing searchable emails from trusted Clerk data, because changing the writer alone leaves already-poisoned rows in place. Restrict avatar sources and bound profile text. Regression: changing the client's email must never change which verified address finds the account.

**2. High — storage IDs are accepted without file ownership**

[convex/photos.ts:33](/Users/sshaji/Documents/Projects/flyRight/convex/photos.ts:33) accepts any `_storage` ID into the caller's photo row. [convex/updates.ts:125](/Users/sshaji/Documents/Projects/flyRight/convex/updates.ts:125) also accepts one when posting an update. Neither checks which user uploaded the file. The account-deletion cleanup then deletes every referenced file in [convex/users.ts:122](/Users/sshaji/Documents/Projects/flyRight/convex/users.ts:122).

An attacker who knows another user's file ID can attach it to their own account, then delete their own account. Cleanup deletes the victim's file even though the victim's photo row remains. Shared photo URLs are a realistic source of known file IDs; this finding does not assume IDs can be guessed. The local fixture confirmed both attaching a victim file and deleting it during attacker cleanup. The cleanup was invoked as the internal handler in the fixture; production reaches it through the signed Clerk `user.deleted` webhook.

Fix: maintain an authoritative upload-owner record, bind uploads to the authenticated uploader, and require ownership before referencing, replacing, publishing, or deleting a file. Account cleanup must delete only files proven to belong to that account. Do not let a first caller claim arbitrary existing storage IDs. Reconcile existing references before enforcing the new model.

Separately, current photo URLs remain usable after a follower loses access unless the file is deleted or replaced. Convex documents that direct file URLs are bearer URLs and recommends authenticated HTTP actions when each read must be authorized. Decide whether revocation must also revoke future photo downloads. [Convex file serving security](https://docs.convex.dev/file-storage/serve-files).

**3. High — document import deletes a URL-supplied path**

[src/screens/import-document.tsx:149](/Users/sshaji/Documents/Projects/flyRight/src/screens/import-document.tsx:149) takes `uri` from route parameters. Its effect runs immediately and calls `new File(fileUri).delete()` in `finally` at [line 200](/Users/sshaji/Documents/Projects/flyRight/src/screens/import-document.tsx:200), including when both readers reject the file. There is no check that the path was issued by a picker, received through document intake, or copied into a dedicated import directory. The app exposes a `flyright` URL scheme.

A crafted app link can target an existing file the app is permitted to delete. Android app-private paths are predictable enough to make local journal loss a credible impact. iOS sandbox identifiers make an exact target less predictable. This is confined to the app's filesystem permissions; it is not device-wide deletion.

Reproduced by executing the actual import effect with a synthetic app-private database URI and readers that reject it. It still invoked deletion of that URI. Native deletion was stubbed; no device data was destroyed and this was not an end-to-end device exploit test.

Fix: route with an opaque import handle created by trusted intake. Copy incoming documents into a dedicated import directory and operate only on that registered copy. Validate canonical paths and allowed URI schemes before reading; delete only the exact copy created for that import. Reject arbitrary route-provided filesystem paths, traversal, and symlinks. Add byte, pixel, and processing limits: an eight-page cap alone does not bound malicious PDF page dimensions or decompression.

**4. High / Medium — bot controls are incomplete at the backend**

The limits need to apply to every callable public function. UI restrictions and a newer client do not retire older functions.

| Entry point | Confirmed bypass | Consequence and fix |
| --- | --- | --- |
| [support.startThread](/Users/sshaji/Documents/Projects/flyRight/convex/support.ts:169), [support.reply](/Users/sshaji/Documents/Projects/flyRight/convex/support.ts:214) | Anonymous thread creation is limited only by the caller-supplied email. Rotating it produced 25 threads. One signed-in thread accepted 25 immediate replies. All scheduled email delivery. | **High:** inbox flooding, resource consumption, and support messages claiming an unverified reply identity. Add authenticated-account, thread, trusted request-source, and global send limits; challenge anonymous submissions. Preserve a recovery path for travellers unable to sign in. Do not treat the supplied reply address as proof of identity. |
| [photos.generateUploadUrl](/Users/sshaji/Documents/Projects/flyRight/convex/photos.ts:21) | One account obtained 60 upload URLs with no application quota, upload-owner record, MIME/byte validation, or orphan cleanup in this path. | **High:** storage/bandwidth abuse and arbitrary-file hosting. Reserve account/global byte budgets and upload counts before accepting data, validate actual file content, finalize ownership, and remove rejected/orphaned uploads. Provider resource ceilings are not an application abuse policy. |
| [circle.findPeople](/Users/sshaji/Documents/Projects/flyRight/convex/circle.ts:175) | Legacy query served 205 searches without charging a quota; `searchPeople` is separately capped at 200/day. | **Medium:** account enumeration and discovery of user IDs for targeting. Retire the unmetered endpoint or make it return an upgrade response. Its comment explicitly preserves it for older clients; app version checks cannot prevent direct invocation. |
| [circle.requestFollow](/Users/sshaji/Documents/Projects/flyRight/convex/circle.ts:239), [circle.cancelRequest](/Users/sshaji/Documents/Projects/flyRight/convex/circle.ts:443) | Cancelling removes the pending request, allowing immediate reinvitation. Reproduced 25 eligible notification jobs. | **Medium:** repeated notification harassment and job churn. Add an attempt counter and sender/recipient cooldown independent of pending rows. Delivery checks whether a request still exists, so instant cancellation can suppress a push; waiting for delivery before cancelling avoids that protection. |

Generated Convex upload URLs accept large files independently of the client UI, so client compression or picker restrictions do not solve upload abuse. [Convex upload documentation](https://docs.convex.dev/file-storage/upload-files).

Also review quotas for journey/update creation, live-session creation, `live.refreshFacts`, and `entitlements.refreshMine`; these authenticated public entry points can schedule work or make third-party calls. They were traced but were not load-tested.

Do not assume Clerk's browser CAPTCHA stops native bots. Clerk's current documentation states that its Native API exposes a public pathway that bypasses browser CAPTCHA, even with bot sign-up protection enabled. The native app needs this pathway, so backend abuse limits remain necessary. [Clerk bot protection limitations](https://clerk.com/docs/guides/secure/bot-protection).

**5. High if disabled in production — OneSignal lacks proof of identity**

[src/services/notifications.ts:143](/Users/sshaji/Documents/Projects/flyRight/src/services/notifications.ts:143) calls `OneSignal.login(userId)` with the Clerk ID alone. The public profile/search responses expose these IDs, and [convex/onesignal.ts:33](/Users/sshaji/Documents/Projects/flyRight/convex/onesignal.ts:33) sends private notification content to those external IDs.

If OneSignal identity verification is disabled, a modified client that knows a victim's ID can associate a subscription with that identity and receive notifications intended for them. Support reply previews and travel information can then help an attacker construct convincing phishing messages. OneSignal explicitly documents impersonation risk without identity verification. [OneSignal identity verification](https://documentation.onesignal.com/docs/en/identity-verification).

The code gap is confirmed; the production OneSignal setting and cross-device behavior were not tested. The installed React Native SDK is `5.5.8`; its exposed `login` method accepts one string and has no JWT argument. Remediation therefore needs a verified SDK/native integration plan: issue short-lived OneSignal identity JWTs only after authenticating the Clerk session, use a supported native bridge or compatible SDK, then require verification at OneSignal. Do not merely turn on enforcement before compatible clients exist. Meanwhile, reduce sensitive push previews and investigate identity/subscription changes.

**6. Medium — metering fails open**

[src/server/lookup-gate.ts:295](/Users/sshaji/Documents/Projects/flyRight/src/server/lookup-gate.ts:295) returns a full permit when the quota secret/client is absent and when Convex metering throws. [src/app/api/live-activity+api.ts:145](/Users/sshaji/Documents/Projects/flyRight/src/app/api/live-activity+api.ts:145) similarly permits notification calls on missing or failed metering.

Reproduced a production-mode lookup permit with no quota configuration. Actual spending during a complete Convex outage also depends on whether the upstream call can succeed; a working provider with broken/misconfigured metering is the relevant exposure. The Live Activity route accepts caller-chosen IDs and does not establish that the activity exists before attempting the upstream call, so its credential entropy alone does not prevent relay abuse.

Fix: refuse new paid work when production metering is unavailable; continue serving cached flight facts. Add a bounded emergency allowance only if it is backed by an independent durable counter. Validate required configuration at deployment, maintain upstream spending ceilings, and alert on meter failures. Check that address headers used for rate limits are overwritten by the trusted hosting edge; their production provenance was not verified. A copied web marker/Origin is not bot authentication.

**7. Medium — lifetime refunds can remain entitled**

[convex/entitlementShared.ts:25](/Users/sshaji/Documents/Projects/flyRight/convex/entitlementShared.ts:25) treats `CANCELLATION` as granting access. If `expiration_at_ms` is null, it assigns `9999-12-31`, including a cancellation/refund of a lifetime purchase. RevenueCat uses cancellation events for refunds as well as auto-renewal cancellation. [RevenueCat event definitions](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).

Reproduced: a `CANCELLATION` event for `Owed Pro` with null expiry produces the lifetime timestamp. The normal client's entitlement refresh may later correct this, but an abusive client need not invoke that refresh. This can preserve server-side Pro benefits after a refund.

Fix: reconcile cancellation/refund events against RevenueCat's current authoritative subscriber state on the server, accounting for other active products. Preserve ordinary paid-through access for non-refunded subscriptions. Also retain and validate environment/app identifiers and event IDs/timestamps: the current handler drops these fields, so deployment filtering and out-of-order delivery deserve verification. Add lifetime refund, normal cancellation, transfer, stale-event, and sandbox isolation tests.

**8. Medium — a single-trip link expands into a circle invitation**

[convex/live.ts:254](/Users/sshaji/Documents/Projects/flyRight/convex/live.ts:254) gives a signed-in single-trip follower the owner's circle invite token; [convex/circle.ts:824](/Users/sshaji/Documents/Projects/flyRight/convex/circle.ts:824) lets that follower redeem it without additional owner approval. The owner-side share message says "Follow my flight live" at [src/components/trip-share.tsx:107](/Users/sshaji/Documents/Projects/flyRight/src/components/trip-share.tsx:107). The follower is offered the broader access, but the owner has not separately granted it.

This is implemented product behavior rather than an accidental missing authentication check. A forwarded single-flight link can nevertheless let a stranger enter the wider circle and view circle-visible past/future trips, subject to the owner's capacity limit. Private and close-circle restrictions continue to apply.

Fix: keep trip tokens scoped to the trip. Broader following should create an owner-approved follow request, or require a circle invitation the owner explicitly chose to share. Make the access scope clear before the owner shares a link. Test that a trip-only token cannot mint or redeem wider access.

**9. Moderate — vulnerable URL decoder is in the routing dependency chain**

`npm audit --omit=dev --json` reported **30 moderate package entries, zero high, and zero critical**, representing three underlying advisory records plus affected dependents. This is not 30 independent proven app exploits.

The most relevant chain is `expo-router → query-string 7.1.3 → decode-uri-component 0.2.2`. The installed router calls `queryString.parse(query)` in `node_modules/expo-router/build/react-navigation/core/getStateFromPath.js:499`. The decoder has a known denial-of-service advisory for malformed percent-encoded input, making app/deep-link URL parsing a relevant surface. No resource-exhaustion payload was run against a device or production. [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).

The other advisory roots were `uuid` and `stream-json`, inherited through tooling and Clerk's wallet-related dependencies; their vulnerable functionality was not shown to be reachable from FlyRight features. Audit remediation suggestions include downgrading Expo packages across major versions, so they are not suitable to apply blindly. Select a compatible fixed dependency path or reviewed backport and verify web/native routing. The decoder maintainer has published a rewritten scanner in [version 0.5.0](https://github.com/SamVerschueren/decode-uri-component/releases), but compatibility with the older CommonJS consumer must be checked.

**Additional observations and verification gaps**

- The public homepage returned HSTS, but no `Content-Security-Policy`, `X-Frame-Options`, or `X-Content-Type-Options` header in the sampled response. Add a tested CSP with `frame-ancestors` and explicit resource policies, plus `nosniff`; confirm behavior on authenticated and share pages too. No clickjacking exploit was demonstrated.
- `renderClaimLetter` interpolates claimant/journey text into HTML without escaping in [src/claims/letter.ts:88](/Users/sshaji/Documents/Projects/flyRight/src/claims/letter.ts:88). Escape text before adding the allowed bold markup. This is currently a document-generation hardening item; cross-user script execution was not established.
- The support parser checks envelope sender, visible From, and aligned authentication results. Verify with a controlled inbound-email test that only Cloudflare's receiver-generated results can influence this decision. The parser accepts any matching semicolon-delimited clause and does not validate the authentication service identifier. A forged-email bypass was not demonstrated, so this is not counted as a confirmed support impersonation defect.
- Verify Clerk production bot/abuse settings, disposable-email policy, account-enumeration protection, session policy, and administrative MFA. Verify provider/dashboard access controls, webhook environment filters, billing caps, and production WAF rules. These cannot be inferred from repository code.
- Blocking and reporting exist and enforce several server-side relationship checks. Account suspension/report handling is manual; exercise that operational response. A blocked person who retains a public bearer trip link may still view its public content while signed out. Explain bearer sharing clearly and provide effective link revocation.
- The reviewed code keeps airline claim destinations in a maintained constants table and uses native email/browser handoffs. It does not expose a custom card-collection form in the reviewed flows. Keep official support identity visibly distinct from traveller profiles; a Pro badge must never imply identity verification. Add concise guidance at contact/share points about never sending login codes or paying a claimed support agent through a profile message.

**Validation and existing safeguards**

- Existing tests: **55 suites / 604 tests passed**. The first sandboxed attempt could not contact Watchman; the authorized rerun passed. Passing functional tests did not cover the reproduced authorization/abuse gaps.
- **Nine offline reproductions passed** against the actual TypeScript handlers or extracted import effect, with in-memory database/storage/auth fixtures. Convex registration and native deletion were stubbed, identities and IDs were synthetic, and outgoing network was disabled. The fixtures did not exercise Convex argument validators or platform enforcement. These establish handler behavior, not deployed configuration or end-to-end device exploitability.
- Targeted secret scan: **637 tracked text files and 336 local history commits**, no matches for the selected private-key, Stripe/Clerk secret, GitHub token, AWS access-key, and OneSignal secret formats. Binary files, files over 5 MB, unknown credential formats, remote-only history, and ignored local credentials were outside this scan. This is not a claim that every possible secret was excluded.
- Public DNS at review time: `getflyright.com` SPF was `v=spf1 include:_spf.mx.cloudflare.net ~all`; `_dmarc.getflyright.com` was `v=DMARC1; p=reject;`. DKIM signing across all legitimate senders was not verified. DMARC helps with exact-domain spoofing, not lookalike domains.
- Homepage HTTPS response included `strict-transport-security: max-age=31536000; includeSubDomains; preload`.
- Clerk session caching uses the SDK's token cache; Convex validates the configured issuer/audience; core journey and support reads enforce account ownership; the Clerk webhook verifies Svix signatures; RevenueCat/support HTTP handlers refuse missing or incorrect configured secrets; development helpers are internal mutations; share tokens use cryptographic randomness; deferred links use a narrow path allowlist; the Android backup plugin disables ordinary backup.

Local reproduction harness: [/tmp/flyright-security-checks.cjs](/tmp/flyright-security-checks.cjs). Outputs: [reproductions](/tmp/flyright-security-reproductions.log), [test log](/tmp/flyright-security-tests.log), [dependency audit](/tmp/flyright-security-npm-audit.json), [homepage headers](/tmp/flyright-security-headers.txt). These temporary files may be removed by the operating system.

Recommended work order: fix profile identity, file ownership/cleanup, and import path handling; close the public abuse bypasses; verify and secure OneSignal identity; then correct entitlement reconciliation, fail-open metering, link scope, and the routing dependency. Backend changes should preserve safe compatibility with installed clients. Native path and notification changes require a new binary. Retest using two controlled accounts before release.
