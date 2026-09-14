# Required release checks

These checks target the 1.0.33 photo-upload crash and the undeployed `followerActivities:mine` query found during the 1.0.34 release. They run at different stages because a clean dev launch cannot establish that an existing signed-in install works after an update. They reduce release risk; they do not prove every feature on every device works.

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

As of 2026-09-14, this candidate flow has been authored but has not passed an end-to-end candidate run. The available simulator uses a development test account and has no retained trip/photo fixture. Set up the dedicated production test account and fixture before the first candidate run; the passing native regression report does not clear this gate.

The Maestro flow cold-starts twice, waits for the expected signed-in account, loads People data from the backend, opens the retained journey/photo, and checks the World screen. It never uses `clearState` or `clearKeychain`. Set up/log into the dedicated account before this gate; do not point it at a personal account. Check screenshots to confirm the retained photo renders correctly. Restore local dev binaries after any release-build testing.

Use the existing `.maestro/` feature flows for changed areas: Wallet/PDF/photo intake, live activities, invites, journal editing, support and purchases. Document fixture setup and any required device interaction. A base smoke pass does not replace testing the feature changed in that release. Do not send support messages, invite real people or make purchases merely to satisfy a smoke test.

## Physical devices and evidence

[Maestro supports physical Android devices and iOS simulators](https://docs.maestro.dev/get-started/supported-platform). It does not currently provide physical iPhone UI automation. Do not report a simulator run as an iPhone hardware test. The local runner records device type explicitly.

Physical iPhone automation needs a separately configured XCTest/Appium runner with valid development signing. Until that is configured, validate camera scanning, Apple Wallet sharing, push delivery and Live Activities on the actual iPhone and record the observed result. A physical Android phone can run the same Maestro flows once connected through adb. Missing hardware coverage must be recorded; it cannot be replaced by a green simulator report.

Each device run saves a dated `report.json`, JUnit results, screenshots and failure details under `.maestro/out/release/` (gitignored). Copy useful screenshots/recordings to `~/Downloads` with descriptive release/platform names when sharing verification evidence with the user. Record both platform results, native versions, commit, backend deployment, upgrade-versus-fresh-install coverage and physical-device checks in `docs/release-state.md` before promotion. Re-run after code, native config, backend or candidate changes; historical passing reports do not clear a new candidate.
