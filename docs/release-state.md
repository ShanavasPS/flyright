# FlyRight release state

Shared release log for Codex and Claude. Read before a release and prepend dated observations afterwards. Query EAS and both stores before acting; this file records observations, not automatically refreshed status. Follow [release-workflow.md](release-workflow.md).

## 2026-09-24 (evening) — Android-only 1.1.4 build 67: self-updating travel-day card (Play production)

Android-only release, version string kept at **1.1.4** by the user's decision;
iOS 1.1.4 (67) stays in review untouched — nothing in this build affects iOS.
Triggered by an Android traveller's support report (card stuck on "Departs in"
with no time; see the hotfix entry below for the server half).

| Item | Observed result |
| --- | --- |
| Code | `da54f7c` (chronometer countdown, alarm-driven card swaps, 15-min sweep, "Departing now"/"Landing now"), `d1c3234` (schedule from the flight's clocks, not the countdown), `f8a3a48`/`dc5850c` (Play notes, version code). Full suite **100 suites / 1,206 tests**, typecheck and eslint clean; `release:preflight` passed. |
| Backend | No server change in this build; production and development still carry the runway-estimate hotfix (71 client functions verified by the preflight). Hosting unchanged. |
| Build | EAS Android **`7076559c-9440-4530-9e30-6b5078b17f43`**, 1.1.4 versionCode **67**, FINISHED 21:13 local. VersionCode 66 was burned by an upload that failed on local disk space (ENOSPC copying the project tarball) after the remote counter had moved; app.json re-synced to 67. |
| Play upload | EAS submission `c58bd38e` **errored** with no reason in the CLI and Play showed no bundle 67. Uploaded the AAB myself through the publisher API (edit `09219562045001887187`, sha256 `c6cba495…`) and released it on **internal** (completed). |
| Candidate gate (physical Pixel 9a, Android 17) | Universal APK from the store AAB (bundletool), non-debuggable, production Convex URL + `pk_live`, no dev URL. Reviewer account signed in (password flow; the Clerk password field must be tapped by position, the title "Enter password" also matches the field regex). `.maestro/release-signed-in.yaml` **passed**: two cold starts, account visible, Friends from the backend, retained trip `release-retained-photo-20260914` and its photo rendered, World rendered. Evidence in `~/Downloads/flyright-release-1.1.4-android-2026-09-24/candidate-pixel/`. |
| Feature verification (Pixel 9a, Android 17) | Card posts with a count-down chronometer in the header and the Live Update chip; the take-off alarm swapped it to "Lands in" with the app process **dead** — Android cold-started the process for the broadcast at 20:59:12 local, the receiver ran 1.4 s later (debug build 67; release build cold start measured at 652 ms to first frame). "Landed" arrived from the background sweep. Also verified on the Pixel_9a emulator (17) and the API 33 emulator (header countdown "03:31", alarm swap). Screenshots in the Downloads folder above. |
| Play production | Edit `04734834416504565126`: production track PUT with versionCode **67**, name `1.1.4 (67)`, en-US notes from `store/google/release-notes-1.1.4.txt` (483 chars), `status: completed`; re-read after commit shows **1.1.4 (67), completed**, replacing 1.1.3 (63). Public-store propagation not yet observed. |
| iOS | Unchanged: 1.1.4 (67) `WAITING_FOR_REVIEW` from the morning entry. |
| Local dev apps | Debug **1.1.4 (67)** on `emulator-5554` (Pixel_9a), verified from the installed binary. The physical Pixel now runs the **production candidate 1.1.4 (67)** signed in as the App Review account (its old 1.0.39 store install had to be removed for the debug build's signing key); it will update to the store build from Play. The API 33 emulator was shut down. |
| Known gotchas | A Metro server started before the edits served stale JS for the module (restart with `--clear`); an emulator debug build's cold start for the alarm broadcast ANR'd (>15 s) while real hardware was fine; `expo run:android --device Pixel_9a` also installed onto the physical Pixel 9a; `am kill` is a no-op while a WorkManager job runs. |

**Still open (product decisions):** take-off/landing/gate pushes go to followers only, never the traveller; the second card of a same-day connection.

## 2026-09-24 — backend + hosting hotfix: runway estimates read as actuals (no app release)

Support check for an Android traveller (1.1.3 (63), Pro trial, no circle): a
delayed Transavia leg read "Landed 17:06" before take-off, and the Android
travel-day notification sat on "Departs in" with no time all flight.

| Item | Observed result |
| --- | --- |
| Cause | AeroDataBox defines `runwayTime` as "actual / estimated time on the runway" (no `actualTime` field exists in its schema). `normalizeLeg` read every runway stamp as an actual, so a delayed flight's estimated touchdown landed it at the gate. |
| Fix | `e3e47f5`: a runway stamp is an actual when the status vouches for it or it lies behind the clock on a record that does not hold the flight at its origin; before that it is the estimate (the delay still reads off it). Same reading for the inbound rotation leg. Six regression tests from the real record; **100 suites / 1,201 tests**, typecheck and eslint clean. |
| Backend | `npm run release:deploy-backend` passed: 71 client functions on production and development. Also adds read-only `devTools:inspectUser` (`f84407e`) — one account's profile, Pro state, support threads, recent journeys, live sessions and cached provider records, by Clerk id. |
| Hosting | Deployed and promoted (`flyright--af8n81912r`); `flyright.expo.app` and `getflyright.com` both serve `entry-a65dcf19aae5be35593cd570a3f43360.js`, matching the export. `.env.production.local` removed after deploying. |
| Not fixed (needs an app release) | Android live notification: the countdown lives only in the Android 16 promoted chip, so the title reads a bare "Departs in" elsewhere; the surface is refreshed only by the app process (no server push path as on iOS); the lead label follows the recorded stage, not the timetable, so it never reaches "Lands in" without a provider take-off. Take-off/landing/gate pushes go to followers only, never the traveller. |

## 2026-09-24 — 1.1.4 build 67/65: trial on the plan cards, free-plan live row (iOS submitted; Android held on internal)

The user asked for the full release, **explicitly skipped physical-device
tests** (no phone was reachable either: `devicectl`/`adb` listed none), and
mid-release said **"skip the android release for now"** because a bug is being
fixed in another session — so Android stops at the internal track and Play
production stays on 1.1.3 (63). iOS went through to `WAITING_FOR_REVIEW`.

| Item | Observed result |
| --- | --- |
| Code | **1.1.4**, iOS **67**, Android versionCode **65**, bump `2d674ae` (notes in `src/constants/release-notes.ts`), versionCode re-sync `11122db`, store notes `c03bfbf`. Contents since 1.1.3: `planIntro`/`introEligibility` show the store's intro offer on the plan cards ("14-day free trial · cancel anytime", iOS only when RevenueCat reports ELIGIBLE; `46cef93`, `17c3df1`, `4fae3b6`), the free plan's in-air row wears the running light and a Live mark (`384bd95`), smaller section labels with air above the first (`676686c`, `cd62160`). |
| Tests | `npm run release:preflight` passed: typecheck, backend-contract regressions, **100 suites / 1,195 tests**, production inventory. |
| Backend | `npm run release:deploy-backend` passed: **71 referenced client functions** on production and development (no backend code changed this release). |
| Hosting | Deployment `oh6xdgewav`; `flyright.expo.app` serves `entry-d4c540fa92dfe358bd501a2d7c23f603.js`, matching the export (alias moved). Bundle carries the production Convex URL and `pk_live`. `/api/app-version?version=1.1.3` → `{valid:true}` with no notes, correct until the store serves 1.1.4. `.env.production.local` removed. |
| iOS | Local Xcode 27 build **67**, IPA verified `1.1.4 (67)`, `iphoneos27.0`, scene manifest present. EAS submission **`89e1c7e3-6a0c-451d-a578-17ef64ab280e`** FINISHED; ASC build **`38cb6792-a553-4b40-a06e-1afed97fc343` VALID**, attached to new version **`de7e1e2e-9f53-4a5d-bc1e-afbb6e35f49b`** (1.1.3 was already `READY_FOR_SALE`, so no in-review replacement was needed). Review submission **`1786c94b-507d-4139-be39-709f40820afa`** submitted 17:15 UTC: **`WAITING_FOR_REVIEW`**, `releaseType AFTER_APPROVAL`. |
| Android | First EAS build `f13caa1f` (64) **errored** — "Gradle build daemon disappeared unexpectedly" on the EAS worker (same transient failure as 61 last release); its submission cancelled. Retry **`66b1d941-7fca-45ed-b361-ea53f7e75652`** versionCode **65** FINISHED, submission **`b4260f80-4a2a-4946-9ac5-bfe62596106f`** FINISHED to `internal`. **Not promoted to production** at the user's request; production remains 1.1.3 (63). |
| Store metadata | What's New on localization **`95525fa1-3c42-45cc-b11c-5f1854dd2735`**; reviewer notes PATCHed on review detail **`04bc9fbe-1423-4213-a441-fe4f3cdb2a7a`**, demo account `appreview@getflyright.com` preserved. Files: `store/apple/whats-new-1.1.4.txt`, `store/apple/review-notes-1.1.4.txt`. Play notes (453 chars) drafted but unused. |
| Screenshots | **Carried forward.** The only depicted change is the Flights section label (14 → 13 pt with 8 pt more above the first one); the plans screen and the free-plan live row are not in the listing. |
| Native regression | `release:devices --mode native` passed on iOS sim `AA6A8347` (Debug 1.1.4/67) and `emulator-5554` Pixel_9a (Debug 1.1.4/65): **15 s / 13 s**, report `.maestro/out/release/2026-09-24T16-19-59.808Z/report.json`. A first Android attempt failed because the freshly built dev client launched without its Metro URL ("Unable to load script"); relaunching with `flyright://expo-development-client/?url=http://localhost:8081` over `adb reverse` fixed it. |
| Candidate gate | **iOS passed** (run directly with `.maestro/release-signed-in.yaml`, since the runner insists on both platforms): production-configured Release **1.1.4 (67)** on iPhone 18 Pro `E2AC008A`, installed over the previous app, App Review account still signed in, two cold starts, Friends from the backend, retained trip `release-retained-photo-20260914` and its photo rendered, World rendered; 1 m 38 s; evidence `.maestro/out/release/ios-candidate-2026-09-24T17-10-38Z/`, copies in `~/Downloads/flyright-release-1.1.4-2026-09-24/`. **Android not run**: the store AAB was converted with bundletool and installed as 1.1.4 (65) on `FlyRight_Dev`/`emulator-5556`, but the reviewer sign-in did not complete before the user held the Android release. |
| Physical devices | **Skipped at the user's explicit request.** No physical-phone coverage is claimed. |
| Local dev apps | Debug **1.1.4 (67)** on `FlyRight iOS 27 Social` (`AA6A8347`) and Debug **1.1.4 (65)** on `emulator-5554` (Pixel_9a), both verified from the installed binaries. `FlyRight_Dev` (`emulator-5556`) still carries the re-signed 1.1.4 (65) candidate; restoring its debug build failed because the emulator went away during the release. |

**Incident:** `pkill -f "expo start"` used to restart FlyRight's Metro also
killed a Metro belonging to the user's other (Coinmotion) session; its iOS sim
then hit FlyRight's 8081 and logged "coinmotion has not been registered". Kill
Metro by pid from now on.

**To finish Android later:** sign the reviewer in on the `FlyRight_Dev`
candidate (or reinstall the APK set from `66b1d941`), run the candidate flow,
then promote versionCode **65** to production with the drafted notes.

## 2026-09-23 (evening) — 1.1.3 build 66/63: flag headings and trip grouping

Supersedes the held 1.1.3 builds below. The user resumed publication, asked for
the trip-heading and grouping work to ship with it, and **explicitly skipped
physical-device tests** again. iOS reached `WAITING_FOR_REVIEW` and Play production completed its rollout;
Apple's approval timing is its own and is not claimed here.

| Item | Observed result |
| --- | --- |
| Code | **1.1.3**, iOS **66**, Android versionCode **63**, from `31ea33a` (head of a seven-commit run starting `c813547`). Pushed; tree clean and in sync. |
| Tests | `npm run release:preflight` passed earlier at 65/62; after the later commits the full suite passed again: **100 suites / 1,193 tests**, typecheck and eslint clean. |
| Backend | `npm run release:deploy-backend` passed: **71 referenced client functions** deployed on production and development. Adds read-only `devTools:inspectItinerary`, `inspectRoute` and `clearViewerJournal`. |
| Hosting | Deployed and promoted; `getflyright.com` serves `entry-07b920c5111767bfcde41d3c2d8a1e2b.js`, matching the export, so the production alias moved. `/api/app-version?version=1.1.2` returns live store version **1.1.2** with empty notes, which is correct until the store serves 1.1.3. `.env.production.local` removed after deploying. |
| iOS | Local Xcode 27 build **66**, verified `1.1.3 (66)`, `iphoneos27.0`, scene manifest present. Submission **`28018291-ec61-40ec-a044-de73f8d43aaf`** for build 65 and the build-66 upload both finished; ASC build **`7eb408a8-6cdd-4626-bab1-71020fd9f4a1` VALID** attached to version **`a0dca108-aeb8-4fcd-882b-0371484b0230`**. Review submission **`41a4f32b-6daa-4c07-b2cb-fad6c78a9469`** submitted 18:56 UTC: **`WAITING_FOR_REVIEW`**, `releaseType AFTER_APPROVAL`. |
| Android | EAS build **`7ba834ce-f9d3-4254-b834-57f4ea7ebb8b`** versionCode **63** FINISHED, submission **`0a58829b-58d5-4959-9004-038f35ced7db`** FINISHED to `internal`. Promoted to **production** in edit `14599592560087283355`: re-reading the track shows **1.1.3 (63), `completed`, full rollout**, replacing 1.1.2 (59). Release notes 471 chars. Earlier build `b3c72535` (61) **errored** with no artifact and cancelled its submission; `39f66249` (62) finished but predates the grouping commits. |
| Store metadata | What's New updated on localization **`635afcac-739d-4940-9597-78291e06d200`** (9 bullets, 1,200 chars). Reviewer notes PATCHed on **`ae0e6824-bc79-4b56-b540-71093133f82b`**; demo account `appreview@getflyright.com` preserved. `store/apple/review-notes-1.1.3.txt` updated to match. |
| Screenshots | Only `phone-01-journeys` shows a trip heading, so it alone was reshot, from the iPhone Release build with the nine-trip demo journal. The other six iPhone panels and all iPad panels were carried forward unchanged. **The Android raw was NOT reshot** — `adb run-as` cannot reach app data on a non-debuggable release APK, so the emulator could not be reseeded after installing it. |
| Physical devices | **Skipped at the user's explicit request.** No physical-phone coverage is claimed. |
| Screenshot account | Maja Lindqvist's dev journal had accumulated 18 stray test trips (`wide-*`, `rep-*`, `tg-*`, `grouping-*`); removed with `devTools:clearViewerJournal` so the panel matches the carried-forward ones. |

**What shipped in this build beyond the flag heading:** a trip is no longer
shattered by a flight whose arrival is only a placeholder (`9e71105`); finished
trips read newest destination first (`18a4681`, which reverses a rule the suite
stated outright — both tests and `docs/trip-grouping.md` were rewritten, not
bent); the "continued" suffix is gone from headings (`5bd5a06`); a distant
flight counts in weeks, months and years rather than "357d ago" (`2496acc`);
and a followed person's trips use the same destination grouping, which
CirclePreview inherits (`fc20541`).

**Diagnosed from production, not shipped:** Shanavas's Sep–Oct 2025 US trip
read as four separate trips because `DL2267` and `AS774` were saved with
`12:00:00` as both departure and arrival. `9e71105` fixes the display without
touching the rows, so no data repair was needed; correcting those two arrival
times would still be more accurate.

**Known stale:** `.maestro/trip-grouping.yaml` and `.maestro/live-trip-row.yaml`
still assert `"US trip continued"`. They went stale when 1.1.3 moved headings to
cities and are doubly so now the suffix is gone. Left alone deliberately rather
than guess-edited during a release.

## 2026-09-23 — 1.1.3: free journals and trip-specific Pro (store submission on hold)

The user authorized commit/push and the full release, explicitly **skipping
physical-device tests**. The signed-out first-flight walkthrough is complete:
empty journal → add future flight → Pro offer → plans → native signup or existing
sign-in → selected Yearly plan restored → Continue free. The flight remains saved,
the session survives a cold start, and the home summary has no unwanted gap after
the introduction collapses. No purchase or reminder was submitted. A separate
uninterrupted 16-step screenshot run passed; its reviewed gallery and ZIP are in
`~/Downloads/FlyRight-pro-flow-2026-09-23/` and the adjacent `.zip`.

| Item | Observed result |
| --- | --- |
| Code/version | **1.1.3**, iOS **64**, Android **60**. Implementation/release commit `5afc8f9`, listing copy `ea73c80`, walkthrough evidence `8531da9`, all pushed. |
| Backend/preflight | Both production and development deployed with **71 referenced public functions**. TypeScript, five backend-contract regressions, **100 Jest suites / 1,190 tests**, and **32 security regressions** passed. |
| Hosting | Deployment **`qxelxt0bga`**, production alias serves `entry-2b27e969d2f25d81d024d5f1fb123a22.js`, matching the export. Production Convex and Clerk verified; development Convex absent. `/api/app-version` still reports live store version 1.1.2. The isolated export's production env file was removed. |
| iOS upload | Local Xcode 27 build **64**; IPA production configuration, scene support and `iphoneos27.0` verified. Submission **`3af65383-8853-48f0-a340-25b3a9b79ec0` FINISHED**; ASC build **`8f162abf-1a6e-4bc0-be8f-08096731d9e6` VALID**. The first upload's transient EPIPE was retried with the same IPA. |
| Android upload | EAS build **`5dcc404e-d658-46e9-a9ee-bf6693b1cbbe` FINISHED**, versionCode **60**. Submission **`c39d5977-ec19-423c-b15c-10422fd935ac` FINISHED**. Store AAB downloaded and packaged for the existing emulator using bundletool's device specification and the existing debug keystore. |
| Store metadata | ASC version **`a0dca108-aeb8-4fcd-882b-0371484b0230`**, localization **`635afcac-739d-4940-9597-78291e06d200`**, review detail **`ae0e6824-bc79-4b56-b540-71093133f82b`**. What's New, review notes and description updated; existing review credentials preserved. Play Free/Pro descriptions committed after EAS upload finished. |
| Physical devices | **Skipped at the user's explicit request.** No physical-phone coverage is claimed. |

**Publication hold:** after both uploads completed, the user explicitly said
**“Hold off on store submission.”** Do not submit App Review or promote Play
production until the user resumes publication. ASC remains editable and Android
remains on the internal track. Listing text and the first refreshed screenshot
sets had already been uploaded before the hold; later capture refinements remain
local. Verification, dev-app restoration and commit/push continue.

**Verified store hold (14:36 UTC):** iOS 1.1.3 remains
`PREPARE_FOR_SUBMISSION`; Play internal is 1.1.3 (60), while production remains
1.1.2 (59), completed. No review submission or production promotion was performed.

**Production candidate checks passed on both platforms.** iOS used Release
1.1.3 (64) with production configuration on `E2AC008A`; Android used the exact
store AAB 1.1.3 (60), converted to device-specific APKs and re-signed with the
existing local debug key. Both retained the dedicated reviewer account, passed
two cold starts, loaded backend/Friends data and displayed the established
retained trip/photo. Report: `.maestro/out/release/2026-09-23T14-35-31.278Z/report.json`.
Additional Updates, Claims and Flights flows passed on both platforms; their
screenshots and both retained-photo screenshots were inspected. iOS retained all
three original trip IDs. This is simulator/emulator coverage, not store-signed
physical-phone coverage.

**Android emulator recovery:** World was initially blank even though its data
loaded and the automated assertions passed. A data-preserving reboot restored
the globe; it remained correctly rendered after another app cold start. Android
also displayed a System UI ANR during recovery, and the emulator process later
needed a full restart without loading its snapshot. No app fix was made. Reviewed
before/after captures are in `android-core/` within the release scratch directory.
The automated World assertion alone is not proof of visual rendering.

**Store images:** current Release builds were used to refresh Flights and claim
panels on iPhone/Android and all three iPad panels. Free/Pro captions were updated.
The first complete sets were uploaded before the hold (ASC seven iPhone/three
iPad, Play seven each for phone and both tablet sizes). The later iPhone Updates
capture remains local and must be uploaded if publication resumes. Other pictured
surfaces were carried forward where unchanged. Temporary Pro entitlements for
three synthetic development screenshot owners were restored to their original
null values, with access reconciled; the viewing account stayed free.

**Native regressions and restoration completed.** Explicit prebuild and native
rebuilds installed Debug **1.1.3 (64)** on the original `A653D3AC` iOS simulator and
Debug **1.1.3 (60)** on `FlyRight_Dev` / `emulator-5554`; installed native versions
were checked. The final native photo regression passed on both (**22 s / 48 s**):
old-container file resolution and upload, recoverable HTTP failure, missing and
empty files rejected before upload, and a valid retry. The receiver independently
verified three expected requests on each platform. Report:
`.maestro/out/release/2026-09-23T15-03-59.142Z/report.json`.

All **25 original Android trip IDs** remain after the release and dev upgrades
(30 total rows, including existing reviewer and screenshot fixtures). No uninstall
or data clear was used. The main iOS simulator was signed out through the account
UI for the user's next manual Pro walkthrough; its account flights are retained.
Android's restored dev build is signed out after changing back from production
Clerk configuration. Metro stays on port 8081. The separate iOS production-candidate
simulator keeps its verified Release app and reviewer data, shut down.

The large local builds exhausted disk space and slowed both simulators. Completed
FlyRight Xcode intermediates/products, npm cache and the regenerable Xcode module
cache were cleared; the IPA, AAB, APKs and simulator app copies remain in the
release scratch directory. Temporary production environment files and reviewer
credential/debug files were removed. No physical tests or purchases were run.

Useful non-secret evidence is copied to
`~/Downloads/FlyRight-1.1.3-verification-2026-09-23/`; the separate 16-step gallery
remains in `~/Downloads/FlyRight-pro-flow-2026-09-23/`. Release scratch/evidence:
`/private/tmp/flyright-release-1.1.3/`. **Publication remains on hold.** Before
resuming, recheck current store state and upload the final local screenshot
refinement; do not treat the TestFlight/internal uploads as a completed release.

## 2026-09-22/23 — 1.1.2: grouped trips; iOS waiting for review, Play production accepted

The approved display-only trip grouping is implemented: country flags, date
ranges, distinct stay/connection marks and clearer separators between independent
trips. Groups recompute as flights are added or removed; US → Canada → US stays
flat, with YYZ → BOS in Canada and the subsequent US stay under **US trip
continued**. See [trip grouping](trip-grouping.md). No schema or authentication
implementation changed. The user explicitly requested **skip physical device
tests**; simulator/emulator coverage below is not physical-phone coverage.

| Item | Observed result |
| --- | --- |
| Code/version | **1.1.2**, iOS **63**, Android **59**; remote counters independently verified. Implementation/release `2f68294`, regression records `de764b4`, iOS retry counter `4ada5e6`. Android was built from `de764b4`; iOS from `4ada5e6`, whose app difference is the iOS build number. |
| Backend/preflight | `release:deploy-backend` passed on production and development: **67 client functions** on both. `release:preflight` passed TypeScript, backend-contract checks and **96 Jest suites / 1,129 tests**, including 28 grouping cases. The isolated security suite passed **24 checks** after two stale fixture expectations were corrected; security implementation is unchanged. |
| Feature/UI regressions | Direct return, connecting return and US → Canada → US layouts passed on **both** platforms. Android's real-menu removal flow recomputed the simple return group. Existing smoke, add-flight navigation and airport-picker flows passed on both. Signed-in core screens passed two cold starts on both. Fresh sign-up was confirmed on both; Android used native keyboard input after a Maestro field timeout, and iOS sign-out required a network retry before restoring the test account. Evidence: `.maestro/out/trip-grouping-20260922/`. |
| iOS build/upload | **Local EAS with Xcode 27.0**. The IPA reports `iphoneos27.0`, Xcode `2700`, the scene manifest, production Convex/Clerk values and no development Convex URL. Build **62** failed during `npm ci` with `ECONNRESET`, before compilation and without an IPA. Retry **63** succeeded. Submission `d4415586-7415-4309-9e32-59ab7c7b9183` **FINISHED**; ASC build `39a59073-8236-4988-aed4-1df57eaedc35` **VALID**. No iOS cloud build was used. |
| Android build/upload | EAS cloud build `11c62cb4-e27c-4e4b-9f94-9265a03a6b10` **FINISHED**, versionCode **59**. Auto-submission `1d85bf7a-84c2-4823-aa33-7bc7fd76d720` **FINISHED** to internal before any Play publisher edit was opened. |
| Production candidate gate | **Both passed**: iOS Release 1.1.2 (63), production configuration, on iPhone 18 Pro/iOS 27 (`E2AC008A`), **58 s**; Android store AAB converted to device-specific APKs with bundletool and re-signed with the existing local debug key, **2 m 35 s**. Dedicated reviewer account, two cold starts, backend/Friends, retained trip/photo and World; both photo and World screenshots inspected. Report: `.maestro/out/release/2026-09-22T20-33-44.028Z/report.json`. Android's test signature is local, not Play-installed coverage. |
| App Store | Version `823ca388-508b-4b14-bc47-b88648b0fe81`, build **63** attached, updated What's New and reviewer notes, existing reviewer credentials preserved. Review submission `196b1579-0577-4c03-a53d-f4eb283afdfb` and version both **WAITING_FOR_REVIEW**, `AFTER_APPROVAL`. Final state verified on 2026-09-23 EEST. |
| Google Play | Listing edit `14034949812127842585` committed first. Promotion edit `11603400444401024935` committed **1.1.2 (59)** to **production**, `status: completed`; a separate verification edit confirmed it and was deleted. Release notes are 416 characters. This is an accepted completed rollout; public review/propagation is separate. |
| Hosting | Deployment **e4xygqwivl** serves `entry-3777ba61aed595f4827a084b31cb6032.js`, matching the isolated production export. Production Convex/Clerk configuration verified. Final `/api/app-version` still reports **1.1.1 on both stores**, so it correctly returns no 1.1.2 announcement yet. The server carries the new notes for when public listings advance. Root development env files were preserved; temporary production env and reviewer-credential files were removed. |
| Store screenshots | Grouped Flights panels reshot on iPhone and Android from current **Release** builds using the development Maja store profile; all three iPad panels reshot for the wide layouts. The other six phone panels were carried forward because their pictured surfaces are unchanged. ASC iPhone **7/7**, iPad **3/3**, all **COMPLETE** before review submission. Play phone/7-inch/10-inch **7 each**, icon and regenerated feature graphic uploaded. Captures and generated assets are committed. |
| Native photo regressions | Initial 1.1.2 Debug iOS 62 / Android 59 passed before production builds. After retrying iOS as 63 and restoring development apps, the final run passed **iOS 63 / Android 59**: real old-container file resolution/upload, recoverable HTTP failure, missing/empty-file rejection and valid retry. Final report `.maestro/out/release/2026-09-22T20-53-31.124Z/report.json` (**14 s / 1 m 14 s**). |
| Local dev apps | **Debug 1.1.2 (63)** installed and verified on the original `A653D3AC` simulator (left running), dedicated grouping simulator `B0189F2E`, and retained candidate simulator `E2AC008A`. **Debug 1.1.2 (59)** restored on `FlyRight_Dev` / `emulator-5554`; Maja signed in and Flights visible, native version verified. Metro remains on 8081. Store iPhone/iPad simulators retain their current dev-backend Release capture apps. |
| Physical phones | **SKIPPED at the user's explicit request**. Neither simulator nor emulator results are labelled physical-device passes. |

**Retained data.** iOS kept its original three trips and the established
`release-retained-photo-20260914` / `release-retained-photo-image-20260914`
fixture. Android's original emulator snapshot contained 23 Maja trips and no
reviewer photo; the existing private reviewer fixture was restored from the
retained iOS database **before upgrading 1.1.1 (58)**. All **23 original Android
journey IDs remain** in the final dev installation, along with three reviewer
trips and four synthetic screenshot grouping rows (**30 total**, retained photo
present). No app uninstall or data clear was used for the candidate upgrades.
The original snapshot `flyright-before-trip-grouping-tests-20260922` remains
available. Useful captures are copied to `~/Downloads/flyright-1.1.2-release/`.

**Tooling recovery.** The local Android debug build needed 6 GB Gradle heap after
the default 2 GB failed D8; only generated native configuration changed. A
candidate-runner simulator container query timed out while another simulator was
installing; sequential simulator use cleared it. Restoring Android's dev client
later stalled its Metro download; a data-preserving emulator reboot and cold
start resolved it, followed by the successful final native regression report
above. No app fix or new production build was needed. Native versions and final
account/data state were checked after restoration. Release scratch artifacts:
`/private/tmp/flyright-release-1.1.2/`.

## 2026-09-22 — backend + hosting only (no app release)

Deployed on the user's request, between releases; the stores keep 1.1.1. Checked first that neither changes what the 1.1.1 apps get: the only backend change is internal (`devTools:importDemoJourneys`, screenshot accounts), and the only server-route change is `/api/app-version` gaining an optional `layouts` field, sent only when `WIDE_LAYOUTS` is set (it is not). Release notes and the flight routes are unchanged.

| Item | Observed result |
| --- | --- |
| Code | `main` at `0c9040e`: wide layouts (merged), EU261 intra-EU €400 cap (`fae36ce`), landing copy "From three hours late … up to €600" (`0c9040e`) — the app-side changes reach phones only with the next build |
| Backend | `release:deploy-backend`: production and development, **67** client functions on both. `release:preflight` exit 0: tsc, contract tests, Jest **91 suites / 1066 tests** (exits on its own now) |
| Hosting | Deployment `tq3gt88h2o` promoted; `https://flyright.expo.app` serves `entry-24d78964ebdce78b5ef0ba60ba773d7a.js` = local export, which carries the new landing line. `/api/app-version` for 1.1.1: no `layouts` field; Play `latest` 1.1.1; App Store `latest` 1.1.1 released 2026-09-21T20:27:59Z (first request after the deploy returned `latest: null`, the route's fail-soft retry; answered on retry). `.env.production.local` pulled and removed (none pre-existed) |
| Stores | Untouched. App Store serves 1.1.1 (so 1.1.1 cleared review). The physical Pixel 9a still runs Play 1.0.39 |
| Hosting (2nd) | `/flights` redirect-loop fix (`b3841b9`, web only): deployment `0hkv8urz6d` promoted; `flyright.expo.app` serves `entry-a00d1c626f2e3ba45923468fc66b9255.js`; `https://getflyright.com/flights` and the Expo URL now load the front page (was "Something went wrong" / max update depth). Env file pulled and removed again |
| Hosting (3rd) | EU261 outermost-regions applicability (`b481c11`) for the web checker: deployment `gn4yaafjkq` promoted; `flyright.expo.app` serves `entry-059544051e3155186d10c15026d6fd89.js` = local export; `/`, `/flights`, `/check` load; `/api/app-version` unchanged. Env file pulled and removed |
| Backend (2nd) | Follow page photos open full screen (`a09b8ca`): `live.byToken` (signed in) and `live.byFollow` gain an additive `photos: { ownerId, trips }` field — older apps ignore it. `release:deploy-backend`: production and development, **67** client functions on both; `release:preflight` passed (Jest **1095 tests**). The app side reaches phones with the next build |

## 2026-09-21 — 1.1.1 (Flights first again, Updates tab) replaced 1.1.0 in App Review; Play production live

TestFlight feedback on 1.1.0 (it led with other people's status, not the traveller's own flight) → Flights is the first tab again with the traveller's live card, Home became **Updates** (friends rail + postcards), a welcome greeting by name, postcard/You-tile/empty-state work. Version `1.1.1`, iOS build `61`, Android versionCode `58`. **1.1.0 never reached the App Store**: its review was withdrawn and the same version record renamed to 1.1.1 (recipe now in release-workflow.md → Builds). **Physical-device checks and the signed-in candidate check were skipped at the user's request.**

| Item | Observed result |
| --- | --- |
| Code | Feature commits `a1f4a58` (tab swap, postcards, empty states), `fd23c72` (welcome greeting, header); release `d8ab685` (bump, notes, store texts, build-split docs), `d849ae2` (web twin for `services/welcome` — the hosting export failed without it), screenshots `fe04387` |
| Backend | `release:deploy-backend`: production and development, **67** client functions on both (new `updates.mineRecent`). `release:preflight`: tsc, contract tests, Jest **88 suites / 1010 tests**; Jest's known hang killed, `release:backend` re-run separately (passed). `devTools:insertUpdate` (internal) added |
| Hosting | Deployment `msdw2ovggh` promoted; `https://flyright.expo.app` serves `entry-d47328eccd9c83176e36f031e97b2863.js` = local export; production Convex URL and `pk_live` present, development URL absent; export carries the 1.1.1 notes. `.env.production.local` pulled and removed (none pre-existed). The local `node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.{js,wasm}` were missing from the install and were restored from the 57.0.3 tarball |
| iOS build | **Local** `eas build -p ios --profile production --local` (Xcode 27.0, `DTSDKName iphoneos27.0`, scene manifest), 60 MB IPA, production Convex + `pk_live`, no dev URL; `eas submit --path` submission `3727524e` finished; ASC build `0f6070aa-b2da-4d41-a239-dcb83b47608e` (61) **VALID**. Disk: freed ~20 GB first (FlyRight's own DerivedData, `android/app/build`, npm cache) |
| Android build | **EAS cloud** `bda8e880-747f-42a5-a2ae-d7635771c51d` 1.1.1 (58) finished; auto-submission `feb5e818` finished to internal (`["58"]`) |
| ASC | 1.1.0 reviewSubmission `5b58caad` cancelled → version `34235c94` DEVELOPER_REJECTED → `versionString` 1.1.1, build 61 attached, whatsNew from `store/apple/whats-new-1.1.1.txt` (773 chars; covers 1.1.0 too since iOS users go 1.0.38 → 1.1.1), reviewer notes `store/apple/review-notes-1.1.1.txt` on detail `ce3b1bec` (demo account kept). reviewSubmission `8bf815cd-2c4b-4ba6-b550-e4de9f2416ee` submitted 12:33 UTC → **WAITING_FOR_REVIEW**, AFTER_APPROVAL |
| Play | Edit `08858812627599028282`: production `1.1.1 (58)`, `status: completed`, en-US notes `store/google/release-notes-1.1.1.txt`; verified `production completed ["58"]`. Listing images uploaded first (`upload-play-assets.mjs`, edit committed) |
| Screenshots | Panels with the tab bar reshot from 1.1.1 Release builds pointed at dev, signed in as the store profile (Maja): Updates, Flights (welcome header + tomorrow's live card), World, Travel stats — iPhone on FlyRight Shots, Pixel on **FlyRight_Dev** (1080×2424 @420, same as Pixel 9a: the Pixel_9a AVD refused to boot, "not enough disk space"), iPad Pro 13-inch (M5, iOS 26.5, `21576EE7`) Updates + Flights. Trip page, verdict and Add Flight panels (no tab bar) carried over. ASC iPhone 7/7, iPad 3/3; Play phone/tablet sets |
| Native regressions | `release:devices --mode native` **passed**: iOS Debug 1.1.1 (61) on iPhone 17 Pro (`CF8D70D3`) 11 s, Android debug 1.1.1 (58) on `FlyRight_Dev` 1 m 7 s; evidence `.maestro/out/release/2026-09-21T11-55-57.758Z/` |
| Candidate checks | **Skipped at the user's request.** Prepared but not run: iOS production Release 1.1.1 (61) on iPhone 18 Pro signed in as App Review; Android store AAB → bundletool splits (project `android/app/debug.keystore` re-sign, `--device-spec` because `--connected-device` failed on SDK 37) installed on FlyRight_Dev. Android reviewer sign-in is blocked by Clerk: it tries a passkey, fails ("No credentials available") and closes the sheet; only the email-code route works |
| Physical devices | **Not run — skipped at the user's request** |
| Local dev apps | Debug 1.1.1 (61) on iPhone 17 Pro, iPhone 17, iPhone 18 Pro, iPhone 18 Pro Max sims; debug 1.1.1 (58) on `FlyRight_Dev`. FlyRight Shots and the iPad keep the dev-backend Release 1.1.1 build signed in as Maja |

**Learned.** (1) Another agent session built this checkout with the second Xcode (`~/Downloads/Xcode.app`, 27.1) and left `node_modules/expo-modules-jsi/apple/Products` built by it; the Xcode 27.0 Debug build then failed parsing `ExpoModulesJSI.swiftinterface`. Deleting `apple/Products` and `apple/.DerivedData` there lets the build phase regenerate it. (2) Every `expo-sqlite/kv-store` service needs a `.web.ts` twin or the web export fails on the wasm worker. (3) Known, not fixed (user: later): on iPad, tabs other than the launch tab can render squeezed after tab switches; a fresh launch renders them correctly.

## 2026-09-21 — 1.1.0 (Home, Flights, Friends rework) built LOCALLY with the iOS 27 SDK, submitted for App Review and live on Play production

First release built on this Mac with `eas build --local` instead of EAS cloud. Version `1.1.0`, iOS build `60`, Android versionCode `57`. The earlier cloud 1.1.0 builds (iOS 59 — uploaded and attached in ASC by an earlier session — and Android 55) predated the Home fixes and were replaced. **Physical-device checks were explicitly skipped by the user** for this release ("skip physical device test"); simulator/emulator coverage below is what ran.

| Item | Observed result |
| --- | --- |
| Code | Home fixes `b25f924` (all-time card off Home, title → avatar + greeting, "Postcards"), `4de72d3` (cold-start skeleton), `1da13a5` (navy empty-feed card, single-friend line); notes/build numbers `e8c0718`, versionCode alignment `a484705`, listing reshoot + store profile `eabaaaa` |
| Backend | `release:deploy-backend`: production `limitless-oyster-269` and development, **66** client functions on both. `release:preflight`: tsc, 5 backend-contract tests, Jest **88 suites / 1010 tests** passed; Jest's known "did not exit" hang killed, final `release:backend` run separately (passed). Later the same day `devTools` (internal only: `storeDemoPhoto`, `ownDemoFile`, `resetStoreDemo`, `seedDemoCircle` posts/manual) pushed to **dev only** — reaches prod with the next backend deploy, no client impact |
| Hosting | Deployment `enzbypj2if` promoted; `https://flyright.expo.app` serves `entry-f841bc0e0617c08cc60f67beb82c2893.js` = local export; production Convex URL present, development URL absent, `pk_live` present (the `pk_test_` strings are Clerk's key-format checks). `/api/app-version` export carries the 1.1.0 notes; live route reported latest 1.0.38 at deploy time. `.env.production.local` pulled for the export and removed (none pre-existed) |
| iOS build | `eas build -p ios --profile production --local`: **Xcode 27.0 (27A266a), `DTSDKName iphoneos27.0`**, `EXExpoAppSceneDelegate` scene manifest, 57 MB IPA; bundle has production Convex + `pk_live`, no dev URL. `eas submit --path` submission `7035b79c-3980-4c0e-95ef-cec1cbdaf887` FINISHED; ASC build `eee6546e-ace5-471e-acf2-732971743852` (60) **VALID** — Apple accepts an iOS-27-SDK build from this Mac |
| Android build | First local attempt died in R8 (`OutOfMemoryError`, consumed versionCode 56). Retry with `org.gradle.jvmargs=-Xmx8g -XX:MaxMetaspaceSize=1g` in `~/.gradle/gradle.properties` (user-level beats the regenerated project file; removed afterwards) → AAB 1.1.0 (57), 191 MB. Submission `16836d46-b83e-411d-8a90-f0c2e644dde4` FINISHED to internal (verified `["57"]`) |
| ASC | Version `34235c94-1ded-4bb4-938c-4b9d57f4ee1b` (existing 1.1.0 record, AFTER_APPROVAL) reused; build 60 attached (replaced 59); whatsNew (6 bullets, 749 chars) on localization `f45c1d15`; reviewer notes `store/apple/review-notes-1.1.0.txt` (profile picture now top **left**) PATCHed onto detail `ce3b1bec`, demo account + password preserved. reviewSubmission `5b58caad-6c9c-461d-967c-b7506b1feb37` submitted 08:10:16 UTC → **WAITING_FOR_REVIEW**, version WAITING_FOR_REVIEW |
| Play | Edit `01910749103915541650`: production `1.1.0 (57)`, `status: completed`, en-US notes `store/google/release-notes-1.1.0.txt` (476 chars); verified `production completed ["57"]`. Store review/propagation can still delay public availability |
| Screenshots | **All reshot** (1.0.39 tab bar in the old set). Shot signed in as the new **store profile** (dev user Maja Lindqvist + synthetic friends Noah/Clara/Tomas with postcards — `scripts/store-profile.json`, `scripts/seed-store-profile.mjs`, recipe in release-workflow.md) from Release builds pointed at dev: iPhone on FlyRight Shots (iPhone 17 Pro / iOS 26.5), iPad on iPad Pro 13-inch (M5) / iOS 26.5, Pixel on the Pixel_9a AVD. Listing is now **7 panels, Home first** ("Your people, in the air"); iPad set = Home, journal, trip detail (Settings dropped). ASC iPhone 6.5" set 7/7 and iPad 12.9" set 3/3 COMPLETE; Play phone/7"/10" (7 each), icon and feature graphic uploaded by `scripts/upload-play-assets.mjs` (now 7 panels) after the EAS upload finished |
| Native regressions | `release:devices --mode native` **passed**: iOS Debug 1.1.0 (60) on iPhone 17 Pro sim (`CF8D70D3`) 12 s, Android debug 1.1.0 (57) on `FlyRight_Dev` (`emulator-5554`) 15 s; evidence `.maestro/out/release/2026-09-21T07-55-07.718Z/` |
| Candidate checks | `release:devices --mode candidate --account-email appreview@getflyright.com --journey-id release-retained-photo-20260914` **passed on both**: iOS = production-configured Release 1.1.0 (60) built from the release tree with the iOS 27 SDK, on the **iPhone 18 Pro / iOS 27.0** sim (`E2AC008A`) over the Debug app, 50 s; Android = the **store AAB itself** turned into an APK set with bundletool (`build-apks --connected-device`, debug-keystore re-sign) installed over the debug app on `FlyRight_Dev`, 1 m 27 s. Both came up signed out; reviewer signed in through the Clerk password path (password from ASC into a mode-600 scratch file, deleted after; Maestro test logs deleted). Both `retained-trip-photo.png` reviewed: the app-icon JPEG renders. Evidence `.maestro/out/release/2026-09-21T08-06-24.392Z/` |
| Physical devices | **Not run — skipped at the user's request.** No physical-phone coverage for 1.1.0 |
| Local dev apps | Debug 1.1.0 (60) on iPhone 17 Pro (`CF8D70D3`), iPhone 17 (`53F70378`, iOS 26.5) and iPhone 18 Pro (`E2AC008A`, iOS 27.0) sims; debug 1.1.0 (57) arm64 on `FlyRight_Dev`. FlyRight Shots, the iPad Pro 13-inch (M5) sim and the Pixel_9a AVD keep the dev-backend **Release** build signed in as Maja for future captures. Metro running on 8081 |

**Recipes learned.** (1) `eas build --local` works end to end for both stores here (remote credentials, remote build numbers, `eas submit --path`), but needs disk: the data volume had 13 GB free; clearing the npm cache (9.5 GB) and `android/app/build` (4.9 GB) made room, and Gradle peaked at ~12 GB free — run the two builds one after the other. (2) For `--local` Android, the R8 heap fix goes in `~/.gradle/gradle.properties`; the project file is regenerated in a temp dir. (3) The Pixel_9a AVD's 6 GB data partition cannot take a universal APK (306 MB, INSUFFICIENT_STORAGE): use `bundletool build-apks --connected-device` or `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (108 MB). (4) Seeding a release-build Android install: debug arm64 APK (loads JS from Metro) → first launch creates the DB → `seed-demo-data.mjs --android` → `adb install -r` the release APK (same debug keystore keeps data and sign-in). (5) On the iOS 27.0 sim, a system "Allow widgets from Maps to use your location?" alert can sit over the app — dismiss "Don’t Allow" optionally in flows. (6) Clerk's Android password field showed its text in plain view after the adb tap — delete any screenshot taken of it. (7) Xcode 27 has no Simulator.app; DeviceHub shows the sims.

## 2026-09-20 — iOS 27 SDK readiness on SDK 57 (scene lifecycle); no release, no build, no deploy

Not a release: no version bump, no EAS build, no backend or hosting deploy. `1.0.39` / iOS `58` / Android `54` are untouched.

**Why.** Apple requires the iOS 27 SDK for App Store uploads from **April 2027** (`developer.apple.com/news/?id=ueeok6yw`). Linking against that SDK also makes the **UIKit scene lifecycle mandatory** — an iOS-27-linked binary without it is refused at launch by iOS 27. This was previously recorded as an SDK 58 problem gated on Clerk; it is not. Expo backported scene support to **SDK 57.0.23** (`expo-build-properties` `ios.enableSceneSupport`, minimum `expo` 57.0.23, no-op on SDK 58+).

**Change.** `expo` 57.0.18 → **57.0.24**, `expo-build-properties` 57.0.15 → **57.0.21**, `npx expo install --fix` for the rest of the SDK 57 map (all patch-level, same SDK — splash-screen, router and notifications hook the root window). `ios.enableSceneSupport: true` added to the `expo-build-properties` block in `app.json`. Prebuild then emits `AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider` without the legacy `window = UIWindow(...)` / `startReactNative` block, and `UIApplicationSceneManifest` → `EXExpoAppSceneDelegate`. The `plugins/with-assistant-actions.js` anchor (`FlyRightShortcuts.updateAppShortcutParameters()`) survives the rewrite.

| Item | Observed result |
| --- | --- |
| Both directions measured | Same tree, same iPhone 18 Pro / **iOS 27.0** simulator (`E2AC008A`). `enableSceneSupport: false` (the pre-change project, regenerated by prebuild — legacy AppDelegate, no manifest): installed binary `DTSDKName=iphonesimulator27.0`, **refused to launch** — `FlyRight[57295] (UIKitCore) failure in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption (UIApplication_RuntimeIssues.m:106) : Application failed to launch: UIScene life cycle is required for apps built with this SDK`. `enableSceneSupport: true`: **launched and rendered**, all five tabs, process alive past 30 s |
| iOS 27.1 | Same `.app` installed on iPhone Duo (`CFC681E3`, foldable, iOS 27.1): launched and rendered, five tabs |
| Build | `Build Succeeded`, **0 errors**, 6 warnings, Xcode 27.0 (27A266a). This Mac has **only** the iOS 27.0 SDK — every local `expo run:ios` here links iOS 27 |
| Checks | `npm run typecheck` clean; `npx eslint src/ plugins/` 1 pre-existing warning (`time-dialog.tsx` `import/no-named-as-default`), 0 errors; `npx jest` **88 suites / 1007 tests** passed |
| Production impact | **None.** `eas.json` pins no `image`, so cloud builds use `macos-tahoe-26.5-xcode-26.6` (iOS 26 SDK). Shipped 1.0.38 runs on iOS 27 under the legacy lifecycle; this change is inert on EAS until an Xcode 27 image exists |
| Still open | EAS Build has no Xcode 27 image (`docs.expo.dev/build-reference/infrastructure/` newest is `macos-tahoe-26.5-xcode-26.6`). Re-check before relying on an iOS-27-linked store build. Not verified here: Android, release/minified build, physical devices, web |

**Gotcha worth keeping.** Stripping `UIApplicationSceneManifest` out of an already-built `.app` and re-signing does **not** reproduce the pre-change state — it leaves the scene-adopted AppDelegate (which no longer creates a window), and the app then launches past UIKit and crashes inside `ExpoModulesCore` module registration instead. To test the mandate, flip `enableSceneSupport` and re-run prebuild so both the AppDelegate and the manifest revert together.

## 2026-09-18/19 — 1.0.38 (sun-lit globe, moving plane, share poster heat) submitted for App Review and live on Play production

Release commit `c597c41` (bump) with store notes in `edaa71f`; the release code is `6613a1b` and earlier (globe day/night `9292d00`, moving plane `758a64f`, share poster heat `51a7bc0`, person-page globe `2fb2b2d`, overnight lookup fix `31b38e2`). Version `1.0.38`, iOS build `55`, Android versionCode `52`. The builds, uploads, App Store version, What's New, reviewer notes and hosting deploy were done in the evening session; this session (from 18:51 UTC) finished the checks and the store promotion.

| Item | Observed result |
| --- | --- |
| Backend | `release:deploy-backend` re-run this session: production `limitless-oyster-269` and development deployed, 60 client functions on both (carries the `providerFetch`/`flightNormalize` position change and the overnight-lookup fix). `release:preflight`: tsc, 5 backend-contract tests, Jest **80 suites / 907 tests** passed; Jest's known "did not exit" hang was killed and the final production inventory step run separately (passed) |
| Hosting | Deployed in the evening session from the bump tree: `https://flyright.expo.app` serves `entry-65444867652b7ab279450816ae8544de.js` = local `dist/` export; the exported `/api/app-version` function contains the 1.0.38 notes; bundle has the production Convex URL and `pk_live`, no development URL. Route verified: `latest` 1.0.37 on both stores (App Store approved 1.0.37 at 18:21 UTC), notes served for versions the stores carry |
| iOS EAS build | `0c09e69b-dc34-45b1-b2d6-62e5fc6425ef` FINISHED (1.0.38 / 55, production); submission `13b7be19-868b-4362-819c-d7eea8f9697f` FINISHED. Ad hoc preview `6624ffc0-a932-4e2e-9099-c3e10d210b62` (1.0.38 / 55, environment=production) for the iPhone |
| Android EAS build | `fa333344-a4d1-4390-995d-be92c9705441` FINISHED (1.0.38 / 52, production); submission `fadb5aaf-77e9-4151-b214-529a06472496` FINISHED to Play internal (track verified: `completed`, `["52"]`). Preview APK `7664dc6d-82ae-418a-bd0d-835e88ef07ba` (1.0.38 / 52, environment=production) for the Pixel |
| ASC | Version `6ae4d0d0-336b-4820-8869-c2f599ee1651` (AFTER_APPROVAL), build `2f8713aa-3f37-4c42-8099-f750045d4fae` (55) VALID and attached, whatsNew on localization `dc86c9c5`, review notes (`store/apple/review-notes-1.0.38.txt`) on detail `098a7107` with the demo account preserved. Screenshot: iPhone 6.5" panel 4 (World) replaced in place (`bc9c4fc9`, COMPLETE), order kept; iPad set carried over (no World panel in it). reviewSubmission `2aa88112-5c1c-4663-8327-705ad9531dad` created with the version item and submitted at 20:01:34 UTC → **WAITING_FOR_REVIEW**, version WAITING_FOR_REVIEW (AFTER_APPROVAL) |
| Play | Listing images regenerated and uploaded by `scripts/upload-play-assets.mjs` (edit committed) after the EAS upload had finished. versionCode **52** promoted to **production** as "1.0.38 (52)", `status: completed`, en-US notes from `store/google/release-notes-1.0.38.txt` (481 chars); verified on the track: `production completed 1.0.38 (52) ["52"]`, internal still `["52"]`. Store review/propagation can still delay public availability; `/api/app-version` will announce 1.0.38 only once the public listings serve it |
| Screenshots | World panel reshot from the 1.0.38 **Release** builds: iPhone on the FlyRight Shots sim (iPhone 17 Pro / iOS 26.5, seeded anonymously with the nine demo trips), Pixel on the Pixel_9a AVD (local release APK, same seed). Captured with the globe's **fixed studio light** (the sun button switched off) so every route is legible; at 22:00 EEST the default sun-lit globe puts Europe in night and hides most routes. The sun-lit alternative is in `~/Downloads/flyright-1.0.38-release/store-world-alternatives/`. Panels 1–3, 5, 6 unchanged (UI not touched by this release). The Pixel raw's status bar had the app's ongoing travel-day notification icon painted over (demo mode cannot hide a foreground-service icon) |
| Native regressions | `release:devices --mode native` **passed** on iOS Debug 1.0.38 (55) (iPhone 17 Pro sim) and Android Debug 1.0.38 (52) (`emulator-5554`, new `FlyRight_Dev` AVD); report `.maestro/out/release/2026-09-18T19-41-01.570Z/`. A first run failed because the iPhone 17 Pro sim came up in a fresh state (onboarding screen) |
| Candidate checks | `release:devices --mode candidate --account-email appreview@getflyright.com --journey-id release-retained-photo-20260914` **passed on both** (iOS 50 s, Android 47 s): iOS Release 1.0.38 (55) built locally from the release tree and installed over the Debug app on the iPhone 17 Pro / iOS 26.5 sim; Android local release APK 1.0.38 (52) installed over the Debug app on the new `FlyRight_Dev` AVD (`emulator-5554`). Both hosts came up signed out (the iPhone 17 Pro sim was fresh, the AVD is new), so the reviewer was signed in through the Clerk password path first (password read from ASC into a mode-600 scratch file, deleted afterwards; iOS via Maestro, Android via Maestro taps + adb typing). Production bundle checks, two cold starts, account, People, the retained trip and its photo (both `retained-trip-photo.png` reviewed: the app-icon JPEG renders), World. Report `.maestro/out/release/2026-09-18T19-56-49.021Z/`; copies in `~/Downloads/flyright-1.0.38-release/candidate/`. The Pixel_9a AVD (`emulator-5556`) was not used for the candidate this time: it holds the anonymous nine-trip demo seed (used for the Play World panel) and signing the reviewer in there would have migrated demo trips into the reviewer account |
| Physical iPhone 15 Pro | iOS 26.0.1, **USB** (`wired`/`connected`), unlocked by the user. Ad hoc 1.0.38 (55) already installed (evening session) over the user's data, user's own account (32 trips). `devicectl` cold starts `flyright://settings` (PID 6045) and `flyright://world` (PID 6099) alive after 35 s; crash logs 8 before / 8 after (all 2026-09-14), none new. XCTest `testAllTabsAcrossTwoColdStarts` **passed** (137.9 s): My travels, World (day/night globe, beacon, plane on the upcoming HEL→DOH), People, Claims, Settings on both cold starts, all ten screenshots reviewed (`~/Downloads/flyright-1.0.38-release/physical-iphone/`). Two earlier attempts failed to initialise UI testing: the phone auto-locked after 5 min and the Face ID "allow UI automation" prompt was cancelled; the third run passed. The suite's demo-capture tests (`testCaptureDemoFrames` etc.) failed afterwards for lack of env vars and another auto-lock — not release checks. Evidence `.maestro/out/physical-ios-2026-09-18T18-57-31Z/` |
| Physical Pixel 9a | `tegu`, Android 17, wireless adb `192.168.0.55:45079`. 1.0.36 (50, sideloaded) → **1.0.38 (52)** preview APK installed with `adb install -r`, data kept. APK: non-debuggable, production Convex, `pk_live`. `release-core` **signed-out passed** (42 s): two cold starts, My travels, Settings, People, World (globe) — screenshots reviewed (`~/Downloads/flyright-1.0.38-release/physical-pixel/`). My travels is empty before and after: the phone has been signed out and empty since the user's reinstall on 2026-09-16 (same as the 1.0.36 evidence), so no trip-retention evidence exists on this phone. Dropbox crash/ANR 0 → 0; exit-info only Maestro's FORCE STOPs; logcat no FATAL/ANR. PIN typed with adb key events (user-supplied, not stored); `screen_off_timeout` 30 s → 30 min for the run → restored; `svc power stayon` restored to false. Evidence `.maestro/out/physical-android-2026-09-18T19-02-27Z/` |
| Local dev apps | iPhone 17 Pro sim (`F8E2E504`) Debug 1.0.38 (55) reinstalled after the candidate check (fresh state, onboarding skipped, anonymous); `FlyRight_Dev` AVD (`emulator-5554`) Debug 1.0.38 (52) reinstalled (anonymous; the reviewer session from the release APK does not carry over the reinstall). The Shots sim keeps Release 1.0.38 (55) with the demo seed and `globe-daylight=off`; the Pixel_9a AVD keeps release 1.0.38 (52) with the demo seed and studio light. Metro was started with `--clear` for the dev apps |

**Recipes learned.** (1) Pixel 9a unlock: `input text <PIN>` was unreliable this time; `KEYCODE_WAKEUP` → swipe `540 1500 → 540 300` → one `input keyevent KEYCODE_<digit>` per digit → `KEYCODE_ENTER` worked every time. `svc power stayon true` only applies on charger power — set `screen_off_timeout` (and restore it) when the phone is on battery. (2) iPhone XCTest on USB: the runner needs the "allow UI automation" Face ID/passcode prompt approved on the phone; "Authentication cancelled. UI canceled by system" (LocalAuthentication −4) means the prompt was not answered. The phone's 5-minute Auto-Lock ends a session; ask for Auto-Lock = Never up front. (3) `expo run:android` with a physical phone on adb picks the PHONE as install target (it tried to push the debug APK onto the Pixel, harmless signature mismatch): install the built debug APK with `adb -s <emulator> install -r` instead. (4) `Pixel_9a_2` AVD has a 6 GB data partition that was full; the `FlyRight_Release_*` AVDs lived under `/private/tmp` and were gone after a reboot. New `FlyRight_Dev` AVD (`~/.android/avd`, Pixel 9a config copied from `Pixel_9a`, `disk.dataPartition.size=16G`, `.ini` target fixed to android-37.0). (5) On Android release builds `run-as` is unavailable, so the globe lighting can't be flipped through the kv-store: tap the header button by its accessibility label (`Hide day and night` / `Show day and night`); on the iOS sim write `globe-daylight=off` into `Documents/SQLite/ExpoSQLiteStorage` (table `storage`) while the app is terminated. (6) Clerk's password field on the Android emulator loses focus after the Maestro tap: tap it again with `adb shell input tap 540 996`, then type one character per `input text` call.

## 2026-09-18 (evening) — Website: phone fold fix + captures with the flight in the air (hosting only, no store release)

| Item | Observed result |
| --- | --- |
| Code | `55fe709` (hero phones break the first screen on small phones: `Reveal eager`, tighter stacked rhythm), `a61ee7d` (`travel-day.png` / `world.png` light+dark reshot from a fresh Release build on the Shots simulator with the demo flight airborne; `scripts/capture-landing-shots.mjs`). Hosting also carries today's `/api/flight-status` change (`withLocation=true`, `position` on the record) ahead of the client that reads it — additive, older binaries ignore the field. tsc/eslint clean |
| Hosting (later) | `77be422` (three new rows: steps, updates, share poster) — deployment `7m288yozux` promoted; both domains serve `entry-15efa15f7ced7a1ab1c18f592c0acac0.js` = local export, production Convex URL + `pk_live` verified, env file restored |
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
