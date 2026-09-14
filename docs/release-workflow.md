# FlyRight release guide

This is the shared operational reference for the full release flow in [AGENTS.md](../AGENTS.md). Imported from Claude's project memories on 2026-09-14 at the user's request so either agent can execute "submit new builds" or "run new builds" in future sessions. Read [release-state.md](release-state.md) before each release and update it afterwards.

The request authorizes versioning, both production builds/uploads, hosting deployment, local dev rebuilds, store notes/screenshots, App Store review submission, Play production promotion, and commit/push. Run the workflow through to its verified endpoints without intermediate confirmation. Follow an explicitly narrower user request when given.

## Before building

- Inspect `git status`, recent commits, `app.json`, `package.json`, and current EAS/store state. Resume already scheduled work when continuing a release; do not bump or schedule duplicate builds merely because a session restarted.
- Preserve unfinished work. If a release must exclude unrelated changes, use an isolated release worktree containing the complete intended release. Modified tracked files that import omitted untracked files can produce a broken EAS archive. Stage the exact version hunks so a bump does not accidentally include unrelated dependencies without their lockfile changes. `npm ci --include=dev --dry-run` in the release worktree caught that failure previously.
- Read the exact Expo SDK 57 documentation required by AGENTS.md before writing code. Use the global `eas` binary for release commands.
- Run `eas build:version:get -p all` before scheduling and put current + 1 into `app.json`. Failed builds still consume remote numbers. After scheduling or retrying, read EAS again and align `app.json` with the numbers actually assigned before the final native prebuilds.
- If Node/EAS requests fail with an empty TLS reason on this machine's VPN, use `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"` for those commands. Both flags were needed; do not change VPN or system network settings.

## Credential locations and API access

Use existing credentials in place. This public repository records locations and non-secret identifiers only; never copy private keys, session tokens, passwords, or pulled environment values into tracked files or tool output.

| Service | Existing access |
| --- | --- |
| App Store Connect | Gitignored `./asc-api-key.p8`; key/team/issuer identifiers and provisioning fallback are in AGENTS.md. App ID `6801505051`; bundle resource `78P75R8NWZ`. |
| Google Play | Gitignored `./google-service-account.json`, also referenced by `eas.json`. Package `com.shanavasshaji.flyright`. `scripts/upload-play-assets.mjs` contains a working token-exchange/API recipe. |
| EAS | Owner `shanavascruise`; check the active login. Production values are available through `eas env:pull --environment production --path .env.production.local`. |
| Convex | Production `limitless-oyster-269`, development `watchful-swordfish-508`. `npx convex deploy -y` has standing authorization for backend changes. |
| Android Maps | `GOOGLE_MAPS_ANDROID_API_KEY` in gitignored `.env` and EAS environments. Preserve it for Android prebuilds; see AGENTS.md. |

For ASC, generate a short-lived ES256 JWT with the existing key, the issuer/key ID from AGENTS.md, and audience `appstoreconnect-v1`. Node crypto signatures must use `dsaEncoding: 'ieee-p1363'`. The API base is `https://api.appstoreconnect.apple.com/v1`. Credential/provisioning failures during iOS builds use the `expect` and `EXPO_ASC_*` fallback already in AGENTS.md.

For Play, sign an RS256 service-account assertion and exchange it at `https://oauth2.googleapis.com/token` with scope `https://www.googleapis.com/auth/androidpublisher`. The publisher base is `https://androidpublisher.googleapis.com/androidpublisher/v3`. Keep all Play edits sequential and wait for the EAS upload to finish first.

Historical helpers such as `asclib.mjs`, `asc-release.mjs`, `asc-upload-shots.mjs`, and `play-promote.mjs` were temporary scratchpad files, not committed release tooling. Check whether they still exist before using them; recreate missing helpers from these recipes and current official API documentation, rather than assuming a `/tmp` path is durable.

## Hosting and backend

After committing the bump and release notes, run:

```sh
eas env:pull --environment production --path .env.production.local
npx expo export -p web --clear
eas deploy --prod --environment production
```

Never omit `--path`: the default overwrites `.env.local`, which holds development settings. Never omit `--clear`: Metro previously reused cached development values in a production export. Inspect only non-secret public configuration in the exported client to confirm the production Convex URL and Clerk `pk_live` key prefix; it must not contain the development Convex URL or `pk_test` prefix.

Verify the served entry-JS hash at `https://flyright.expo.app` matches the local export. A successful deploy has previously left the production alias on an older build; if that happens, run `eas deploy:alias --prod --id <deploymentId> --non-interactive` and verify again. `getflyright.com` has been blocked by this machine's gateway, so the Expo domain is the verification fallback. After deployment, remove the production env file created by this release (restore any pre-existing file instead of discarding it).

`/api/app-version` reads public App Store and Play listings and returns notes only for versions the stores serve. The older iTunes lookup/Play-edit polling recipes are obsolete: iTunes returned 403 from Hosting, and opening Play edits interfered with uploads. Check the current route before troubleshooting.

Deploy pending backend changes needed by the release with `npx convex deploy -y`; generating types alone does not deploy functions. As last recorded on 2026-09-13, `APP_UPDATE_PUSH_ENABLED` was unset on production and enabling it was reserved for the user's decision. Do not treat a build request as enabling that switch: it announces the current live version to eligible older installs. See [app-icon-badges.md](app-icon-badges.md).

## Store completion

Poll `eas build:list` / `eas submit:list` until both builds and uploads finish, then wait for the iOS build to finish processing. A queued build, a TestFlight upload, or a Play internal release is only an intermediate result.

For App Store Connect:

1. Query the app's current versions and builds. Create or reuse the version record matching the new version string; do not create a duplicate or blindly reuse an old saved ID.
2. Attach the processed build. A transient attach 409 has previously cleared on retry; inspect the response/state before retrying.
3. Update the en-US localization's `whatsNew` from `src/constants/release-notes.ts`. Save release-specific reviewer notes under `store/apple/review-notes-<version>.txt` and PATCH the existing `appStoreReviewDetail`; ASC copies it from the previous version, so attempting to POST another one has failed with 409.
4. Preserve the configured demo account and password in ASC. The historical reviewer sign-in uses "Use another method → Sign in with your password". Do not replace it with an email-code-only flow or put the password into the repository.
5. Upload any changed screenshots before submitting. Set `releaseType: AFTER_APPROVAL`, create the review submission and its app-version item, and submit it. Verify `WAITING_FOR_REVIEW` or a later successful state.

For Google Play:

1. Confirm the EAS Android submission is finished. `eas.json` auto-submits to `internal`; a separate production promotion is required.
2. Create an edit, PUT `applications/<package>/edits/<editId>/tracks/production` with the new versionCode, release name, en-US release notes (maximum 500 characters), and `status: completed`, then POST the edit's `:commit` endpoint.
3. Verify the production track contains the intended versionCode and completed rollout. Distinguish Play acceptance from public-store propagation or pending review in the final report.

Do not open edits even for read-style polling while an Android submission is uploading: this has repeatedly invalidated EAS's edit. If an upload fails with an expired/deleted edit, inspect its submission log, ensure no competing edit remains, and retry `eas submit -p android --latest --non-interactive` only after confirming the latest artifact is the intended release.

`store.config.json` has been recorded as stale. Do not run a blanket `eas metadata:push` without reconciling it with the live listing; the generator's old comment suggesting that command does not override this release guide.

## Screenshots

When the UI depicted in the listing changed, capture it from the new release on iPhone, iPad, and Android and upload before store submission. When the displayed panels are unchanged, carry them forward and record why. Use existing `.maestro/` flows where applicable and commit any new reusable flows.

- Seed dedicated demo devices anonymously with `node scripts/seed-demo-data.mjs --ios --sim <udid>` and `node scripts/seed-demo-data.mjs --android`. Add `--travel-day` for the upcoming-flight panel. The script gives all platforms the same nine-trip history anchored to now. Signed-in devices can pull real cloud trips over the seed, producing inconsistent panels.
- Capture from release binaries: after explicit prebuilds, use `npx expo run:ios --configuration Release --no-bundler` and `npx expo run:android --variant release --no-bundler`. The dev client can overlay a persistent "Refreshing…" banner. Restore development binaries afterwards.
- The committed generator reads iPhone raws from `store-assets/raw/` (1206×2622) and Pixel raws from `store-assets/raw/pixel/` (1080×2424). Use the exact filenames in `scripts/generate-store-screenshots.mjs`, then run `node scripts/generate-store-screenshots.mjs`. Play panels must depict Android. The last iPad capture was 2064×2752 from iPad Pro 13-inch M4, resized to 2048×2732 for its ASC set; verify accepted sizes for the current set before uploading.
- Navigate with `flyright:///`, `/journey/<id>`, `/world`, `/stats`, and `/add-flight` deep links. Multiple booted simulators have confused the Maestro MCP driver; target the capture simulator and use the Maestro CLI if necessary. Handle the iOS "Open in FlyRight?" and ATT prompts before shooting.
- On dedicated iOS demo simulators, uninstalling the app does not clear the keychain. If a stale login contaminates the seed, reset that demo simulator's keychain/local demo DB, relaunch for migrations, then seed again. On dedicated Android demo emulators, `adb shell pm clear com.shanavasshaji.flyright` clears local app state; relaunch for migrations, finish/skip onboarding, then seed. Do not clear the user's personal device or cloud data.
- Remove an existing capture target before `simctl io <udid> screenshot <file>` if its provenance xattr prevents overwriting. On Android, keep the emulator awake with `adb shell svc power stayon true`, clear system notifications, set demo clock/network indicators, and wait for the app/map to render (previously about 18 seconds on cold start and 25 seconds for a journey map). Inspect the captures visually.
- ASC screenshots use reserve → PUT upload parts → PATCH checksum/upload completion, then PATCH the screenshot-set relationship to preserve order. Replace images while the version is editable; deletion returns 409 after `WAITING_FOR_REVIEW`. Query screenshot-set IDs for the current version rather than copying old ones.
- Play uploads use `node scripts/upload-play-assets.mjs` after assets are regenerated. It replaces listing image sets and opens/commits an edit, so run it only after EAS submission finishes and separately from production promotion.

## Final verification and handoff

Restore both local development apps after any release-build captures. Explicitly run `npx expo prebuild -p ios` / `npx expo prebuild -p android` before the corresponding `expo run` commands. The existing native directories are generated and may otherwise retain old config. Boot `Pixel_9a` if needed. The last recorded `expo run:android --device emulator-5554` failed name matching; omit that flag when only one emulator is running.

Verify both the version string and native build number on the actual installed simulator/emulator apps; Settings reads the installed binary. Android `expo run:android` has previously exited successfully despite an install failure, and iOS has occasionally selected a different booted simulator, so command success alone is insufficient.

Update [release-state.md](release-state.md) with dated, observed results: commit/version; EAS build/submission IDs and numbers; ASC version/build/review IDs and status; Play production versionCode/rollout status; hosting deployment/hash verification; backend deployment if applicable; notes/screenshots; local installed versions; and any outstanding store review/propagation. Commit and push all release artifacts and the state update, and verify the branch is in sync with its upstream. Report completion from those observations.

## Source history

The migrated sources were `flyright-submit-builds-means.md`, `flyright-autonomous-ios-builds.md`, `flyright-access-map.md`, `flyright-release-state.md`, `flyright-store-screenshots.md`, `flyright-env-pull-clobber.md`, `flyright-convex-prod-deploy.md`, `flyright-app-update-notice.md`, and `node-ipv6-blackhole-vpn.md` under `~/.claude/projects/-Users-sshaji-Documents-Projects-flyRight/memory/`. Its `MEMORY.md` indexes additional project history when available. These shared release documents are sufficient without that private directory; keep future release instructions and observations here so both agents receive them.
