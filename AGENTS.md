# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Release flow (EAS builds)

**"Submit builds", "submit new builds", "run new builds", and equivalent release requests mean the full store release below, including physical-device checks**, through App Store review submission and a completed Play production rollout. The user has standing authorization for this workflow; carry it through without asking for confirmation between steps or handing commands back to the user. An explicit narrower request takes precedence.

Before starting, read [the release guide](docs/release-workflow.md) and [the release state](docs/release-state.md). They preserve the release instructions and supporting recipes previously saved only in Claude's private memory. Both Codex and Claude must use and maintain these shared references. Verify current EAS/store state; saved version numbers and review states are historical observations.

**Check physical hardware before choosing test targets.** Run `xcrun devicectl list devices`, `adb devices -l` and `adb mdns services` (use the SDK adb path if needed). Shanavas's paired iPhone 15 Pro is an established test device; use it when reachable. Maestro's lack of physical iPhone support does not prevent Xcode/devicectl from checking the installed version, cold-starting the app and reading crash logs. Run those checks as well as the simulator UI suite, and record their different coverage. See the physical-device recipe in `docs/release-checks.md`. Do not assume hardware is unavailable from a sandbox error or an empty simulator-only tool list.

When the user asks for a release, do ALL of this without being reminded:

1. **Bump the patch version by 1** in `app.json` and `package.json` (1.0.1 → 1.0.2 → 1.0.3 …) before building.
   **Add the release's notes** as the newest entry in `src/constants/release-notes.ts` (same version string, submission date, 3–6 traveller-facing bullets from the commits since the last bump). `/api/app-version` serves them to older installs as "what you're missing", so after the version bump is committed, **redeploy hosting** (`eas env:pull --environment production --path .env.production.local` → `npx expo export -p web --clear` → `eas deploy --prod --environment production`; verification and cleanup are in the release guide) — the notes live on the server, not in the binary. The store's live version is looked up from the public store listings, so nothing is announced before the stores actually serve it. Never open Play publisher edits to poll the live version; they can invalidate an in-flight upload.
2. **Deploy and verify the Convex backend BEFORE the builds** — run `npm run release:deploy-backend`, then `npm run release:preflight`. The deployment command runs `npx convex deploy -y` and `npx convex dev --once`, then checks both deployed function lists against the app's actual API references. Production deployment has standing authorization. A binary that calls an undeployed function crashes for signed-in users: 1.0.34's root-mounted `FollowerActivitySync` called `followerActivities:mine` before it existed on production. Both commands must exit successfully; generated types or a successful dev deployment do not prove production is ready. See [release checks](docs/release-checks.md).
3. **Sync build numbers**: `appVersionSource` is remote with `autoIncrement`, so run `eas build:version:get -p all` and set `ios.buildNumber` / `android.versionCode` in `app.json` to current + 1 (the number the new builds will receive). If a build later gets re-run, re-sync.
4. **Run the builds yourself** — the user has standing authorization for these two commands and does not want to be asked to run them manually (use the global `eas` binary, not npx):
   `eas build -p ios --profile production --non-interactive --no-wait --auto-submit`
   `eas build -p android --profile production --non-interactive --no-wait --auto-submit`

   **If the iOS build fails on credentials in non-interactive mode** (happens whenever a new native target/capability needs provisioning), do NOT ask the user — the repo's ASC API key authorizes everything. Run it through `expect` with Apple auth env vars:

   ```
   spawn env EXPO_ASC_API_KEY_PATH=./asc-api-key.p8 EXPO_ASC_KEY_ID=YAW66X6UQF \
     EXPO_ASC_ISSUER_ID=88692f44-a9b2-4f59-8b67-978e93a85dbf \
     EXPO_APPLE_TEAM_ID=7NNC4W2FUU EXPO_APPLE_TEAM_TYPE=INDIVIDUAL \
     eas build -p ios --profile production --no-wait --auto-submit
   # auto-answer: (Y/n) -> y, selection prompts -> enter
   ```

   If capability syncing fails with "invalid request document object", enable the capability yourself via the ASC API (POST /v1/bundleIdCapabilities, bundleId resource id 78P75R8NWZ for the app, DU338CG2VR for the share extension, same JWT recipe as the scratchpad scripts) and re-run with `EXPO_NO_CAPABILITY_SYNC=1`.

   **The one thing the ASC key cannot do: capability *identifiers*.** App Groups (`group.*`), iCloud containers and merchant IDs are absent from the public App Store Connect API — `/v1/appGroups` 404s, the `appGroups` relationship on a bundleId 404s, and `iris/v1/appGroups` 401s with a Bearer token — so eas prints "Skipping capability identifier syncing because the current Apple authentication session is not using Cookies" and the build then dies in Xcode with *"Provisioning profile … doesn't support the group.… App Group"*. Adding a target that needs a NEW app group therefore needs ONE interactive Apple login: run `eas build -p ios --profile production --no-wait --auto-submit` **without** the `EXPO_ASC_*` vars, answer yes to the Apple login, and type the 6-digit 2FA code (the password comes from the Keychain). eas then creates the group, links it to the bundle IDs and regenerates the profiles. The session caches to `~/.app-store/auth/<appleid>/cookie` and lasts roughly a month, so later builds are unattended again. Only the 2FA code needs a human — everything else stays automated.
5. **Rebuild the local dev apps on BOTH platforms so the simulator and emulator show the new version too**:
   - iOS: `npx expo prebuild -p ios` then `npx expo run:ios`
   - Android: `npx expo prebuild -p android` then `npx expo run:android` (boot an emulator first if none is running: `~/Library/Android/sdk/emulator/emulator -avd Pixel_9a`)

   The explicit `prebuild` step is load-bearing: `expo run:ios`/`run:android` silently REUSE an existing `ios/`/`android/` directory without re-running prebuild, so version numbers and app.json/plugin config changes never reach the installed app unless prebuild runs first. Both directories are gitignored/generated, and the version string in Settings comes from the installed native binary — a JS reload never updates it. After installing, verify the version on the device actually matches `app.json` before calling it done.
   **Run both native regression checks** with `npm run release:devices -- --ios <simulator-udid> --android <serial> --mode native`. This checks real photo-file reads/uploads after an app-container move and missing-file failures; it preserves existing trips and login state. The runner rejects stale native versions and produces per-platform evidence. Follow `docs/release-checks.md` for setup.
6. **Commit and push** the version bump — local git must end up in sync with the remote (`git push`, don't leave commits unpushed).
7. **Wait for both uploads to finish** in TestFlight and Play Console. Poll EAS build/submission status; `--no-wait` only schedules work and does not complete the release. Never open a Play edit (including screenshot uploads or promotion) while an EAS Android submission is uploading.
8. **Prepare store notes and screenshots**: update App Store What's New and PATCH the existing `appStoreReviewDetail` with the release's reviewer notes. Keep Play release notes within 500 characters. When the UI shown in the listing changed, reshoot from the new release builds and upload current screenshots to both stores before submitting; use the release guide's capture/upload recipes.
9. **Gate store promotion on candidate checks, then finish the release**: run the physical-device workflow below on the new candidate on Shanavas's Pixel 9a and iPhone 15 Pro, as well as the signed-in, retained-data candidate checks on both platforms per `docs/release-checks.md`. They must use release binaries with production configuration and the expected native versions, retain the dedicated test account's trips/photos across installs, and pass two cold starts and the core screens. An older installed version or a development/anonymous/fresh-install smoke alone does not satisfy this gate. If a required phone cannot be reached, continue independent release preparation and report the missing check; do not silently substitute an emulator or mark that device passed. Do not submit for App Review or promote Play production while checks are failing or required coverage is missing. After passing, create or reuse the matching App Store version, attach the processed build, and submit its `reviewSubmission` for review with automatic release after approval. Android EAS auto-submit targets `internal` in `eas.json`; promote the new versionCode to `production` with a completed rollout. Verify iOS has reached `WAITING_FOR_REVIEW` (or a later successful state) and Play has accepted the production rollout; report any store review/propagation delay accurately.
10. **Record and push the final result**: update `docs/release-state.md` with the release/version/build IDs, review/rollout states, hosting verification, screenshot decision, and installed dev-app versions. Commit and push any remaining review notes, screenshots, build-number corrections, and release-state changes. Do not finish with only TestFlight or Play internal uploads.

# "Test on physical devices"

**"Test on physical devices" means execute the physical-phone verification workflow now on BOTH the Pixel 9a and iPhone 15 Pro**, using [release-checks.md](docs/release-checks.md). This is a standalone testing command and is also part of every release request above. Both Codex and Claude must recognize it; no additional reminder to include the phones is needed.

- Discover and reconnect the known phones first. Use existing pairing; ask only for missing connection details, an unlock or a pairing code when actually needed. The Android wireless port can change. Do not interpret a sandbox/service-access error as missing hardware.
- Check installed version/build and the intended target. For a standalone check, test the installed build and apply an already available matching Play/TestFlight update when needed, preserving data. Report exactly which binary was tested. The command alone does not authorize a version bump, new cloud build, backend deployment or store publication; the full release command covers those actions separately.
- **Physical Android:** run the appropriate signed-in or signed-out branch of `.maestro/release-core.yaml` for two cold starts and My travels, Settings, People and World. Verify release configuration, compare retained-trip evidence after an update, inspect screenshots and check new crash/ANR/exit records. Target the current app package; the Pixel also has a legacy FlyRight installation.
- **Physical iPhone:** use Apple's tools; the user does not want Appium or other third-party iPhone automation tools. Use `devicectl` for version/lock checks, before/after FlyRight crash logs, and two cold starts; verify each exact launched process remains alive for at least 30 seconds. Run the native XCTest suite in [tests/physical-ios](tests/physical-ios/README.md) to tap **all five tabs: My travels, World, People, Claims and Settings**, check loaded content and capture screenshots across two cold starts. Inspect every tab's screenshots. It targets the installed app and preserves its data. **This suite passed wirelessly on the physical iPhone on 2026-09-14 with NordLayer still connected.** If USB hits a tunnel error, retry with USB unplugged and the paired phone unlocked on the same Wi-Fi; `Shanavass-iPhone.coredevice.local` must return a live lock check with `passcodeRequired: false` and device details must show `localNetwork` / `connected`. Do not assume the VPN must be disabled. If connectivity, unlocking, UI Automation or signing prevents execution, record the tab check as blocked; a helper build or deep-link process check is not a UI pass. See `docs/release-state.md` for the latest actually verified coverage.
- Run `npm run release:backend` as the read-only production inventory check. Preserve existing accounts, trips, photos and permissions, and restore temporary device settings. Report signed-in and retained-photo coverage separately; a signed-out or process-survival pass cannot clear those checks.
- Save dated results and evidence, copy useful screenshots to Downloads, and update `docs/release-state.md`. If one phone is unavailable, finish the checks possible on the other and identify what is needed to complete the missing platform. Never label simulator results as physical-device results.

# Flight paths (FlightAware AeroAPI)

The trip map draws the flight's real track / filed route when
`FLIGHTAWARE_API_KEY` is set on Convex + Hosting; otherwise the great circle,
captioned "Overview". Read [docs/flight-paths.md](docs/flight-paths.md) before
touching it — the AeroAPI licence caps raw storage at 30 days, forbids use
alongside another real-time provider without written permission, and forbids
use for EU261 claims. Cost is per result set of 15 records; the monthly cap is
`FLIGHTAWARE_MONTHLY_CENTS`.

# World tab globe

The World tab and the trip page's inset draw their own globe with
react-native-skia (`src/components/globe-view.tsx`, maths in
`src/services/globe.ts`, textures from `scripts/generate-globe-texture.mjs`).
react-native-maps and the Android Google Maps key are gone; the EAS
`GOOGLE_MAPS_ANDROID_API_KEY` variable and the GCP key are unused and can be
deleted. Skia is a native dependency: rebuild the dev clients after pulling
a change to it.

The globe is lit by the real sun by default (`src/services/sun.ts`, the
subsolar point; the shader mixes it with the old studio light by the
`daylight` uniform). The World tab header's sun button switches it and the
choice is remembered (`src/services/globe-daylight.ts`); the trip inset places
the sun at take-off / landing / now and says so in its caption. Planes are
drawn only on upcoming routes and a flight in the air (`pastPlanes` restores
them for the trip inset). The flight whose travel day is on the home screen
(`useHeroTrip`) gets radar rings on its origin (`beacon` prop).

<!-- stripe-projects-cli managed:agents-md:start -->
# The website (getflyright.com)

The web root is a real front page (`src/screens/landing.web.tsx`, wrapped in
`SiteChrome`), light by default with a theme toggle in the header, Inter and
Open Graph metadata from `src/app/+html.tsx`. Read
[docs/website.md](docs/website.md) before changing any web-only screen; it
holds the page map, the screenshot recipe, the react-native-web layout gotchas
and the verification/deploy steps.

# Share poster heat layer (TypeGPU)

The World share poster draws a GPU route-density glow under its atlas via
`react-native-webgpu` + `typegpu` (`src/services/route-heat.ts`; shader
functions are `'use gpu'` TypeScript compiled by `unplugin-typegpu/babel`).
Read [docs/share-poster-heat.md](docs/share-poster-heat.md) before touching
it. This is the app's only WebGPU use — the globe stays on Skia. Both are
native dependencies; react-native-webgpu needs Android minSdk 26 (set through
expo-build-properties in app.json). Rebuild the dev clients after pulling.

## Stripe Projects CLI

This repository is initialized for the Stripe project "flyRight".

## Tools used

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with the `projects` plugin to manage third-party services, credentials, and deployments for this project. Use the stripe-projects-cli to manage deploying and access to third party services.
<!-- stripe-projects-cli managed:agents-md:end -->
