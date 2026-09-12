# Security remediation — 12 September 2026

All nine review findings have code changes, validated on the personal development Convex backend. The user authorized committing and deploying the production services on 12 September 2026. The rollout is in progress; its verified results will be recorded below. Updated mobile binaries remain a separate store release.

| Finding | Implemented change |
| --- | --- |
| 1. Profile impersonation | Client email arguments are ignored. Only a verified Clerk webhook/server reconciliation can mark email searchable. Unverified legacy addresses are excluded immediately. Avatar hosts and profile text are restricted. |
| 2. Photo ownership | Single-use upload tickets bind files to the authenticated uploader before reference. Referencing, returning URLs, and deleting require the ownership record. Purging one account cannot delete another account's files. Unproven legacy references are hidden and retained for recovery; local originals can re-upload through the new protocol and restore their trip updates. |
| 3. Document paths | Routes carry unpredictable temporary handles. Only trusted picker/share callbacks register private copies; readers and cleanup use a dedicated cache folder. iOS Inbox validation, Android content-URI grants, native canonical-path checks, 20 MB document limits, page/pixel/text limits, and finite PDF geometry checks are included. |
| 4. Automated abuse | Persistent counters cover support, people search, invitations, upload issuance, sync batches, updates, live sessions, and refreshes. Cancellation/deletion cannot reset invitation limits. The unmetered search query returns no results. Signed-out support uses email; in-app threads require a verified account address. Uploads accept bounded JPEG/PNG data, at most 30 uploads/user/day and 500 globally/day, with 500 stored files/user. |
| 5. OneSignal impersonation | Private pushes and push-to-start now target secret HMAC-derived aliases, obtained only through an authenticated action. The client no longer logs in with a public Clerk ID or attaches client-claimed email subscriptions. Missing configuration fails closed. This is a bearer-alias mitigation, **not OneSignal JWT identity verification**. |
| 6. Paid metering | Production lookups and Live Activity proxy calls refuse work when metering is unavailable; there is no production direct-provider fallback. Development without configuration retains its existing local mode. |
| 7. Refunds | Webhooks trigger authoritative RevenueCat subscriber snapshots rather than grants from event payloads. Generations reject stale responses; completed event IDs deduplicate retries. Both sides of transfers are reconciled. Production snapshots exclude sandbox purchases. Lifetime refunds cannot create a permanent grant. |
| 8. Link scope | A trip follow never creates or returns a circle invitation. Only owner-issued invitations can be redeemed. Older invite tokens are invalidated because their provenance cannot be established. Existing circle memberships are retained and should be reviewed by their owners. |
| 9. URL decoder | A small MIT/CommonJS backport replaces the recursive decoder used by query-string/Expo Router, without downgrading Expo. It scans malformed percent sequences in bounded steps. The npm override applies to every consumer. |

Other hardening: claim-letter text is escaped before HTML generation; Expo emits frame, content-type, referrer and baseline CSP headers; support sender authentication requires Cloudflare's authentication service identifier and rejects ambiguous duplicate headers; inbound bodies and MIME recursion are bounded. Contact and sharing screens explain support identity and the meaning of Pro badges.

## Validation

- `npm test -- --runInBand --watchman=false`: **56 suites, 616 tests passed**.
- `npm run test:security`: **15 checks passed** against actual handlers with synthetic identities, storage and database fixtures. These do not simulate Convex validators or transaction rollback.
- `npx convex codegen --typecheck enable` and `npm run typecheck`: passed.
- Web export: passed; the generated server routes manifest includes the security headers.
- iOS simulator build with signing disabled: passed.
- Android document-import module compilation: passed.
- Real development-backend smoke test: passed email spoof rejection, real image upload/storage validation, one-use replay rejection, foreign-file attachment rejection, and deletion isolation. Temporary profiles, photos and tickets were removed.
- Clerk reconciliation dry run: **26 production accounts, all with verified primary emails**. No production profile rows were changed.
- Clerk configuration patch: vendor dry-run validation passed. No settings were applied.
- `npm audit --omit=dev`: **27 moderate package entries, zero high or critical**. The URL-decoder advisory is removed. Remaining roots are `stream-json` in the unused Solana wallet dependency tree and `uuid` buffer handling in tooling/that tree; they were not blindly upgraded across incompatible major versions.
- Repository lint still reports the pre-existing `react-hooks/set-state-in-effect` error in `src/hooks/use-color-scheme.web.ts` and a default-import warning in `src/components/time-dialog.tsx`.

Local logs are under `/tmp/flyright-security-*`; they are temporary and not a durable deployment record.

## Concrete rollout

1. Backend enforcement now is authorized. It deliberately pauses private pushes to old public-ID subscriptions, expires old circle invitation links, and hides legacy cloud-photo references until ownership can be established from local originals. Existing local photos are retained. Older clients cannot use the retired unmetered people search.
2. Create a separate cryptographically random 32-byte base64url `PUSH_IDENTITY_SECRET` in each Convex environment. Keep it server-only and preserve it across deploys. Never expose it with an `EXPO_PUBLIC_` prefix. Rotation revokes the aliases and clients rebind on foreground/sign-in. No production secret has been created yet.
3. Deploy the Convex code, then run `node scripts/reconcile-profile-emails.mjs --prod --apply`. The script reads Clerk directly and never trusts old profile emails; it logs counts only. Inspect `securityMaintenance:inventory` for unknown/conflicting photo references without exporting personal data. Do not assign ownership to arbitrary historic storage IDs or delete unknown files.
4. Apply `security/clerk-production.patch.json` using the explicit production Clerk target. Its validated changes enable disposable-domain blocking and change enumeration protection from `bulk` to `strict`. Current production already has Smart CAPTCHA, PII protection, same-client email links, and lockout after 10 failed attempts for 60 minutes. Keep Native API enabled for the native app: [Clerk documents that this public native pathway bypasses CAPTCHA](https://clerk.com/docs/guides/secure/bot-protection), so backend budgets remain necessary.
5. Export using production EAS environment values and deploy hosting so the API fail-closed behavior and headers become live. Deploy the updated support-mail Worker through its existing script/bindings. No actual support messages were sent during validation.
6. Release updated iOS and Android binaries through the repository's full version-bump/release-notes/EAS workflow. Verify sign-in, new and recovered photo uploads, private push delivery, document imports, and circle invitations with two controlled accounts. The local compiler checks do not replace this device acceptance test.

## Limits that remain explicit

- OneSignal native JWT enforcement is still preferable if its supported integration becomes available. The installed React Native wrapper does not expose it; this change instead makes the external alias an unguessable bearer credential. Protect aliases from logs and other users. This does not retroactively erase historical data retained by OneSignal.
- Direct Convex photo URLs remain bearer URLs after they have been disclosed. Revoking a follower stops authorized discovery, but does not revoke an already-copied URL. Strong download revocation needs a separate authenticated media-serving design. Unknown legacy files are preserved for reconciliation, not silently deleted.
- Existing circle memberships have no reliable record of whether an old token originated from the owner or the faulty trip-follow flow. The patch prevents new promotions and invalidates old tokens; owners should review existing members.
- The CSP is a tested baseline covering embedding, objects and base URLs. It does not yet enforce a complete script-source allowlist.
- Provider administrator MFA, billing ceilings/WAF configuration, and handling actual abuse reports still need operational verification. Neither the original review nor these fixes establish that a compromise occurred or that scams are impossible.
