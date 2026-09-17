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
```

`release:deploy-backend` deploys production and development, then reads both deployed function inventories. `release:preflight` runs TypeScript, the backend-check regression tests, the full Jest suite (including photo paths, photo sync, migrations/row loading, Wallet and imports), and a fresh production inventory check. Every command must exit zero.

`release:backend` is the standalone read-only production check. It discovers API references from the actual app source, including platform-specific components, and compares them with Convex's deployed public functions. It fails on missing functions, the wrong deployment URL, authentication/network errors, and unresolved dynamic references. Its regression test removes the exact startup query that failed in 1.0.34. See [Convex function-spec](https://docs.convex.dev/cli/reference/function-spec).

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

## Unlocking the phones for a run

Passcodes are supplied by the user per session (chat), used inline, and never written to the repo, memory files, logs or the macOS Keychain (the Keychain write was refused by the permission classifier on 2026-09-17). Clean `~/.maestro/tests/<date>/` after any flow that typed a code.

- **Pixel 9a (works, verified 2026-09-17):** `adb shell input keyevent KEYCODE_WAKEUP`, then `adb shell input swipe 540 1500 540 300 200` (a swipe that starts near the bottom edge is read as the home gesture and does nothing), then `adb shell input text <PIN>` and `adb shell input keyevent 66`. Confirm with `dumpsys window | grep mDreamingLockscreen` = false. Run `svc power stayon true` for the session and restore it to false afterwards.
- **iPhone 15 Pro (partial):** `xcodebuild test` cannot open a session on a locked phone ("Ensure the device is unlocked"), and once the phone sleeps its wireless CoreDevice tunnel drops. The session therefore has to START with the phone unlocked and on Wi-Fi; the practical setting for a test session is Auto-Lock = Never. For a lock that happens mid-run, the XCTest helper's `unlockIfNeeded()` (home, swipe the lock screen up, type the digits on Springboard's passcode pad) runs at the start of `testAllTabsAcrossTwoColdStarts` when `TEST_RUNNER_FLYRIGHT_PASSCODE=<code>` is set on the xcodebuild command; `testUnlockFromLockScreen` locks with the side button and proves the path. Neither has completed on the phone yet — the first attempt failed at session start because the phone had already locked.

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

Use **Apple's native XCTest** for physical iPhone UI checks; the user does not want Appium or other third-party iPhone automation tools. The standalone suite and repeatable commands are in [tests/physical-ios](../tests/physical-ios/README.md). The helper builds separately and targets the installed FlyRight app. Keep these `devicectl` startup/crash checks as well:

1. Query `device info apps` and `device info lockState` with `--device <CoreDevice-ID>`. Require the intended FlyRight version/build and an unlocked phone. Preserve the existing installation and data.
2. Record `device info files --domain-type systemCrashLogs --filter 'Name CONTAINS "FlyRight"'` before launching.
3. Run `device process launch --terminate-existing --payload-url flyright://settings --device <CoreDevice-ID> com.shanavasshaji.flyright`, saving `--json-output <evidence-path>`. Wait at least 30 seconds, then query `device info processes --filter 'processIdentifier == <returned-PID>'` and require that exact launched process to remain alive. Repeat with `flyright://world`.
4. Read crash-log names again and fail on new FlyRight logs; allow time for reports to appear. Save the commands' JSON results and observation times. Process survival and no new crash log establish only the observed startup window: they do not prove sign-in, image rendering, successful navigation or all feature behavior.

Prefix each subcommand above with `xcrun devicectl`, use `--timeout 20`, and save evidence under `.maestro/out/`. A cached device listing or partial details response does not establish a working connection: require successful live queries.

5. Run the native XCTest tab suite on the **physical hardware UDID**. On each of two cold starts, tap **My travels, World, People, Claims and Settings**, assert selected tabs and loaded content, check for visible errors, and save each screen. Claims is required even though the earlier Maestro core flow covers only the other four tabs.
6. Export XCTest attachments and inspect all five tab screenshots, including actual map rendering and retained trip content. Save the result bundle, images and before/after crash results. Record account state and the exact installed binary. A built/signed helper is not a passed UI run; connectivity, unlock, UI Automation or signing failures must be reported as blocked checks. Never claim screenshots or taps from a deep-link/process-only run.

The installed `idevicescreenshot` could not reach the phone through its CoreDevice wireless tunnel on 2026-09-14; XCTest provides its own capture API. Earlier scanner testing used an EAS ad hoc preview installed with `devicectl device install app`, followed by a launch and physical scanning; it was not a Maestro physical-iPhone flow. These tab checks do not exercise every action within each screen or replace the retained-photo candidate gate.

Validate camera scanning, Apple Wallet sharing, push delivery and Live Activities on the actual iPhone when affected, and record the observed result. A physical Android phone can run Maestro once connected through adb. Shanavas's **Pixel 9a** was connected on 2026-09-14 with `adb connect 192.168.0.55:36465`; the Mac was already paired. Wireless addresses/ports can change, so verify discovery or request the current connection address rather than treating this endpoint as permanent. `ro.product.device=tegu` identifies this handset; `emulator-5554` is a separate virtual Pixel.

For existing installations, `.maestro/release-core.yaml` runs two cold starts and My travels, Settings, People and World. Pass `ACCOUNT_STATE=signed-in` plus an escaped `ACCOUNT_EMAIL` regex, or explicitly use `ACCOUNT_STATE=signed-out`. It preserves app data and permissions. Android navigation uses tab taps because the Pixel also had a legacy `com.sshanavas.flyright` installed, which claims the same `flyright://` scheme and raises a chooser when opening links. Do not remove the legacy installation or count that chooser as an app crash merely to make a test pass.

```sh
~/.maestro/bin/maestro --device <physical-adb-serial> test \
  --format JUNIT --output <evidence-directory>/results.xml \
  --debug-output <evidence-directory>/maestro \
  -e ACCOUNT_STATE=signed-out -e SHOTS=<absolute-evidence-directory> \
  .maestro/release-core.yaml
```

Check installed versions and production configuration separately, compare pre/post-update trip evidence and Android crash/exit records, and inspect screenshots. A signed-out core pass does not satisfy the signed-in/retained-photo candidate gate. If extending the screen timeout to keep physical-device tests visible, record and restore its original value afterwards. Missing hardware coverage must be recorded; it cannot be replaced by a green simulator report.

Each device run saves a dated `report.json`, JUnit results, screenshots and failure details under `.maestro/out/release/` (gitignored). Copy useful screenshots/recordings to `~/Downloads` with descriptive release/platform names when sharing verification evidence with the user. Record both platform results, native versions, commit, backend deployment, upgrade-versus-fresh-install coverage and physical-device checks in `docs/release-state.md` before promotion. Re-run after code, native config, backend or candidate changes; historical passing reports do not clear a new candidate.
