# FlyRight release state

Shared release log for Codex and Claude. Read before a release and prepend dated observations afterwards. Query EAS and both stores before acting; this file records observations, not automatically refreshed status. Follow [release-workflow.md](release-workflow.md).

## 2026-09-18 (evening) — Website: phone fold fix + captures with the flight in the air (hosting only, no store release)

| Item | Observed result |
| --- | --- |
| Code | `55fe709` (hero phones break the first screen on small phones: `Reveal eager`, tighter stacked rhythm) and `a61ee7d` (`travel-day.png` / `world.png` light+dark reshot from a fresh Release build on the Shots simulator with the demo flight airborne; `scripts/capture-landing-shots.mjs`). Hosting also carries today's `/api/flight-status` change (`withLocation=true`, `position` on the record) ahead of the client that reads it — additive, older binaries ignore the field. tsc/eslint clean |
| Hosting | Deployment `3al9b4pwb9` promoted; both `https://flyright.expo.app` and `https://getflyright.com` serve `entry-23f4298073126535015e6288ec11fec8.js` = local export; bundle has the production Convex URL (`limitless-oyster-269`) and the `pk_live` key, no development URL (`happy-otter-123` in the bundle is Convex's example hostname in an error string, not a deployment). Pre-existing `.env.production.local` restored from a backup |
| Backend | Not deployed in this session: `convex/flightNormalize.ts` / `providerFetch.ts` changes reach the Convex poll chain with the next `release:deploy-backend` |
| Simulators | Shots sim (E41015CC…) now holds a Release build of `a61ee7d`'s parent (build 54 label unchanged), reseeded with `demo-upcoming` in the air; dev sim CF8D70D3… has the same airborne seed |

## 2026-09-18 — Hotfix: overnight flights looked up a day early (backend + hosting only, no store release)

Incident: Shanavas's `QR516-2026-09-19` (DOH→COK) received two "moved 24 h earlier" pushes and ended up 48 h early; his circle got a heads-up and a "departed" push for a flight he was not on. Cause: AeroDataBox's `/flights/number/{flight}/{date}` defaults to `dateLocalRole=Both`, so an overnight flight answers a date with two legs — yesterday's (which lands on that date) first — and both callers took `legs[0]`. `lookupDayFor` then asked about the adopted day, so each lookup walked the trip back another day until it fell into the past. Details in the commit message.

| Item | Observed result |
| --- | --- |
| Code | `legDepartingOn(legs, date)` in `convex/flightNormalize.ts`, used by `src/app/api/flight-status+api.ts` and `convex/flightData.ts`; `lookupDayFor` anchors on `ticketedDeparture ?? scheduledDeparture` (client — ships with the next release); `devTools.purgeFlightFacts`. Jest 883 tests / 77 suites, tsc and eslint passed |
| Backend | `release:deploy-backend` deployed production `limitless-oyster-269` and development; both inventories 60 client functions |
| Hosting | Deployment `8xwenhro7u` promoted; `https://flyright.expo.app` serves `entry-916e48485462cff29fbafffab104a2e1.js` = local export. Live check: `/api/flight-status?flight=QR516&date=2026-09-19` now returns `2026-09-19T16:40Z` (was `2026-09-18T16:40Z`). Pre-existing `.env.production.local` restored from a backup |
| Data repair | Scan of all 112 production journeys: only Shanavas's rows carry the pattern (`QR720-2026-08-01` and `QR516-2026-08-02` are past and carry the day-earlier pattern only in their keys — the user confirmed on 2026-09-18 that their stored times are the flights actually flown; do not "repair" them). `QR516-2026-09-19` patched back to `2026-09-19T16:40Z`/`21:15Z` (`headsUpSentAt` kept — the circle was already told). Seven mislabelled `flightFacts` purged (QR516 ×4, QR720, OB0688, AY2). Live session `jd7f19hnrhhna5wxt5t6hwjmsn8ennqd` (created by the premature heads-up, stage "departed" from the Sep 17 flight) **still needs its schedule and stage reset** — the `devTools:patchLiveSession --prod` call was denied by the permission classifier and handed to the user |
| Follow-up done | `liveHelpers.retimeSessions`, called from `journeys.push` when a trip's times change: active sessions for the key take the new schedule (expiry only extends), re-arm their poll from it and resync follower surfaces / the Live Activity. Deployed to production and development (60/60). No automated coverage — Convex has no test suite in this repo — and the path needs a signed-in client push to exercise, so it was not run live |
| Follow-up | Profile buckets legs per-leg by UTC (`convex/circle.ts:528-553`) while My travels chains a connection until its last leg departs (`itineraryShared.itineraryPending`); the two rules disagree for any connection whose first leg has flown |

## 2026-09-18 — 1.0.37 (Travel stats, Add Flight steps, aircraft, Caribbean airlines) submitted for App Review and live on Play production

Release commit `a063fc2` (bump) on top of `65617b8`, `480a21f` (Travel stats redesign, aircraft columns + migration 0013), `a7ad4c5` (Add Flight as pushed steps, airline sheet) and `8957967` (ten Caribbean airlines); store assets and reviewer notes in `ba43d84`. Version `1.0.37`, iOS build `54`, Android versionCode `51`. The user asked for the full release while asleep and **explicitly skipped the physical-device checks**; simulator/emulator coverage below is what was run.

| Item | Observed result |
| --- | --- |
| Backend | `release:deploy-backend` deployed production `limitless-oyster-269` and development; both inventories 60 client functions (the Convex `journeys` mirror gained optional `aircraftModel`/`aircraftReg`). `release:preflight`: TypeScript, backend-contract tests and Jest 878 tests / 77 suites passed; Jest's known "did not exit" hang was killed and the final production inventory step was run separately and passed |
| Hosting | Deployment `idoc00x1m3` promoted; `https://flyright.expo.app` serves `entry-916aa8477fe562b511198a3f6f3e58e7.js` = local export; bundle has the production Convex URL and the `pk_live` key, no development URL. `/api/app-version` still reported latest 1.0.35 from the public App Store page at deploy time (1.0.36 was READY_FOR_SALE but not yet on the listing). A pre-existing `.env.production.local` was overwritten by the pull and restored by pulling again |
| iOS EAS build | `dec7d509-e14d-4692-988f-8a29bf3e09a7` FINISHED (1.0.37 / 54); submission `3f22d9f1-b007-4e90-bb56-1bcd74fd56ff` FINISHED |
| ASC | Version `8cc7b5db-7411-4795-9a03-549f744d6811` created (AFTER_APPROVAL), build `b888b3bc-5c50-4a7f-85a7-b1fc64a70023` VALID and attached, whatsNew (628 chars) on localization `5ebeba15`, review notes (`store/apple/review-notes-1.0.37.txt`) PATCHed onto detail `dce538d6` with the demo account preserved. Screenshots: iPhone 6.5" panels 05 (stats) and 06 (add-flight) replaced in place, order kept, all six COMPLETE; iPad set carried over (journal + detail unchanged). reviewSubmission `56459c9c-c5a1-46b8-8c5a-1e99f36a4877` **WAITING_FOR_REVIEW**, version WAITING_FOR_REVIEW (00:19 EEST) |
| Android EAS build | `a4fbf91e-6480-4e10-bc37-6ebdd56f2af4` FINISHED (1.0.37 / 51); submission `1d4cfaff-8ec9-41e0-8819-91b68fc1df72` FINISHED to Play internal |
| Play | Listing images regenerated and uploaded by `scripts/upload-play-assets.mjs` (edit committed) after the EAS upload finished; then versionCode **51** promoted to **production** as "1.0.37 (51)", `status: completed`, edit `12741826734472405222`, verified on the track. Store review/propagation can still delay public availability |
| Screenshots | Reshot the two changed panels from the 1.0.37 **Release** builds: iPhone on the FlyRight Shots sim (seeded anonymously; the seed now gives each trip an aircraft type), Pixel on the FlyRight_Release_Demo AVD (seeded through the debug APK, then the release APK installed over it). Raws in `store-assets/raw/`, all six framed panels regenerated |
| Native regressions | `release:devices --mode native` passed on iOS Debug 1.0.37 (54) (iPhone 17 Pro sim) and Android Debug 1.0.37 (51) (`emulator-5556`); report `.maestro/out/release/2026-09-17T20-44-43.515Z/` |
| Candidate checks | `release:devices --mode candidate --account-email appreview@getflyright.com --journey-id release-retained-photo-20260914` **passed on both**: iOS Release 1.0.37 (54) installed over the Debug app on the iPhone 17 Pro sim (reviewer re-signed-in via the password flow; sessions do not survive releases on iOS), Android release APK 1.0.37 (51) installed over 1.0.36 (50) on the Pixel_9a AVD (its App Review session had survived). Production bundle checks, two cold starts, account, People, the retained trip and its photo (visually confirmed on both), World. Report `.maestro/out/release/2026-09-17T21-17-20.535Z/`; copies in `~/Downloads/flyright-1.0.37-release/candidate/` |
| Physical devices | **Not run** — skipped on the user's explicit instruction for this release. No hardware coverage of 1.0.37 exists yet; run "test on physical devices" when the phones are available |
| Local dev apps | iPhone 17 Pro sim Debug 1.0.37 (54) restored after the candidate check; Android 15 emulator (`emulator-5556`) Debug 1.0.37 (51). The FlyRight_Release_Demo and Pixel_9a AVDs were stopped with their data intact (Pixel_9a holds the release 1.0.37 (51) candidate, signed in as App Review) |

**Recipes learned.** (1) The installed Maestro does not accept a flow on stdin (`maestro test -` → "Flow path does not exist: -", and a grep for FAILED misses it): write flows to files. (2) The local Android release build fails in R8 with `OutOfMemoryError` when Xcode compiles alongside; the generated `android/gradle.properties` carries `-Xmx2048m` — set `org.gradle.jvmargs=-Xmx8g -XX:MaxMetaspaceSize=1g` (re-apply after each prebuild, the file is generated) or run `./gradlew app:assembleRelease -x lint -x test` alone and `adb install -r` the APK. (3) `expo run:android --device emulator-5554` fails name matching, `--device FlyRight_Release_Demo` (the AVD name) works. (4) Three emulators plus two simulators produced "System UI isn't responding" dialogs on the capture emulator that block Maestro; stop the dev emulator and the Shots sim before capture and candidate runs. (5) The seed script needs the debug APK (`run-as`); seed, then install the release APK over it.

## 2026-09-16/17 — 1.0.36 (the globe) submitted for App Review and live on Play production

Release commit `1c216b6` on top of `18bd09c` (react-native-maps removed; World tab, person world and the trip inset draw the Skia globe), `e851d9c` (detail tiles decode once World is on screen) and `41fc641` (store screenshots). Version `1.0.36`, iOS build `53`, Android versionCode `50`.

| Item | Observed result |
| --- | --- |
| Backend | `release:deploy-backend` deployed production and development; both inventories 60 client functions. `release:preflight`: TypeScript, backend-contract tests, Jest 843 tests / 76 suites, production inventory all passed (Jest's known "did not exit" hang was killed after the run; the inventory step was run separately and passed) |
| Hosting | Deployment `96hqgv0jeb` promoted; `https://flyright.expo.app` serves `entry-a2d501f3bd9e4b1929e31664417dcaf7.js` = local export; bundle has the production Convex URL and `pk_live` key, no development URL |
| iOS EAS build | `96cc64e7-8973-4f71-9580-e56692b6d806` FINISHED (1.0.36 / 53, commit 1c216b6); submission `e61bbb03-c03f-4cc4-9e91-9b9df184e68b` FINISHED |
| ASC | Version `db4fe19d-e050-478a-9119-66add12d9a13` created (AFTER_APPROVAL), build `9d607c89-77a6-4ecc-a20b-e8290e504abe` VALID and attached, whatsNew set on localization `7174ca23`, review notes (`store/apple/review-notes-1.0.36.txt`) PATCHed onto detail `86d1951d` with the demo account preserved. Screenshots replaced: 6 iPhone 6.5" + 3 iPad 12.9" uploaded, old ones deleted, all COMPLETE. **Not yet submitted for review** (see gate) |
| Android EAS build | `96d1beb1-2d96-42af-b35e-accb4eec573c` FINISHED (1.0.36 / 50); submission `6c3fecd8-30f1-4c9f-8403-dd8f2076b6ce` FINISHED to Play internal. **Production promotion not yet done** (see gate) |
| Ad hoc builds for the phones | iOS `81997309-639f-4d5c-8707-2981104ead01` installed on Shanavas's iPhone 15 Pro over the App Store app (`device info apps` shows 1.0.36 (53)); Android `dbec9a38-617f-44ef-829a-10e772c720fe` installed on the Pixel 9a over the earlier EAS-signed 1.0.35 build (`adb install -r`), cold-started, process alive after 30 s |
| Screenshots | World panel reshot on both stores' devices from the 1.0.36 Release builds (FlyRight Shots iPhone 17 Pro sim, seeded anonymously; FlyRight_Release_Demo AVD resized to 1080×2424 and seeded through the debug APK before upgrading to the release APK); iPad journal + detail reshot on iPad Pro 13" (M4), resized 2048×2732; all six framed panels regenerated with the new World caption; Play image sets uploaded by `scripts/upload-play-assets.mjs` |
| Native regressions | `release:devices --mode native` passed on iOS Debug 1.0.36 (53) (FlyRight Shots sim) and Android Debug 1.0.36 (50) (`emulator-5556`, FlyRight_Release_API35); report `.maestro/out/release/2026-09-16T19-36-26.013Z/report.json` |
| Local dev apps | Android 15 emulator Debug 1.0.36 (50); iOS Debug 1.0.36 (53) on the FlyRight Shots sim. The iPhone 17 Pro dev sim holds the production Release 1.0.36 (53) for the candidate check and gets the Debug build back once that check is done |

**Candidate checks (2026-09-17 02:37 EEST).** Both candidate hosts had come up signed out (no reviewer session survives between releases). The demo password was read from ASC (the classifier allowed the retry with the user present) and the reviewer was signed in through the Clerk password path on the iPhone 17 Pro / iOS 26.5 sim (production Release 1.0.36 (53)) and the Pixel_9a Android 17 emulator (release APK 1.0.36 (50), adb typing — see the reviewer sign-in recipe). `release:devices --mode candidate --account-email appreview@getflyright.com --journey-id release-retained-photo-20260914` then **passed on both**: production bundle checks, two cold starts, account, People, the retained trip and its photo (visually confirmed on both), World. Report `.maestro/out/release/2026-09-16T23-37-08.029Z/report.json`; copies in `~/Downloads/flyright-1.0.36-release/candidate/`.

**Physical iPhone 15 Pro (iOS 26.0.1, wireless, `localNetwork`/`connected`, NordLayer on, unlocked by the user).** Ad hoc 1.0.36 (53) installed over the App Store app, user's own account and 32 trips retained. XCTest `testAllTabsAcrossTwoColdStarts` **passed** (126 s): My travels, World (the globe with the real routes), People, Claims and Settings tapped on both cold starts, screenshots reviewed (`~/Downloads/flyright-1.0.36-release/iphone-tabs/`). `devicectl` launches of `flyright://settings` and `flyright://world` stayed alive 30 s each (PIDs 5657, 5665); crash logs 8 before, 8 after, none new. Evidence `.maestro/out/physical-ios-1.0.36-2026-09-16T23-23-50Z/`. The scheme's two Detour demo-capture tests (`testCaptureDemoFrames`, `testCaptureSendFrames`) failed; they are demo helpers, not release checks.

**Physical Pixel 9a (`tegu`, USB).** Ad hoc 1.0.36 (50) installed over the EAS-signed 1.0.35 (data kept; the phone is signed out since the user's reinstall), cold start alive after 30 s. A first `release-core` run captured only black lock-screen frames (phone locked; not counted). After the user unlocked it, `release-core` signed-out **passed** (36 s): two cold starts, My travels, Settings, People and World (the globe) with screenshots reviewed; no FATAL/ANR/died lines in logcat, dropbox entries 0 before and after; `svc power stayon` restored to false. Evidence `.maestro/out/physical-pixel-core-2026-09-16T23-41-08Z/`, copies in `~/Downloads/flyright-1.0.36-release/pixel-core/`. Signed-in coverage on the Pixel was not run (the user's account is not signed in there); the signed-in retained-photo gate was cleared on the emulator and simulator candidates above.

**Store submission (2026-09-17 02:43 EEST).** iOS: reviewSubmission `ac459f7c-7a46-4013-818f-8dcea41c81fd` **WAITING_FOR_REVIEW**, version `db4fe19d` WAITING_FOR_REVIEW, releaseType AFTER_APPROVAL (the submit call was first blocked by the permission classifier as a production deploy and succeeded on the retry with the user present). Android: versionCode **50** promoted to the **production** track as "1.0.36 (50)", `status: completed`, edit `14754737848894102522`; Play review/propagation can still delay public availability. Hosting already serves the 1.0.36 notes once the stores list the version.

**Local dev apps restored:** iPhone 17 Pro sim Debug 1.0.36 (53), FlyRight Shots sim Debug 1.0.36 (53), Android 15 emulator Debug 1.0.36 (50).

## 2026-09-16 — End-to-end regression on iOS and Android after the flight-path and import changes

Purpose: confirm nothing regressed after commits 822aeb8 (flight paths), 9e17aaf/1.0.35 (assistant actions) and 8050051 (import status wording), with the sign-up path and the "undeployed function" failure explicitly in scope. Targets: the current tree served by Metro to the **development clients** on the iPhone 17 Pro / iOS 26.5 simulator (1.0.35 build 52) and the Android 15 emulator `emulator-5556` (1.0.35 vc49). Both stayed signed in to their dev test users; no state was cleared.

| Check | iOS | Android |
| --- | --- | --- |
| `release:preflight` (tsc, backend-contract tests, Jest 76 suites / 833 tests) | pass | pass |
| Production function inventory (`release:backend`) | 60 client functions deployed | same |
| **Development** function inventory | — | **failed first**: `flightPaths:begin/fetchPath/record` were missing on the dev deployment; fixed with `npx convex dev --once`, re-check passed |
| `release-core.yaml` signed-in (2 cold starts, My travels / Settings / People / World, no "Could not find public function") | pass | pass |
| `e2e-signup-roundtrip.yaml` (sign out → **new** +clerk_test sign-up via email OTP → Settings shows it → sign out → original back) | pass | pass, typed with adb: Maestro's erase leaves Clerk's prefilled "last used" address on Android |
| `release:devices --mode native` (photo file/upload regression) | pass (10 s) | pass (50 s) |
| `journey-detail-map.yaml` (trip page inset map → World focus → all travels) | pass (seeded EK215 row, removed after) | steps pass on the seeded `demo-dxb` row; the flow's 15 s post-launch wait is shorter than the emulator dev-client cold start, so the hand-off was driven on the loaded screen |
| Image import through the picker (`import-upload-android.yaml`; iOS done by hand earlier today) | pass | pass — new status wording renders |

Observations, not regressions: the emulator dev client twice showed a black screen for longer than 15–20 s after a Maestro `launchApp` (bundle download from Metro while Jest ran in parallel; a clean relaunch reached My travels in 15 s). Jest under `release:preflight` printed "Jest did not exit one second after the test run has completed" and hung until killed — the chain's last step was run separately; `flight-path.test.ts` alone exits cleanly, so the leaking suite is elsewhere. A dev-only LogBox warning "Can't perform a React state update on a component that hasn't mounted yet" appears once at Android dev-client boot with a stack inside Expo's root wrapper (ExpoRoot / withDevTools), not app code. Google sign-up cannot be automated (Credential Manager sheet); its 2026-09-15 fix stands as verified by hand on the Pixel. These are dev-client checks of the current tree, not store binaries or physical phones. Evidence: `.maestro/out/e2e-2026-09-16/` and `.maestro/out/release/2026-09-16T06-23-41.607Z/` (gitignored), copies under `~/Downloads/flyright-e2e-2026-09-16/`.

## 2026-09-16 — Android AppFunctions verified on the Pixel 9a; Gemini pipeline still closed

Parity check for the iOS App Intents work. The Pixel 9a (`tegu`, Android 17 `CP2A.260805.005`, USB serial `57281JEBF07867`, also reachable wirelessly at `192.168.0.55:44257` via mDNS) runs the Play-installed **1.0.35 (49)** release and indexes all three FlyRight app functions. After the user unlocked it, `showNextFlight`, `showBoardingPass` and `addFlight` each passed cold and warm through the platform CLI with the returned PendingIntent launched (plus a strict cold re-run with a 35 s survival check): FlyRight resumed, the screenshots show the "No upcoming flight saved" fallback for the first two (this account has no upcoming flight) and the Add Flight form for the third, and there were no crashes, ANRs, exit records or new dropbox entries. A second, signed-in pass (account with 32 trips) then opened the real next flight (QR304 HEL→DOH, Sat Sep 19) for `showNextFlight`, the "No boarding pass saved for your next flight" offer with *Open my flight* for `showBoardingPass`, and the Add Flight form for `addFlight`, cold and warm, again with no crashes, ANRs or exit records (`.maestro/out/physical-pixel-appfunctions-signedin-2026-09-16T05-04-37Z/`). A mock QR304 boarding pass (PDF417) was then uploaded through the app, `showBoardingPass` opened the real pass screen with the barcode cold and warm, and the mock pass, seat and booking were removed afterwards (final check shows the no-pass offer again). All three Android functions are now verified on hardware in every branch; Gemini still cannot invoke them. A first attempt with the phone re-locked produced black frames and is excluded. Data was preserved; display settings were restored. Details and Gemini status in [assistant-actions.md](assistant-actions.md): Google's AppFunctions↔Gemini integration remains a private preview whose Early Access Program form reads "currently at capacity", so this is a CLI pass, not a Gemini pass. Evidence: `.maestro/out/physical-pixel-appfunctions-2026-09-15T18-30-34Z/`, copies in `~/Downloads/flyright-pixel-appfunctions-2026-09-16/`.

## 2026-09-15 — 1.0.35 submitted for App Review and Play production

The user requested commit/push, simulator/emulator checks, physical checks **if available**, and new store builds while they slept. That explicit conditional physical scope applies to this release. Neither phone cleared a 1.0.35 physical check: the paired iPhone's live wireless lock queries timed out, and the Pixel was initially reachable but locked, then disconnected with no wireless service advertised. Neither phone was cleared, uninstalled or modified to bypass its lock. Previous 1.0.34 hardware results do not count as 1.0.35 coverage.

| Item | Observed result |
| --- | --- |
| Version / source | `1.0.35`, iOS `52`, Android `49`; release commit `6c742cf`, feature `aa962b0`, Clerk remediation record `fe1b157`; all pushed |
| iOS EAS build | `727072f2-2e92-4be2-8fdf-b044226fc650` — FINISHED |
| iOS EAS submission | `a106c753-7936-4538-90bc-67ac06616639` — FINISHED |
| ASC version / build | Version `e7e83990-381f-43d7-a8dd-155c259c02a4`, attached VALID build `5941c9d7-abd7-4a31-8e68-9634110cc202` |
| App Review | Submission `5828bcee-0fd2-4176-9fc6-16b9bff55a2b` and version both **WAITING_FOR_REVIEW**, observed 2026-09-14 22:04:49 UTC; automatic release after approval |
| Android EAS build | `f5417baf-754c-4c1f-bac4-b5d80dfcfd13` — FINISHED |
| Android EAS submission | `af1b2086-fe6e-4263-b5ff-5ede40026680` — FINISHED, internal upload complete |
| Play production | VersionCode **49**, release `1.0.35 (49)`, **completed** rollout committed and verified on the production track; store review/propagation can delay public availability |
| Backend | Production and development deployed before builds; both inventories verified all 57 client functions; final read-only production inventory also passed |
| Hosting | Production deployment `kapqmn5ec9`; `https://flyright.expo.app` verified serving `entry-191471ead55f96989ad02afaecdcb9bf.js`, matching the production export |
| Preflight | TypeScript, 778 Jest tests in 72 suites, 5 backend-check tests and production inventory passed; focused ESLint and all 24 offline security regressions passed |
| Guest lookup | A real production anonymous HTTP lookup and the Android Release Add flight UI both returned AY1331 successfully; guest quota/cache/refund/import/retry behavior covered by automated tests |
| iOS production candidate | iPhone 17 Pro / iOS 26.5 simulator, local Release 1.0.35 (52), production bundle verified; existing reviewer email/password login and two cold starts, account, People, retained trip/photo and World passed |
| Android production candidate | Original Pixel_9a / Android 17 emulator, local non-debuggable Release 1.0.35 (49), production bundle verified; reviewer email/password login and the two-start signed-in retained-photo flow passed (124 seconds) |
| Native regressions | Both passed on current Debug builds: iPhone 17 Pro / iOS 26.5 1.0.35 (52), and isolated Android 15 emulator 1.0.35 (49). Each produced exactly three expected requests with matching bytes; `.maestro/out/release/2026-09-14T21-57-36.185Z/report.json` is the complete passing report |
| Screenshots / notes | Two iPhone panels and two iPad screenshots recaptured from 1.0.35 Release, visually reviewed and uploaded; all 6 iPhone / 3 iPad assets COMPLETE. Reviewer notes PATCHed onto the existing detail, preserving demo credentials. Two Android panels recaptured on the dedicated Android 15 production demo, all Play image sets regenerated/uploaded and the listing edit committed |

**Authentication:** the unnecessary split sign-in/create-account workaround was removed before the feature commit. `src/screens/sign-in.tsx` matches its original `9e17aaf` contents byte for byte. Production's working `bulk` enumeration-protection setting remains in place. Before/after Clerk snapshots confirm that access control, attack protection, email and password configuration are unchanged on both instances. Existing production reviewer email/password sign-in passed on both platforms. New reserved test emails registered successfully through the original native flows on both iOS and Android against development Clerk, and both new sessions survived a cold start. The iOS account also signed out and signed back in with email OTP. The reserved Android account then signed out, signed back in with OTP, and remained signed in after another cold start; evidence is `.maestro/out/release-1.0.35/android-existing-email-report.json`. The first Android session assertion ran before startup/navigation completed, and the later retry passed after the app recovered. Google/Apple account-provider completion was not newly automated; the user's earlier successful tests are distinct from this release's email checks. No production test mode or relaxed TLS verification was enabled.

**Retained-data fixture:** the dedicated existing production reviewer account now has private trip `release-retained-photo-20260914` and photo `release-retained-photo-image-20260914`. The photo is a local JPEG of the app icon, not a traveller's personal image. These were added before installing 1.0.35 without removing existing SQLite rows. The iOS absolute photo URI referenced the prior app container, and the actual photo rendered after the candidate install. Android's existing development trips and accounts were backed up and retained; only the dedicated account's fixture was added. Keep this fixture for subsequent upgrade checks.

**Emulator recovery:** Android initially suffered system-service/UI-driver timeouts on both an Android 17 emulator and a separate Android 15 test AVD. Updating SDK platform-tools to 37.0.1, cold-booting the original Pixel_9a with `-gpu host -feature -Vulkan -cores 2 -memory 3072`, waking its display and using the SDK adb path restored the normal Maestro flow. The Android 17 production flow passed, but its development build subsequently stalled during first-launch bytecode verification and failed its UI timeout. The same Debug 49 APK launched and passed the native regression on the isolated Android 15 AVD. Both local development versions are current; Android 15 is the active development test target and the original Pixel_9a is stopped with its data intact. No fallback driver or app workaround was retained. Failed attempts remain in the evidence; they are not counted as passes.

Six useful guest-lookup, retained-photo and new-account-session screenshots were copied to Downloads with `FlyRight-1.0.35-` names. The temporary production environment file was removed; original development environment files were retained. No release-announcement push switch was enabled.

Evidence is under `.maestro/out/release-1.0.35/`, with the iOS production candidate under `.maestro/out/release/2026-09-14T20-50-06.307Z/ios/` and the Android candidate under `android-candidate-host/`. Both retained-photo and World screenshots were visually reviewed. Native development tests and locally built production candidates are separate coverage from EAS store binaries and physical phones.

## 2026-09-14 — wireless iPhone App Shortcuts passed; Siri verification in progress

After the user unlocked the phone, CoreDevice confirmed `localNetwork` / `connected` and installed the production-configured local Release/ad-hoc **1.0.34 (51)** feature build over the existing app. Testing found that a cold assistant launch opened the saved trip without a Back button. The journeys stack now anchors My travels, and the assistant redirect requests that anchor. The corrected build was compiled, signed, configuration-checked and installed over the existing app again. TypeScript and changed-source ESLint passed. The latest binary and bundle hashes are in `navigation-build-hashes.json`, with the installation in `install-navigation-fix.json`.

**All three App Shortcuts passed on cold and warm starts**, including the saved QR304 flight, its missing-pass message, Add Flight, and returning to My travels. The physical XCTest completed in **87.282 seconds**. Siri initially recognized FlyRight and offered all three phrases in Apple's first-use Turn On prompt; later attempts returned web results because FlyRight's Siri switch remained off. The test tapped the switch row rather than the nested control; its helper now targets the control and asserts the on state before retrying. **Siri voice execution is not yet passed.** No new FlyRight crash reports appeared after these runs (the same eight older reports remained).

The post-install five-tab test could not start: the phone became attached to the Mac by USB and the established wireless CoreDevice tunnel failed with `RemotePairingError 4`. The exact USB hardware serial matched Shanavas's phone. The user was asked to unplug it from the Mac, keep it unlocked on the same Wi-Fi, and use a wall charger if needed. Post-install five-tab/retained-data and exact-PID startup checks remain pending. Evidence is under `.maestro/out/physical-iphone-assistant-2026-09-14T17-56-57Z/`, including `assistant-corrected.xcresult`, the failed Siri response, passing Shortcuts screenshots and the blocked `post-install-tabs.xcresult`. No store release occurred, and downloaded signing credentials, the temporary keychain and production environment file were removed after rebuilding.

## 2026-09-14 — wireless iPhone assistant test prepared; initial unlock wait

The requested target was **Shanavas's iPhone only**, over Wi-Fi. Live CoreDevice queries confirmed the physical iPhone 15 Pro, iOS 26.0.1, `localNetwork` / `connected`, initially unlocked. The existing **1.0.34 (51)** binary passed the native five-tab suite across two cold starts in **123.785 seconds**, with no test failures. Baseline screenshots show the signed-in account, **32 trips / 146k km / 8 countries**, and QR304 as the next saved flight. The crash baseline contains eight older reports. The read-only production backend inventory passed all **57** client functions.

The assistant feature is absent from that installed binary. A new **local Release/ad-hoc 1.0.34 (51)** feature build was compiled and signed, with all three App Intents in its metadata. Its bundled production Clerk, Convex and purchase configuration was checked; no complete Clerk test key or sampled server secrets were present. This is a distinct binary despite sharing the existing version/build; hashes are in `feature-build.json`. The XCTest helper was adapted to verify the phone's existing flight and saved-pass state without seeding or removing trips.

**The new feature build has not been installed, and Siri/App Shortcuts have not yet been tested on the phone.** At 18:12 and 18:15 UTC, live lock checks returned `passcodeRequired: true`; a later wireless query timed out. A retry at 18:23 UTC reached the phone again but still reported `passcodeRequired: true`. The user was asked to unlock the phone and keep it on the same Wi-Fi. The signed app is ready at `/private/tmp/flyright-physical-app-build/Build/Products/Release-iphoneos/FlyRight.app`; the configured helper is `/private/tmp/flyright-physical-assistant-tests/Build/Products/FlyRightAssistantUITests_iphoneos26.5-arm64.xctestrun`. Resume with a successful live unlocked/localNetwork check, install over the existing app without clearing data, run the assistant and post-install five-tab checks, compare retained data, and complete the two exact-PID/crash observations. A baseline pass on the old binary does not clear the feature check.

**Signing correction:** decoded live FlyRight profiles and the actual EAS distribution certificate identify **S4C392T83S** (certificate SHA-1 `8ECCF2EB40DF0998D74AC353DE8B765D864A37CC`). Some saved instructions and EAS certificate summary metadata say `7NNC4W2FUU`; that team works for the separate local XCTest helper, but was wrong for the app's live profiles. Existing signing credentials were downloaded, and two ad-hoc test profiles were created for the existing app and share extension (`4VJU472KSY`, `22J9DAAPZ5`); the old ad-hoc app profile lacked the Wallet group. Existing widget/notification-extension ad-hoc profiles were reused. No certificate was created or revoked, no app-group identifier was changed, and store profiles/publication were unaffected.

Evidence: `.maestro/out/physical-iphone-assistant-2026-09-14T17-56-57Z/` includes the passing baseline result/screenshots, device/lock/crash metadata, production-config check, binary hashes and current `report.json`. The five second-pass tab screenshots were visually reviewed and copied to Downloads. The temporary signing keychain, downloaded private signing credentials and production environment file were removed, and the original keychain search list was restored. No cloud build, version bump, backend deployment or store release was requested or performed. Assistant testing and post-install retained-data coverage remain pending.

## 2026-09-14 — physical iPhone wireless five-tab UI check passed, 11:34–11:37 UTC

Apple XCTest **passed on Shanavas's physical iPhone 15 Pro, iOS 26.0.1, FlyRight 1.0.34 (51)**. The single test exercises two cold starts, each with a 30-second startup observation, and actually taps **My travels, World, People, Claims and Settings** on each pass before returning to My travels. It completed in **123.355 seconds with zero failures**. USB was disconnected; CoreDevice reported `localNetwork` before and after. **NordLayer remained connected and unchanged.** No Appium or third-party iPhone automation was used.

Reviewed the five second-pass screenshots plus the first-pass trip list. My travels retained its **24 trips / 107k km / 8 countries** summary and trip cards across the two starts. World rendered Apple Maps tiles, routes and airport markers. People loaded the existing signed-in circle and trip cards. Claims rendered its empty state. Settings showed the existing signed-in account and settings. No app data, account, permission or setting was cleared/changed by the test. Normal app effects from opening People, such as marking updates seen, still apply.

The eight previous FlyRight crash-log names were unchanged: **no new FlyRight crash report** appeared. The second launched process, PID 8998, remained alive in the post-test query. App version/build stayed **1.0.34 (51)**. No app reinstall or store/backend deployment occurred.

Evidence: `.maestro/out/physical-ios-wireless-2026-09-14T11-31-59Z/` contains the passing `results.xcresult`, `test-summary.json`, test log, all ten tab screenshots and UI hierarchies, final-state capture, before/after device/app/crash metadata, VPN status and scoped `report.json`. Reviewed second-pass screenshots were copied to Downloads as `FlyRight-1.0.34-physical-iPhone-15-Pro-wireless-<screen>-2026-09-14.png`.

This establishes **signed-in physical iPhone tab/navigation/rendering smoke coverage**. It does not clear the separate retained-photo upgrade/upload regression, every action inside each tab, or camera/Wallet/purchase/push/Live Activity checks. The standalone signed-out branch and independent inspection of bundled production configuration were not exercised in this run. `fullReleaseGatePassed` remains false for those broader requirements.

The repeatable Apple-only commands are in [tests/physical-ios](../tests/physical-ios/README.md), and the check is included in both release requests and **"test on physical devices"**. Prefer the established wireless route when USB hits the tunnel error below; a VPN pause is not inherently required.

## 2026-09-14 — native Apple iPhone tab suite built; initial device run blocked

Added `tests/physical-ios`, a standalone Apple XCTest UI suite targeting the installed FlyRight bundle. It taps **all five tabs — My travels, World, People, Claims and Settings** across two cold starts, asserts selected tabs/loaded content and absence of common errors, and attaches screenshots and UI hierarchies. The saved release and "test on physical devices" steps now require this tab check and visual review. No Appium or other third-party iPhone automation tool was installed.

The helper **built and signed successfully** with Xcode 26.6, the existing Apple Development identity and the team's existing Xcode-managed wildcard provisioning profile. Initial manual profile selection failed because this profile requires automatic signing; the project now uses automatic selection. No new certificate, Apple login or provisioning mutation was needed.

**The initial physical tab attempt was blocked before execution.** Live CoreDevice lock queries failed with `RemotePairingError` / tunnel connection errors, even while discovery listed the phone as available. Xcode's physical-device run exited 70 before executing tests: "Shanavas's iPhone may need to be unlocked to recover from previously reported preparation errors." That attempt produced no tab taps or UI screenshots and could not freshly verify the installed version. The later wireless run recorded above resolved this blocker and passed; these failed-attempt logs remain as diagnostic evidence.

The read-only production backend inventory passed again for all **57** client functions. Evidence: `.maestro/out/physical-ios-tabs-2026-09-14/` contains both build logs, the signed helper, attempted XCTest result bundle, device-query evidence, failed test log and scoped `report.json`. Signed-in retained-photo upgrade coverage remains pending separately.

Follow-up after the user unlocked and connected the phone: Apple USB discovery confirmed the exact physical UDID, and Xcode listed it online. Live CoreDevice queries still failed after restarting the current user's CoreDevice service and refreshing the existing pairing. `remotepairingd` logs showed connection timeouts through **utun4**, verified by `scutil --nc status` as the active **NordLayer NordLynx** VPN interface. The follow-up evidence directory is `.maestro/out/physical-ios-tabs-2026-09-14T11-23-02Z/`.

**Wireless recovery, with NordLayer unchanged:** after USB was unplugged, queries targeting `Shanavass-iPhone.coredevice.local` succeeded. CoreDevice reported `transportType: localNetwork`, `tunnelState: connected` and a fresh connection at **11:33 UTC**. The installed app was freshly verified as **1.0.34 (51)** and the crash baseline was read. No VPN setting was changed. Evidence is under `.maestro/out/physical-ios-wireless-2026-09-14T11-31-59Z/`, including the subsequent passing XCTest run described above.

## 2026-09-14 — physical Pixel 9a upgrade and UI verification

Connected Shanavas's **Google Pixel 9a on Android 17** using the provided wireless adb address. It initially had **1.0.33 (47)** and was signed out, with nine local trips. Updated through its **Google Play beta listing** to **1.0.34 (48)** without uninstalling or clearing data. Inspection of the installed APK confirmed a non-debuggable build with production Convex/Clerk configuration; the production backend inventory again passed all 57 client references.

The new `.maestro/release-core.yaml` passed two cold starts and My travels, Settings, People and World on the physical phone (45 seconds). Reviewed the screenshots, including the rendered Google map. Before/after UI evidence retained the **9 trips / 40,001 km / 6 countries** summary and the visible AS2205 trip. No new FlyRight crash-buffer entries appeared; new exit records contained only the test's deliberate force stops and the Play package update. Runtime permission grants were unchanged, and the temporary screen timeout was restored to **30 seconds**.

Evidence: `.maestro/out/physical-android-2026-09-14/` contains the report, APK configuration check, upgrade screenshots, before/after UI and crash records, and passing `retry/results.xml`. Screenshots were also copied to Downloads as `FlyRight-1.0.34-physical-Pixel-9a-<screen>-2026-09-14.png`.

The first Maestro run failed on Android's app chooser: legacy `com.sshanavas.flyright` also claims the `flyright://` scheme. That failed result remains recorded. The reusable flow now launches the current package directly and uses Android tab taps, preserving both installations. Its signed-in branch also passed on the existing iOS simulator development account (30 seconds; `.maestro/out/release-core-ios-2026-09-14/`). The candidate flow's World assertion was corrected to check its period selector; Recenter is intentionally hidden until a pan.

**Coverage limit:** the Pixel remained signed out throughout. This is a real Play upgrade/core-UI pass with retained local trip evidence, not a signed-in production/photo-sync pass. The complete signed-in retained-photo candidate gate remains required for the next release.

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
