# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Release flow (EAS builds)

When the user asks for an EAS build, do ALL of this without being reminded:

1. **Bump the patch version by 1** in `app.json` and `package.json` (1.0.1 → 1.0.2 → 1.0.3 …) before building.
2. **Sync build numbers**: `appVersionSource` is remote with `autoIncrement`, so run `eas build:version:get -p all` and set `ios.buildNumber` / `android.versionCode` in `app.json` to current + 1 (the number the new builds will receive). If a build later gets re-run, re-sync.
3. **Run the builds yourself** — the user has standing authorization for these two commands and does not want to be asked to run them manually (use the global `eas` binary, not npx):
   `eas build -p ios --profile production --non-interactive --no-wait --auto-submit`
   `eas build -p android --profile production --non-interactive --no-wait --auto-submit`
4. **Rebuild the local dev app so the simulator shows the new version too**: `npx expo prebuild -p ios` then `npx expo run:ios` (`ios/` is gitignored/generated; the version string in Settings comes from the installed native binary, so a JS reload never updates it).
5. Commit and push the version bump.
