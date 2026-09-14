# FlyRight release state

Shared release log for Codex and Claude. Read before a release and prepend dated observations afterwards. Query EAS and both stores before acting; this file records observations, not automatically refreshed status. Follow [release-workflow.md](release-workflow.md).

## 2026-09-14 — physical iPhone startup verification, 09:06–09:09 UTC

Shanavas's paired **iPhone 15 Pro** was reachable through CoreDevice and already had **1.0.34 (51)** installed. No reinstall or data clearing was needed. Two cold starts requested the Settings and World deep links; their exact launched processes were still alive after **44 seconds** and **73 seconds**, respectively. The eight pre-existing FlyRight crash-log names were unchanged after testing: **no new FlyRight crash report** appeared during the observation. The read-only production backend check again verified all **57** referenced public functions.

Evidence: `.maestro/out/physical-2026-09-14/` contains the launch/process JSON, before/after crash inventories, installed app metadata and scoped report. This verifies startup/process survival on physical hardware. It does not establish signed-in status, screen rendering, the native photo probe or a complete candidate UI pass: `idevicescreenshot` could not connect through the phone's CoreDevice wireless connection.

Android discovery found only `emulator-5554`; no physical Android was connected or advertised through adb wireless debugging. The release instructions now require physical-device discovery and the available iPhone checks before falling back to simulator-only coverage. Maestro's iPhone limitation must not be treated as an inability to perform any physical-iPhone testing.

## 2026-09-14 — release regression checks added and exercised

No new store build, submission or backend deployment was performed for this verification. The checks ran from the working tree based on `1e70dae`, including the new, then-uncommitted test tooling.

| Check | Observed result |
| --- | --- |
| Preflight | TypeScript, 742 Jest tests and 5 backend-check regression tests passed; command exited zero |
| Live backend inventory | All 57 client API references were present/public on both production and development, including `followerActivities:mine` |
| iOS native regression | iPhone 16 Pro simulator on iOS 18.3, `1.0.34 (51)`, passed; simulator rebuilt from build 49 without clearing app data |
| Android native regression | Emulator `emulator-5554`, `1.0.34 (48)`, passed |
| Native cases | Old-container file path, HTTP failure, empty/missing file and successful retry; each platform produced exactly the three expected requests with matching bytes |
| Evidence | `.maestro/out/release/2026-09-14T08-52-02.125Z/` contains the passing report, JUnit results and both screenshots |
| Coverage still required before the next promotion | Production-configured candidate smoke with a dedicated signed-in account and trips/photos retained across releases; physical-device checks for affected native features |

The native probe simulates an old photo path and uses real native file/network APIs; it is not a physical-device run or a complete store upgrade test. Earlier runs failed on unavailable Metro/IPv4 access and remain recorded as failures. See [release-checks.md](release-checks.md) for the required gates.

## 2026-09-14 — 1.0.34 released (iOS in expedited review, Android live)

| Item | Result |
| --- | --- |
| Version | `1.0.34` — iOS build `51`, Android versionCode `48` |
| iOS build / ASC build | EAS `2d2798cd-db51-4529-b59d-a5ceebd57210` → ASC `e2872c49-35a0-4219-b3e8-8f3a0b0b4ce2` |
| ASC version record | `a10e2374-2f21-485a-971c-0d2bbe6b9bd0` (new; 1.0.33 was READY_FOR_SALE) |
| ASC review detail | `c362fafe-4e78-4a08-a8f0-49f1b7b37570`, PATCHed from `store/apple/review-notes-1.0.34.txt` |
| Review submission | `8f17c910-007f-4bd7-9394-b37c1672c00a` — WAITING_FOR_REVIEW, submitted 07:41Z |
| Expedited review | **Granted** via developer.apple.com/contact/app-store?topic=expedite; a rejection returns automatically to the expedited queue |
| Android | versionCode `48` auto-submitted to internal, promoted to **Play production**, completed rollout, notes 498 chars |
| Hosting | Redeployed; production alias verified serving entry `entry-b0af3055c7ed9429e2f29f5b5fb4da95.js`, matching `dist/` and the deployment URL |
| Screenshots | Carried over from the 1.0.30 reshoot — 6 iPhone 6.5", 3 iPad 12.9", all COMPLETE. The new boarding-pass card sits below the visible fold of the travel-day panel, so no panel became inaccurate |
| Local dev apps | iOS simulator `1.0.34 (49)`, Android emulator `1.0.34 (48)` — the simulator predates build 51 |
| Git | `7262b75` bump, `d575482` App Group + build number, `a1f3179` reviewer notes, `c7e4bcf` Convex step + notes trim; all pushed |

Three things went wrong and are worth carrying forward.

**App Groups cannot be registered with the ASC API key.** The Wallet share extension needed `group.com.shanavasshaji.flyright.wallet`, which had never existed. Capability *types* POST fine to `/v1/bundleIdCapabilities`; capability *identifiers* (App Groups, iCloud containers, merchant IDs) are absent from the public API entirely — `/v1/appGroups` 404s and `iris/v1/appGroups` 401s with a bearer token — so eas skips identifier syncing and the Xcode build dies with "Provisioning profile doesn't support the … App Group". Three builds were lost this way (numbers 47, 48, 50). Fixed by registering the group in the developer portal with the user signed in, assigning it to both bundle IDs, and letting eas regenerate the invalidated profiles. **The portal's App Group Assignment dialog's Continue is not the save**: the page's Save then raises a "Modify App Capabilities" confirm, and without that click the change silently reverts.

**Convex was never deployed, and build 51 crashed on every screen for signed-in iOS users.** `FollowerActivitySync` in the root layout queries `api.followerActivities.mine`; the function was committed but not deployed, so Convex answered "Could not find public function". `npx convex deploy -y` repaired the build already in review with no new binary. The release flow now deploys and verifies the backend before the builds.

**A shipped crash was nearly missed.** Asked whether the live version crashed, the first answer checked only the bug most recently in hand and wrongly said no. `ad02b7c` fixes a hard crash in the live 1.0.33: trip photos are stored as absolute paths, iOS moves the data container on every app update, and the old `createUploadTask(...).uploadAsync()` raises an uncatchable NSException for the missing file — so the crash fires exactly when a user updates. That is what justified the expedite. **When asked whether a released version crashes, search the release's commits for crash/fix wording before answering.**

## 2026-09-14 — memory migration and repository observation

No store or EAS queries were made during this documentation migration. The current repository is already ahead of the latest release recorded in Claude's private memory:

| Source | Observed value |
| --- | --- |
| `app.json` and `package.json` | Version `1.0.34` |
| `app.json` native numbers | iOS `49`, Android `48` |
| Latest local commit | `7262b75` — Bump to 1.0.34 with release notes, 2026-09-14 |
| EAS builds/uploads, store submission, hosting and local installations for 1.0.34 | Unverified in this session; inspect live state before resuming or starting another release |

Do not infer a new version or current EAS counter from the historical entry below.

## 2026-09-13 — 1.0.33 (imported historical observation)

Imported from Claude's `flyright-release-state.md` on 2026-09-14; not re-queried during migration.

| Item | Last recorded result |
| --- | --- |
| iOS | Build `46`, `WAITING_FOR_REVIEW`, automatic release after approval |
| ASC version ID | `82a336d7-8283-464d-84ac-ea694267bf96` |
| ASC review submission ID | `2054d333-caaa-4561-aa65-19c4f55fb244` |
| Android | versionCode `47`, production release `1.0.33 (47)`, completed rollout |
| Hosting | Deployment `m2z7goht7p`, served entry hash prefix `327ce825` verified |
| Reviewer notes | `store/apple/review-notes-1.0.33.txt`, PATCHed onto existing ASC detail |
| Screenshots | Carried over because the store panels had not changed; previous reshoot was 1.0.30 on 2026-09-10 |
| Local iOS app | iPhone 16 Pro simulator, `1.0.33 (46)` |
| Local Android app | Pixel_9a, `1.0.33 (47)` |
| Git | `ac1e002` version bump and `d2bd76b` reviewer notes, recorded as pushed |
| Backend | Convex production deployed, including app-update cron/table |

At that observation, iOS 1.0.32 was live, and `APP_UPDATE_PUSH_ENABLED` remained unset on production. Enabling release-announcement pushes was explicitly left to the user; a routine release request does not enable it. Verify current state before applying this historical observation.
