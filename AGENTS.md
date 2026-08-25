# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Release flow (EAS builds)

When the user asks for an EAS build, do ALL of this without being reminded:

1. **Bump the patch version by 1** in `app.json` and `package.json` (1.0.1 → 1.0.2 → 1.0.3 …) before building.
2. **Sync build numbers**: `appVersionSource` is remote with `autoIncrement`, so run `eas build:version:get -p all` and set `ios.buildNumber` / `android.versionCode` in `app.json` to current + 1 (the number the new builds will receive). If a build later gets re-run, re-sync.
3. **Run the builds yourself** — the user has standing authorization for these two commands and does not want to be asked to run them manually (use the global `eas` binary, not npx):
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

   If capability syncing fails with "invalid request document object", enable the capability yourself via the ASC API (POST /v1/bundleIdCapabilities, bundleId resource id 78P75R8NWZ, same JWT recipe as the scratchpad scripts) and re-run with `EXPO_NO_CAPABILITY_SYNC=1`.
4. **Rebuild the local dev apps on BOTH platforms so the simulator and emulator show the new version too**:
   - iOS: `npx expo prebuild -p ios` then `npx expo run:ios`
   - Android: `npx expo prebuild -p android` then `npx expo run:android` (boot an emulator first if none is running: `~/Library/Android/sdk/emulator/emulator -avd Pixel_9a`)

   The explicit `prebuild` step is load-bearing: `expo run:ios`/`run:android` silently REUSE an existing `ios/`/`android/` directory without re-running prebuild, so version numbers and app.json/plugin config changes never reach the installed app unless prebuild runs first. Both directories are gitignored/generated, and the version string in Settings comes from the installed native binary — a JS reload never updates it. After installing, verify the version on the device actually matches `app.json` before calling it done.
5. **Commit and push** the version bump — local git must end up in sync with the remote (`git push`, don't leave commits unpushed).

<!-- stripe-projects-cli managed:agents-md:start -->
## Stripe Projects CLI

This repository is initialized for the Stripe project "flyRight".

## Tools used

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with the `projects` plugin to manage third-party services, credentials, and deployments for this project. Use the stripe-projects-cli to manage deploying and access to third party services.
<!-- stripe-projects-cli managed:agents-md:end -->
