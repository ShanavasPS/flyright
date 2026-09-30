# Required release checks

These checks target the 1.0.33 photo-upload crash and the undeployed `followerActivities:mine` query found during the 1.0.34 release. They run at different stages because a clean dev launch cannot establish that an existing signed-in install works after an update. They reduce release risk; they do not prove every feature on every device works.

## Commands that trigger these checks

- **"Submit builds" / "submit new builds" / "run new builds":** execute the full release workflow, including checks on the new candidate on the physical Pixel 9a and iPhone 15 Pro before App Review/Play production promotion. Discover hardware at the start; an old version already installed on a phone does not clear the new candidate. Missing physical coverage must be resolved or explicitly reported before release completion.
- **"Test on physical devices":** execute the physical Android and iPhone procedures below as a standalone task, including the read-only production backend check. Use current installations or already available matching updates and preserve their data. Do not start a new release, version bump, cloud build or backend deployment merely because this testing command was used.

Reuse existing pairing. If connectivity or unlocking requires the user, request only that missing input and continue checks on the other available phone. Report Android UI assertions, iPhone tab/screenshot and process/crash observations, signed-in coverage and photo/upgrade coverage separately. These phrases are shared agent instructions in `AGENTS.md`, not terminal commands the user needs to run.

## Before building

```sh
npm run release:deploy-backend
npm run release:preflight
npm run release:journal
```

`release:deploy-backend` deploys production and development, then reads both deployed function inventories. `release:preflight` runs TypeScript, the backend-check regression tests, the full Jest suite (including photo paths, photo sync, migrations/row loading, Wallet and imports), and a fresh production inventory check. Every command must exit zero.

`release:backend` is the standalone read-only production check. It discovers API references from the actual app source, including platform-specific components, and compares them with Convex's deployed public functions. It fails on missing functions, the wrong deployment URL, authentication/network errors, and unresolved dynamic references. Its regression test removes the exact startup query that failed in 1.0.34. See [Convex function-spec](https://docs.convex.dev/cli/reference/function-spec).

`release:journal` runs the app's own trip grouping, trip headers and automatic home base over a real journal pulled read-only from production (`devTools:inspectItinerary`, default the owner's profile; pass another name as `-- "<name>"`). The pulled file lives in the OS temp dir with mode 600 and is deleted after the run. It fails when a trip header's place is not the city it is named after, or the home is a city no journey leaves from. Added after 1.1.5 (69) reached TestFlight showing the owner's connecting trips under their layover (Helsinki via Doha read as Qatar) and Doha as home: fixtures had no connections, the real journal did. Extend `scripts/journal-check/journal.test.ts` whenever a release changes how journal data turns into places, groups or totals — it costs seconds and needs no build.

The inventory proves functions exist and are public; it cannot prove their implementation or validators match the local code. That is why a successful deployment and signed-in candidate checks are also required. Do not replace deployment with code generation or reuse a previous inventory report.

## Native photo regression on both platforms

Prebuild and install current development binaries on the iOS simulator and Android target. Keep FlyRight's Metro server running and complete onboarding. Then:

```sh
npm run release:devices -- --ios <booted-simulator-udid> --android <adb-serial> --mode native
```

The runner requires both targets and checks their installed versions/build numbers against `app.json`. It hosts a loopback-only upload receiver on port 18765 and sets up Android `adb reverse`. The unlinked `/dev/release-check` route runs only with `__DEV__`; production redirects to the home screen. It uses real `expo-file-system` and `expo/fetch`, not Jest mocks, to check:

1. A file URI stored under an old iOS app-container path resolves to the current installation and its bytes upload successfully.
2. A server failure is a recoverable JavaScript rejection.
3. Empty and missing files fail before any upload request; they must not cause a native process crash.
4. A valid upload succeeds after those failures.

The receiver verifies the exact number/content of requests independently of the screen's success label. Only temporary `trip-photos/release-check-*` files are created and removed. Existing photos, the journey database, authentication and cloud data are retained. A crash, red error screen, wrong request count, stale binary or failed assertion causes a nonzero exit.

## Candidate checks before App Review or Play production

Keep a dedicated test account and at least one past trip containing a valid photo on both test installations. Keep the same account and trip across releases. Install the candidate over the previous app without uninstalling it or clearing its state, then run:

```sh
npm run release:devices -- --ios <booted-simulator-udid> --android <adb-serial> --mode candidate --account-email <dedicated-test-email> --journey-id <retained-trip-id>
```

Use release binaries built from the intended release commit and production environment, not Metro clients. For iOS simulator coverage, build the Release configuration from that commit; the App Store IPA cannot run on a simulator. For Android, use the release APK produced from that commit/configuration or the installed Play internal candidate. The runner checks version/build, rejects Android debuggable apps, and inspects bundled public configuration on both platforms for production Convex and Clerk values.

The 1.0.35 candidate flow passed on the iOS simulator and Android emulator on 2026-09-14/15 using the existing production reviewer account. Retain private trip `release-retained-photo-20260914` and its photo `release-retained-photo-image-20260914` for subsequent releases. The photo is a local JPEG of the app icon. Account credentials remain in App Store Connect; never put them into committed flows or logs. These simulator/emulator checks do not constitute physical-phone or store-signed-binary coverage.

The Maestro flow cold-starts twice, waits for the expected signed-in account, loads People data from the backend, opens the retained journey/photo, and checks the World screen. It never uses `clearState` or `clearKeychain`. Set up/log into the dedicated account before this gate; do not point it at a personal account. Check screenshots to confirm the retained photo renders correctly. Restore local dev binaries after any release-build testing.

Use the existing `.maestro/` feature flows for changed areas: Wallet/PDF/photo intake, live activities, invites, journal editing, support and purchases. Document fixture setup and any required device interaction. A base smoke pass does not replace testing the feature changed in that release. Do not send support messages, invite real people or make purchases merely to satisfy a smoke test.

## Account and journal matrix (since 1.1.5)

Every release also runs the four account/journal states on the physical Pixel 9a and iPhone 15 Pro, on the production-configured candidate: **signed out with no trips, signed out with trips, signed in with no trips, signed in with trips.** The user asked for this on 2026-09-27 (1.1.5, which added home base, trip photo headers and city pages that behave differently in each state).

- Signed in with trips: the App Review account `appreview@getflyright.com` and its retained trip (above).
- Signed in with no trips: the dedicated production account **`release-empty@getflyright.com`** ("Release Test", Clerk `user_3JuiNYMtSEzF1mJRgVyjGMX6uMN`, created 2026-09-27 with the Clerk CLI). Its password was generated then and lives only in the release session's scratchpad; reset it with `clerk api /users/<id> -X PATCH --instance prod` if lost. Never add trips to it.
- Signed out: sign out from Settings. With no trips = the guest journal is empty; with trips = add a past **connecting** trip as a guest (e.g. COK→DOH then DOH→HEL within 24 h, not a single direct flight), run with `-e EXPECT_PLACE=Helsinki -e LAYOVER_PLACE=Qatar`, then delete both legs **before** signing back in (a guest's data carries over to an account that has none). A direct flight cannot exercise connections, layovers or door-to-door counting — that gap let 1.1.5 (69) reach TestFlight.
- Assert meaning, not presence: "a header exists" passed on 69 while every connecting trip showed its layover. Each state's screenshots are read for the right city, flag, photo and home base, not just a loaded screen.
- Restore the App Review account at the end so the retained-photo gate keeps its state.

Run `.maestro/release-matrix.yaml` once per state (`-e ACCOUNT_STATE=… -e TRIPS=with|without -e ACCOUNT_EMAIL=<escaped>`). Per state and over two cold starts it checks Flights (trip photo headers and a city page, or the empty journal), Travel stats and its Home base card, the Settings home base row and screen, Friends and World. Maestro cannot drive a physical iPhone: there the same states are walked with Argent on USB (sign-in typing, taps, screenshots) alongside the XCTest tab gate. Record each state per device in `release-state.md`.

## Large text (since 2026-09-29)

Text follows the phone's text size up to **1.5×** and stops there: `patches/react-native+0.86.3.patch` defaults `maxFontSizeMultiplier` to 1.5 on every `Text` and `TextInput` (`MaxFontScale` in `src/constants/theme.ts` mirrors it; `useTextScale()` gives layout code the capped value). `npm run release:preflight` fails if an upgrade drops the patch (`scripts/check-font-cap.test.mjs`).

`npm run test:large-text` screenshots every screen state in `scripts/large-text/screens.json` at default text size and above the cap (iOS AX3, Android `font_scale 2.0`) on an iOS simulator and an Android emulator at once, then writes `index.html` (pairs side by side) and `findings.csv` in `.maestro/out/large-text/<stamp>/`:

```
npm run test:large-text -- --ios <sim-udid> --android <serial> \
  --ios-app <Release FlyRight.app> --android-apk <app-release.apk> [--pass B,A,C] [--only F10,M05]
```

- Release builds pointed at DEV (no `.env.production.local`). The Android APK must be debuggable so `seed-demo-data.mjs` can use `run-as`: build it with `./gradlew -I <init script setting android.buildTypes.release.debuggable = true> app:assembleRelease`, never by editing `android/`.
- Passes: B = fresh install signed out (onboarding, empty, then seeded), A = signed in as the store-profile user Maja with Pro (runs `seed-store-profile.mjs` and `devTools:setPro` on DEV), C = travel day. Each state cold-starts the app and opens its deep link; Android needs the tab bar up before a link is sent or the router drops it.
- Use a dedicated simulator and emulator (the 2026-09-29 run made "FlyRight Large Text" / `FlyRight_LargeText`): pass B uninstalls the app and resets the simulator keychain.
- `--baseline` on a build without the cap captures default size only; `--compare-to <that run>` then flags any default-size drift. The run also checks the cap engages (F10, F20, F03 identical at three sizes above it).
- The iOS tab-bar long-press (Large Content Viewer) stays a manual check.

## Known blockers and lessons (1.1.5, builds 69–71, 2026-09-27)

Read before starting; each cost time or a store build once.

**Find bugs before building.** `npm run release:journal` (real production journal through the app's logic) and a production-config Release on the simulator signed in to real data come *before* the store builds. A bug found on a phone after upload costs a whole build cycle (~1 h per platform); 69 and 70 were both superseded that way.

**Before the builds**
- Free disk first: a local iOS build needs ~15 GB (`df -h /System/Volumes/Data`). Safe to clear: `npm cache clean --force`, `android/app/build`, `~/Library/Caches/Homebrew/downloads`, old IPAs/APKs in the scratchpad, leftover `$TMPDIR/eas-build-local-nodejs/*`.
- Gradle's heap comes from `plugins/with-gradle-memory.js` (4 GB); never hand-edit `android/gradle.properties`, prebuild overwrites it.
- Poll EAS builds with a deadline. An Android build sat IN_PROGRESS for over an hour; cancel a superseded build (`eas build:cancel <id>`) rather than wait. "Gradle build daemon disappeared unexpectedly" on an EAS Android build is a transient worker kill (1.1.4's first build, 61, 1.1.5's 72): retry, then re-sync `android.versionCode` in app.json to the number the retry took. The build log is Brotli-compressed JSON lines (`zlib.brotliDecompressSync`), linked from `eas build:view <id> --json` → `logFiles`. There is no `eas submission:view` — read the build's `processingState` from App Store Connect instead.

**Physical iPhone**
- Run only `testAllTabsAcrossTwoColdStarts` (`-only-testing`, see tests/physical-ios/README.md); the other tests in the scheme are demo captures that fail without their setup.
- "Developer App Certificate is not trusted" over Wi-Fi: retry over USB first. Argent refuses a Wi-Fi-only phone (`transport is localNetwork`) — it needs the cable.
- A TestFlight install of the candidate is a valid release binary for the gate (store-signed, production config) and is faster than an ad hoc build.

**Simulators and emulators**
- Sign-in typing: Argent's `keyboard` maps `+ _ @` through the host's Swedish layout on some simulators (typed `maja+x@y` came out ``maja`x"y``) and `paste`/`simctl pbcopy` can silently do nothing. Switch the simulator keyboard to English (US) and use the on-screen `@`, or sign in on a simulator that already has the account.
- Android emulator under heavy load (load average ~58) lost its system services ("Can't find service: package"). Restart it with Argent's `boot-device` — a hand-launched `emulator` without its gRPC flag cannot be driven by Argent afterwards.
- `adb input text` drops characters under load: type one character at a time and read the field back (`uiautomator dump`) before continuing. Clear a field with `KEYCODE_MOVE_END` then repeated `KEYCODE_DEL`; Ctrl+A did not select everything.
- Maestro and Argent cannot drive the same device at once: `stop-simulator-server` for that device before a Maestro run.
- Argent's simulator transport can die mid-session ("CoreDevice HID transport is dead"): `stop-simulator-server`, then retry the same call.

**Form sheets (iOS 26+)**
- react-native-screens wraps every formSheet's content in its own safe-area view on iOS 26+; a ScrollView under a flex wrapper collapses to zero height there and the sheet opens empty (1.1.5 (71)'s photo pickers). A sheet screen has no ScrollView or returns one as its root — `src/services/form-sheets.test.ts` enforces it, and the device matrix opens both photo sheets and asserts their options are visible. Any new sheet must be opened on an iOS 26+ device before release; "the screen loads" never covers what it presents.

**Store assets**
- Clear app data before signing a screenshot device in to the store profile (guest trips merge into the account), and reset any test edits on that profile afterwards (Maja's home base was left on London from testing).
- App Store Connect rejects a screenshot reorder that also removes one: delete the old screenshot, then PATCH the order.

**Production data lookups**
- `devTools:inspectItinerary` matches the profile's display name (the owner is "Shanavas", not "Shanavas Shaji"). Read-only; keep the output in a temp file, never commit it.

**Shell:** zsh does not word-split `$VAR` holding a command, expands a leading `=`, and choked on a regex `until` loop — use a function or `bash -c` for scripted loops. macOS has no `timeout`: put the deadline inside the loop (`end=$((SECONDS+5400)); while [ $SECONDS -lt $end ]; …`).

## Unlocking the phones for a run

Passcodes are supplied by the user per session (chat), used inline, and never written to the repo, memory files, logs or the macOS Keychain (the Keychain write was refused by the permission classifier on 2026-09-17). Clean `~/.maestro/tests/<date>/` after any flow that typed a code.

- **Pixel 9a (works, verified 2026-09-17):** `adb shell input keyevent KEYCODE_WAKEUP`, then `adb shell input swipe 540 1500 540 300 200` (a swipe that starts near the bottom edge is read as the home gesture and does nothing), then `adb shell input text <PIN>` and `adb shell input keyevent 66`. Confirm with `dumpsys window | grep mDreamingLockscreen` = false. Run `svc power stayon true` for the session and restore it to false afterwards. On 2026-09-18 `input text <PIN>` unlocked only once in four tries; one `input keyevent KEYCODE_<digit>` per digit followed by `KEYCODE_ENTER` worked every time. `svc power stayon true` only applies on charger power: on battery, raise `settings put system screen_off_timeout` for the run and restore the original value (30000).
- **iPhone 15 Pro (partial):** On iOS 26 the first XCTest run of a session shows a Face ID / passcode prompt on the phone to allow UI automation; if it is not approved the runner fails with "Authentication cancelled. UI canceled by system" (LocalAuthentication −4) — ask the user to watch the phone and approve it. The phone's Auto-Lock (5 min) ends a session mid-suite; ask for Auto-Lock = Never before starting. `xcodebuild test` cannot open a session on a locked phone ("Ensure the device is unlocked"), and once the phone sleeps its wireless CoreDevice tunnel drops. The session therefore has to START with the phone unlocked and on Wi-Fi; the practical setting for a test session is Auto-Lock = Never. For a lock that happens mid-run, the XCTest helper's `unlockIfNeeded()` (home, swipe the lock screen up, type the digits on Springboard's passcode pad) runs at the start of `testAllTabsAcrossTwoColdStarts` when `TEST_RUNNER_FLYRIGHT_PASSCODE=<code>` is set on the xcodebuild command; `testUnlockFromLockScreen` locks with the side button and proves the path. Tried on a locked, awake phone on 2026-09-17: the runner installs and starts, then iOS fails it with "The test runner failed to initialize for UI testing (Timed out while enabling automation mode)" — UI Automation cannot be enabled while the device is locked, so no test code runs. The helper therefore only helps when the phone locks after a session has begun; a run must still start unlocked.

## Physical devices and evidence

Discover actual hardware before deciding which tests to run:

```sh
xcrun devicectl list devices
~/Library/Android/sdk/platform-tools/adb devices -l
~/Library/Android/sdk/platform-tools/adb mdns services
```

Use Shanavas's paired iPhone 15 Pro when reachable: CoreDevice ID `3A998669-73E7-5A25-9A43-52F0CC4FC555`, hardware UDID `00008130-0008642C0204001C`. On 2026-09-14 it was reachable through CoreDevice even though `xctrace` initially said offline and `idevice_id` found no USB/network device. The CoreDevice app/lock queries established actual connectivity. Sandbox errors connecting to CoreDeviceService or starting adb are permission boundaries, not proof that no phone exists; use the permitted host execution path.

**Established wireless UI route:** keep the paired phone unlocked on the Mac's Wi-Fi with USB unplugged, query `device info lockState --device Shanavass-iPhone.coredevice.local`, and require `passcodeRequired: false`. Device details must report `transportType: localNetwork` and `tunnelState: connected` before calling a run wireless. The native five-tab XCTest suite passed this way on 2026-09-14 with **NordLayer still connected**. An earlier USB route timed out through the VPN interface; retrying wirelessly worked without a VPN pause. Save the actual connection state with the result.

[Maestro supports physical Android devices and iOS simulators](https://docs.maestro.dev/get-started/supported-platform). It does not currently provide physical iPhone UI automation. Do not report a simulator run as an iPhone hardware test. The local runner records device type explicitly.

Use **Apple's native XCTest** for the physical iPhone UI gate. This requirement exists because Maestro cannot drive a physical iPhone; it is not a rule against third-party tools. [Argent](https://argent.swmansion.com/) is set up in this repo and may be used on the iPhone for everyday checks and debugging. It needs a USB cable (the XCTest suite also runs wirelessly), and on hardware it offers taps, typing and screenshots only: no JS debugger, profilers, screen recording or permission control. It does not count toward the release gate until it has passed a full five-tab run on this iPhone; record that run here when it happens. The standalone suite and repeatable commands are in [tests/physical-ios](../tests/physical-ios/README.md). The helper builds separately and targets the installed FlyRight app. Keep these `devicectl` startup/crash checks as well:

1. Query `device info apps` and `device info lockState` with `--device <CoreDevice-ID>`. Require the intended FlyRight version/build and an unlocked phone. Preserve the existing installation and data.
2. Record `device info files --domain-type systemCrashLogs --filter 'Name CONTAINS "FlyRight"'` before launching.
3. Run `device process launch --terminate-existing --payload-url flyright://settings --device <CoreDevice-ID> com.shanavasshaji.flyright`, saving `--json-output <evidence-path>`. Wait at least 30 seconds, then query `device info processes --filter 'processIdentifier == <returned-PID>'` and require that exact launched process to remain alive. Repeat with `flyright://world`.
4. Read crash-log names again and fail on new FlyRight logs; allow time for reports to appear. Save the commands' JSON results and observation times. Process survival and no new crash log establish only the observed startup window: they do not prove sign-in, image rendering, successful navigation or all feature behavior.

Prefix each subcommand above with `xcrun devicectl`, use `--timeout 20`, and save evidence under `.maestro/out/`. A cached device listing or partial details response does not establish a working connection: require successful live queries.

5. Run the native XCTest tab suite on the **physical hardware UDID**. On each of two cold starts, tap **Flights (formerly My travels), World, Friends, Claims and Settings**, assert selected tabs and loaded content, check for visible errors, and save each screen. Claims is required even though the earlier Maestro core flow covers only the other four tabs.
6. Export XCTest attachments and inspect all five tab screenshots, including actual map rendering and retained trip content. Save the result bundle, images and before/after crash results. Record account state and the exact installed binary. A built/signed helper is not a passed UI run; connectivity, unlock, UI Automation or signing failures must be reported as blocked checks. Never claim screenshots or taps from a deep-link/process-only run.

The installed `idevicescreenshot` could not reach the phone through its CoreDevice wireless tunnel on 2026-09-14; XCTest provides its own capture API. Earlier scanner testing used an EAS ad hoc preview installed with `devicectl device install app`, followed by a launch and physical scanning; it was not a Maestro physical-iPhone flow. These tab checks do not exercise every action within each screen or replace the retained-photo candidate gate.

Validate camera scanning, Apple Wallet sharing, push delivery and Live Activities on the actual iPhone when affected, and record the observed result. A physical Android phone can run Maestro once connected through adb. Shanavas's **Pixel 9a** was connected on 2026-09-14 with `adb connect 192.168.0.55:36465`; the Mac was already paired. Wireless addresses/ports can change, so verify discovery or request the current connection address rather than treating this endpoint as permanent. `ro.product.device=tegu` identifies this handset; `emulator-5554` is a separate virtual Pixel.

For existing installations, `.maestro/release-core.yaml` runs two cold starts and Flights (formerly My travels), Settings, Friends and World. Pass `ACCOUNT_STATE=signed-in` plus an escaped `ACCOUNT_EMAIL` regex, or explicitly use `ACCOUNT_STATE=signed-out`. It preserves app data and permissions. Android navigation uses tab taps because the Pixel also had a legacy `com.sshanavas.flyright` installed, which claims the same `flyright://` scheme and raises a chooser when opening links. Do not remove the legacy installation or count that chooser as an app crash merely to make a test pass.

```sh
~/.maestro/bin/maestro --device <physical-adb-serial> test \
  --format JUNIT --output <evidence-directory>/results.xml \
  --debug-output <evidence-directory>/maestro \
  -e ACCOUNT_STATE=signed-out -e SHOTS=<absolute-evidence-directory> \
  .maestro/release-core.yaml
```

Check installed versions and production configuration separately, compare pre/post-update trip evidence and Android crash/exit records, and inspect screenshots. A signed-out core pass does not satisfy the signed-in/retained-photo candidate gate. If extending the screen timeout to keep physical-device tests visible, record and restore its original value afterwards. Missing hardware coverage must be recorded; it cannot be replaced by a green simulator report.

Each device run saves a dated `report.json`, JUnit results, screenshots and failure details under `.maestro/out/release/` (gitignored). Copy useful screenshots/recordings to `~/Downloads` with descriptive release/platform names when sharing verification evidence with the user. Record both platform results, native versions, commit, backend deployment, upgrade-versus-fresh-install coverage and physical-device checks in `docs/release-state.md` before promotion. Re-run after code, native config, backend or candidate changes; historical passing reports do not clear a new candidate.
