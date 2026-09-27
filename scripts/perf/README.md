# Cold-start profiling (Android)

EAS Observe shows Android startup at roughly 3× iOS for real users. These tools
measure a cold start on a physical phone with a **release** build, the only
kind whose numbers mean anything, and show where the time goes.

## What was found and fixed (2026-09-27, Pixel 9a, median of 10 cold starts)

| | before | after |
|---|---|---|
| bundle load | 123 ms | 28 ms |
| first render | 276 ms | 158 ms |
| Flights cold render | 131 ms | 75 ms |
| `am start` first frame | 607 ms | 414 ms |
| **time to interactive** | **408 ms** | **231 ms** |

1. **UIManager loaded at launch.** In bridgeless mode, loading react-native's
   `UIManager` module asks native for the constants of *every* registered view
   manager (Skia, WebGPU, screens, SVG, camera, …): 84 ms on the Pixel.
   Static view configs mean nothing at startup needs them, but seven
   react-native modules imported it eagerly (`NativeComponentRegistry`, which
   every View and Text load; `codegenNativeComponent`, whose import codegen
   leaves behind; `Pressability`, `TextNativeComponent`, `ScrollView`,
   `Touchable` and `legacySendAccessibilityEvent`). They now require it on
   first use: `patches/react-native+0.86.3.patch`. The RevenueCat paywall UI
   reached it from `services/purchases` too; see the next item.
2. **Every import ran at launch.** Expo's Metro import transform wraps each
   require in `_interopDefault(...)`, which inline requires cannot defer. On
   native, Babel now does the transform with `lazyImports` (babel.config.js),
   and Metro inlines CommonJS requires (metro.config.js). A module that must
   run at launch for its side effect needs an explicit call at module scope,
   as `defineFlightWatchTask()` in `src/app/_layout.tsx` does. typegpu stays
   on Metro's transform because Babel mis-prints its `* as '~unstable'` export.
3. **All five tabs rendered at launch.** NativeTabs renders every tab's
   content up front, so a cold start on Flights also built Updates, Friends,
   World (the Skia globe) and Claims. `src/components/lazy-tab.tsx` holds each
   of them back until its first focus.

## Tools

- `src/services/startup-probe.ts`: with `EXPO_PUBLIC_STARTUP_PROBE=1` at build
  time, prints Observe's own startup metrics for the launch to logcat
  (`[startup-probe] …` lines), plus any `probeMark('label')` timestamps you
  add on the startup path. In store builds it is a dead branch.
- `scripts/perf/module-timing-babel.js`: with `FLYRIGHT_MODULE_TIMING=1`, times
  each module's top-level code; the probe prints the slowest packages and
  modules. It adds overhead, so compare it only against other timing builds.
- `scripts/perf/cold-start.mjs`: force-stop → launch → read the probe, N times;
  prints each run and the medians and saves `results/<label>.json`.

## Recipe

The phone's store install keeps its data: build under a separate application
ID. Add this to `android/app/build.gradle`'s `release` block after prebuild
(the directory is generated):

```gradle
if (System.getenv('FLYRIGHT_APP_ID_SUFFIX')) applicationIdSuffix System.getenv('FLYRIGHT_APP_ID_SUFFIX')
```

```sh
# clear Metro's cache whenever babel/metro config or the env switches change
rm -rf node_modules/.cache; find $TMPDIR -maxdepth 1 -name 'metro-*' -exec rm -rf {} +
cd android && FLYRIGHT_APP_ID_SUFFIX=.perf EXPO_PUBLIC_STARTUP_PROBE=1 NODE_ENV=production \
  ./gradlew app:createBundleReleaseJsAndAssets --rerun app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=2g"
adb -s <serial> install -r app/build/outputs/apk/release/app-release.apk
# open it once and skip onboarding, then:
node scripts/perf/cold-start.mjs --serial <serial> --runs 10 --label <name>
```

`--rerun` on the bundle task matters: Gradle does not see env vars as inputs
and would reuse the previous bundle. The phone must stay unlocked; a locked
screen leaves the activity unresumed and the probe never prints.

To find what loads a module at startup, add a
`console.log(new Error().stack)` at its top in `node_modules`, rebuild, and
symbolicate the logcat stack:
`npx metro-symbolicate android/app/build/generated/sourcemaps/react/release/index.android.bundle.map < stack.txt`.
