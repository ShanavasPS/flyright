# Expo SDK 58 (beta) — upgrade study and state

Branch `expo-58-ios27`. Last verified 2026-09-20.

## Why

SDK 58 is the first Expo SDK **built for the iOS 27 SDK**. This machine has
Xcode 27.0 (27A266a) with simulator runtimes for iOS 26.0, 26.5, 27.0 and 27.1.
SDK 57 compiles against iOS 26 and cannot adopt iOS 27's UIScene life cycle.

## What ships in 58

| | SDK 57 | SDK 58 beta |
|---|---|---|
| expo | 57.0.18 | 58.0.0-preview.3 |
| react-native | 0.86.3 | 0.88.0-rc.0 |
| react | 19.2.3 | 19.2.3 (unchanged) |
| iOS deployment target | 16.2 | 17.0 |
| Gradle | — | 9.4.1, AGP 9 |

SDK 58 goes stable when React Native 0.88 ships; Expo said the beta runs three
to four weeks from 2026-09.

## The one thing that blocks shipping it

**EAS Build has no Xcode 27 image.** The newest is
`macos-tahoe-26.5-xcode-26.6`; Expo's changelog says Xcode 27 images are
"coming soon". Until one exists, a cloud production build compiles against the
iOS 26 SDK, so the store binary is *not* built for iOS 27 even on SDK 58 —
the scene-lifecycle files are generated, but the iOS 27 behaviours they unlock
(resizable iPhone apps, `isLiquidGlassAvailable`) are gated on the SDK the
binary was compiled with. Local `expo run:ios` builds do use Xcode 27.

Re-check `https://docs.expo.dev/build-reference/infrastructure/` before
planning a release off this branch.

## Second blocker: Clerk

`@clerk/expo` (4.6.8 and its canary of 2026-09-18) declares
`peerDependencies.expo: ">=54 <58"`. npm install needs `--legacy-peer-deps`,
and its Android module does not compile against SDK 58 without the patch in
`patches/@clerk+expo+4.6.1.patch`. The whole auth stack is Clerk, so this
branch should not go to the stores until Clerk widens the range — the patch
proves it builds, not that Clerk supports it.

## Version matrix deviations

`package.json` excludes two packages from `expo install --fix`:

```
"expo": { "install": { "exclude": ["react-native-reanimated", "react-native-worklets"] } }
```

preview.3's bundled map pins reanimated 4.6.0 + worklets 0.12.2, whose peer
range stops at react-native 0.87 — the SDK's own numbers will not install on
the SDK's own React Native. The working pair is **reanimated 4.7.0 + worklets
0.13.0** (peer `0.86 - 0.88`). Remove the exclusion once a later preview
catches up, and re-run `npx expo install --fix`.

`react-native-webgpu` is **not in Expo's bundled map at all**. 0.10.2 is the
latest and its peer range (`react-native >=0.81`) admits 0.88, but nobody has
vetted it. It backs the World share poster's heat layer — see
[share-poster-heat.md](share-poster-heat.md). **Untested on this branch**: the
poster needs logged flights and a share action, and the simulators used here
were empty or signed out. Test it before merging.

## Breaking changes this app actually hit

- **Strict TypeScript API.** Deep imports into `react-native/Libraries/*` are
  type errors and refs carry instance types. The `react-native-legacy-deep-imports`
  condition defers all of it but disappears after 0.88, so the app migrated:
  ~35 refs to `ViewInstance` / `TextInputInstance` / `ScrollViewInstance`, plus
  `src/types/styles.ts` because `ViewStyle` is no longer what a `<View>` takes
  and `ViewStyleProp` is no longer exported by name. `Pressable` still wants the
  old `ViewStyle` — hence `AnyViewStyleValue`.
- **`File.write()` is async.** It returns a promise, and nothing was awaiting
  it, so a missed call site is a silent write-after-read. Three real sites;
  `writeSync` is the old behaviour under its new name.
- **`InteractionManager` removed** → `requestIdleCallback` with a deadline.
- **`beforeRemove` removed.** Its successor `removed` fires after the component
  unmounts. `blur` is the usable replacement for a dismiss guard.
- **`useColorScheme` returns null**, not `'unspecified'`.
- **`web.output: "server"`** now renders every page per request. This app keeps
  SDK 57's behaviour with `"static"` + `apiRoutes: true` on the expo-router
  plugin. The five routes in `src/app/api/` still deploy as server routes.
- **R8 on by default** in release builds. See below.
- Not hit, but check if the app grows into them: expo-sqlite dropped libSQL,
  expo-notifications shows foreground notifications by default, expo-localization
  no longer force-enables RTL, `@expo/ui` `<Host>` top-aligns and the stacks take
  system default spacing.

## Third-party patches

| patch | why |
|---|---|
| `onesignal-expo-plugin+2.7.1` | requires `"expo/config-plugins.js"`; SDK 58's exports map (`"./*" → "./*.js"`) turns that into `config-plugins.js.js`. Every prebuild died on it. |
| `@clerk+expo+4.6.1` | Android module imports `androidx.savedstate.compose.LocalSavedStateRegistryOwner` without declaring the artifact. Transitive under 57, absent under 58. |
| `react-native-screens+4.27.0` | the hidden-tab-bar inset fix, re-based from 4.26.2. Applies unchanged — only the filename was stale. |

`tsconfig.json` also points `react-native-view-shot`'s types at its shipped
declarations: its exports map answers the `react-native` condition with raw
`src/index.tsx`, which has not migrated to the strict API. Metro still bundles
the source.

## New: plugins/with-android-gradle-memory.js

Prebuild writes `org.gradle.jvmargs=-Xmx2048m` and this app's release build runs
out of memory in R8 at that size. It used to be a manual edit re-applied after
every prebuild (`android/` is generated and gitignored), noted in
[release-state.md](release-state.md). The plugin sets `-Xmx8g
-XX:MaxMetaspaceSize=1g` instead. Debug builds do not run R8 and do not commit
the extra heap.

## Verification performed

- `npm run typecheck`, `npx eslint src/ plugins/`, `npx jest` (87 suites, 976
  tests), `npx expo-doctor` (20/20) — all clean.
- `npx expo prebuild --clean` on both platforms. `SceneDelegate.swift` and
  `UIApplicationSceneManifest` generated; `plugins/with-assistant-actions.js`
  still finds its AppDelegate anchor.
- iOS 27.0 (iPhone 18 Pro): built with Xcode 27, two cold starts, all five tabs
  via deep link, Skia globe with the day/night terminator, no error boundary.
- iOS 27.1 (iPhone Duo, foldable): installs, launches, onboarding renders.
- iOS 26.5 (iPhone 17 Pro): launches **with 21 pre-existing trips intact** —
  the SQLite journal survives the upgrade.
- Android emulator (FlyRight_Dev, API 36): `BUILD SUCCESSFUL`, all five tabs,
  Skia globe renders (no black canvas).

Not verified: physical devices, a release/minified build, the WebGPU share
poster, Clerk sign-in, Live Activities, and the web bundle.
