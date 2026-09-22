# iPhone Duo: feasibility study and plan

Written 2026-09-21. This is a study only; no code has changed. The device
ships 2026-10-23 with iOS 27.1, so until then everything was checked in the
Xcode 27.1 runtime's **iPhone Duo simulator** on this Mac. Anything the
simulator cannot show is marked *needs the device*.

## 1. The device, as the SDK describes it

Sources: the Newsroom release and spec page, the HIG page
"Designing for iPhone Duo", the technology overview "Preparing your app for
iPhone Duo" and the six Duo Tech Talks (111461–111466) at
developer.apple.com/iphone-duo. The geometry comes from the simulator's own
profile, in
`/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone Duo.simdevicetype`.

| | Outer (cover) display | Inner display |
|---|---|---|
| Pixels | 1398 × 2034 @3x | 2007 × 2853 @3x (downscaled to a 1878 × 2670 panel) |
| **Points** | **466 × 678** (portrait) | **669 × 951**; the natural "open book" pose is landscape, 951 × 669 |
| Size class | compact width (portrait and landscape) | **regular × regular**, like an iPad |
| Corners | 8 pt on the hinge side, 59 pt on the outer side | 55 pt |
| Camera | corner punch-hole, always visible | under the display, visible only while the camera is on |

Other device facts:

- The idiom is `phone`. The Duo is not an iPad.
- It uses Touch ID, not Face ID.
- There is no Stage Manager. The inner display does support 50/50 Split View and multiple windows.

**What is new about the Duo:**

1. **Vertical bars.** The Dynamic Island, the status bar, navigation bars, toolbars and the tab bar sit in a strip down one side:
   - This happens on the outer display and on the inner display in landscape. Only the inner display in portrait keeps horizontal bars.
   - Only bars owned by native containers qualify: `UINavigationController` and `UITabBarController` items.
   - **Custom views and text-only items stay horizontal.**
2. **Reserved regions.** The fold is a "division" region, active only while the device is partly folded. The cameras are "occlusion" regions.
   - UIKit API: `UIView.reservedRegions(kind:options:)`. SwiftUI API: `GeometryProxy.reservedRegions`.
   - The hinge is reported by `UIHingeInteraction` (UIKit) and `.onHingeChange` (SwiftUI). There is no posture trait.
3. **Folding or unfolding resizes the same app.** It does not relaunch or reconnect. Apple's rules:
   - "Don't reinvent your app when it resizes."
   - "Avoid extreme layout changes as people fold the device."
   - "Keep functionality and the state of elements the same between displays."
   - "show an additional level of hierarchy on the larger inner display" (Mail: list only when closed, list and message side by side when open).
4. **Safe areas are asymmetric.** The bar strip is on one edge. It does not mirror for right-to-left languages, and in Split View it moves to each app's outer edge.
5. **The inner display ignores the iPhone orientation lock.** Apple: "The inner display doesn't honor your supported interface orientations… Use size classes instead."

### How much of the Duo an app uses depends on the SDK it was built with

| Built with | Outer display | Inner display | Vertical bars |
|---|---|---|---|
| iOS 26 SDK (**EAS cloud today**) | Stays left of the status/camera strip | Letterboxed to "a familiar size and aspect ratio" | no |
| iOS 27.0 SDK (**our local builds today, e.g. 1.1.0 (60)**) | Stays left of the strip | Extends left of the status bar area | no |
| **iOS 27.1 SDK** (Xcode 27.1 beta) | Full screen | Full screen | **yes** |

Measured today: I installed the 1.1.0 (60) dev client (iOS 27.0 SDK) on the Duo simulator.

- **Outer display:** the app runs in a column about **379 pt wide**. The ~87 pt strip on the right holds the clock and Wi-Fi.
- The layout is intact: no clipping, and the tab bar fits all five tabs.
- It looks like a normal iPhone app with an unused black side strip. Capture: `~/Downloads/iphone-duo-study-2026-09-21/cover-today-sdk27.0.png`.

**Conclusion: nothing breaks today, so the Duo is not a launch-day emergency.** Looking *really good* on it needs a 27.1-SDK build plus the work below.

### Simulator check on a 27.1-SDK build (2026-09-21)

Xcode 27.1 beta (27A9269) is already at `~/Downloads/Xcode.app`, next to the release Xcode 27.0 in /Applications. I built the 1.1.1 (61) dev client with it (`DTSDKName iphonesimulator27.1`) **with no source changes**. It runs on the Duo simulator.

**On the outer display:**
- **The `NativeTabs` bar goes vertical automatically.** It moves into the right strip as icons only, under the clock. This worked on SDK 57, with no code changes.
- **Native stack Back buttons move into the strip.** Seen on Settings: the Back chevron sits under the clock, and the "Profile" title stays horizontal at the top.
- **Updates, Friends and Claims:** content respects the new right safe area and nothing is clipped. The tab-root JS headers (avatar, messages, +, the large titles) stay at the top, as predicted in §3.2. With the status bar gone from the top, the titles now sit close to the top edge.
- **Bug: World.** The empty-state card ("Your world map awaits" + Add flight) runs **under the vertical tab bar**, and the button is hidden. This is the §3.3 asymmetric-inset overlap. The globe itself runs full-bleed under the strip, which is acceptable as a background.

**Also found:**
- **Maestro 2.6.1 works on the Duo simulator.** Both `tapOn: "Open"` and point taps into the side tab bar work, despite the community reports.
- Deep links raise the "Open in FlyRight?" prompt, which a flow must dismiss.
- The inner display was not captured: unfolding needs Device Hub's buttons.

Screenshots: `~/Downloads/iphone-duo-study-2026-09-21/cover-sdk27.1-*.png`.

**Build recipe.** Three blockers, none in our source:

1. **Precompiled Expo modules.** SDK 57's precompiled `ExpoModulesCore.xcframework` was built with Swift 6.3.1, and the 27.1 SDK refuses its interface ("this SDK is not supported by the compiler"). → `EXPO_USE_PRECOMPILED_MODULES=0 pod install` (with `DEVELOPER_DIR` set to Xcode 27.1).
2. **The `ExpoModulesJSI` slice cache (expo#50365).** Deleting `.build-hash` is *not* enough. The package's own `apple/.DerivedData` hands back the 27.0 build. → `rm -rf node_modules/expo-modules-jsi/apple/.DerivedData`, then run `PODS_ROOT=$PWD/ios/Pods PLATFORM_NAME=iphonesimulator DEVELOPER_DIR=… node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh`. Check the result: `strings …swiftmodule | grep iphonesimulator27.1`.
3. **ZXing in source mode.** Our `flyright-document-import` relies on expo-camera's precompiled bundle for ZXing. In source mode the ZXingObjC umbrella header needs the subspec defines, and the DataMatrix writer isn't installed.
   - Temporary fix, generated files only:
     - add `pod 'ZXingObjC/DataMatrix'` to `ios/Podfile` under `use_expo_modules!`;
     - build with `'OTHER_SWIFT_FLAGS=$(inherited) -Xcc -DZXINGOBJC_USE_SUBSPECS -Xcc -DZXINGOBJC_PDF417 -Xcc -DZXINGOBJC_ONED -Xcc -DZXINGOBJC_DATAMATRIX'`.
   - Permanent fix, when implementing: have our podspec depend on `ZXingObjC/DataMatrix` and set those defines. This latent issue breaks *any* source-mode build, not just the Duo.

Then run:

```
DEVELOPER_DIR=~/Downloads/Xcode.app/Contents/Developer xcodebuild -workspace ios/FlyRight.xcworkspace \
  -scheme FlyRight -configuration Debug -sdk iphonesimulator27.1 \
  -destination 'id=<duo udid>' -derivedDataPath <scratch>/dd-duo '<the OTHER_SWIFT_FLAGS above>' build
```

- A clean build needs **about 7 GB free**. The disk filled up once during this check.
- **Afterwards, restore the normal setup**, or regular 27.0 builds break:
  - put back the generated `ios/Podfile`;
  - run a plain `pod install` (precompiled mode; `Podfile.lock` returns identical);
  - restore the 27.0 `ExpoModulesJSI.xcframework` (back it up before step 2).
- This was done on 2026-09-21. The Duo simulator keeps the installed 27.1 app, and a copy of it is in the session scratchpad.
- SDK 58 claims to fix steps 1–2 properly.

## 2. What we already have (from the Android foldable pass)

Most of the work carries over. The Android fold work (41578e3, 71e2649) built the same concepts Apple now asks for:

| Already built | Where | Duo relevance |
|---|---|---|
| Book-posture **two-pane**: flights list plus embedded `JourneyDetail` with a hairline divider | `src/screens/journeys/index.tsx:221-232, 370-381`; `journey-detail.tsx:115` `embedded` | This is exactly Apple's Mail pattern. It turns on at ≥ 840 pt, which **Duo landscape (951) meets and Duo portrait (669) does not**. |
| **Tabletop** glance hero above a horizontal hinge | `journeys/index.tsx:204-213`; `HomeHero variant="glance"` | Maps to the Duo held with the hinge horizontal (inner portrait, "laptop" pose) |
| Fold state as a JS hook: `useFoldState()`, `useIsTabletop()` | `modules/flyright-fold` (**Android only**; iOS gets `NO_FOLD`) | Needs an iOS backend: hinge interaction plus the division region |
| `MaxContentWidth = 800` centred column on about 40 screens | `src/constants/theme.ts:88` | Stops lines from stretching across the inner display |
| Layout measured with `onLayout` / `useWindowDimensions`, **no module-scope `Dimensions.get`** | globe, route map, boarding pass, onboarding | Resizing on fold already reflows |
| Native tab bar (`NativeTabs` → `UITabBarController`) | `src/app/(tabs)/_layout.tsx` | Should move to the side strip for free on a 27.1 build |
| Scene lifecycle (`ios.enableSceneSupport`) | `app.json` | Mandatory for 27.x SDK builds; already done. RN 0.88-rc apps without it crash on launch on the Duo (react-native#58606). |
| `useWindowSizeClass()` (compact/wide at 600) | `src/hooks/use-window-size-class.ts` | Written but **never used**. It is the natural hook for Apple's size-class rule. |

## 3. Gaps, by area

### 3.1 Build toolchain (blocker for everything else)
- **We need Xcode 27.1 beta installed next to Xcode 27.0.** This Mac has 27.0 (27A266a) only. The 27.1 runtime is installed, but not the 27.1 SDK.
- Use `DEVELOPER_DIR=…/Xcode-beta.app/Contents/Developer` for Duo builds only. The store release path stays on 27.0 until Apple accepts 27.1-SDK uploads (not yet announced; likely around the 27.1 release).
- **Known trap (expo#50365):** after switching Xcodes, the `ExpoModulesJSI` prebuilt xcframework cache reuses the 27.0 slice and fails with `cannot find type '__ObjC::expo'`. Clear Pods and the prebuilt slice when switching.
- EAS has no Xcode 27 image. The existing rule (iOS builds locally) already covers this.

### 3.2 Vertical bars: the biggest visual change
- **Tab bar:** native, so it should move to the side automatically. Needs checking: react-native-screens 4.26 tabs under the 27.1 SDK, including the badge on Friends and the hidden-tabs state on immersive routes (`IMMERSIVE`).
- **Tab-root headers are drawn in JS** (`headerShown: false` on Flights, Updates, Friends and World). The avatar, messages and + buttons sit in a React row at the top of the content.
  - On the Duo these stay at the top while the tab bar and status strip move to the side. The app will still work, but it is **the main thing that will look "not native" on the Duo**.
  - Options:
    - (a) **Keep the JS header.** It is correct and easy, just not Duo-idiomatic.
    - (b) Move the + and messages actions into native toolbar items on a native header, with **both a title and a symbol** each. Apple requires both.
  - **Recommendation:** (b) for Flights only, where + (add flight) is the primary action. Keep the greeting as content.
- **Pushed screens** (journey detail, person, messages, trip update and others) use native headers but put **custom React views** in `headerRight`. Per Apple, custom views stay horizontal.
  - They would need item-based header buttons (expo-router `Stack.Toolbar` / header items, if SDK 57 exposes them; otherwise a small native config) with visibility priorities.
  - About 8 screens (see `grep headerRight src`).
- **Modal/sheet screens** with `headerShown: false` (the claim wizard, paywall, sign-in) draw their own Close buttons. The outer display lays sheets out with vertical bars, but ours have no native bar, so they keep their JS close buttons. Acceptable.

### 3.3 Asymmetric safe areas (real regression risk on a 27.1 build)
- Today's 27.0 build hides the problem: the *window* shrinks, so nothing overlaps the strip.
- On a 27.1 build the strip becomes a **left or right safe-area inset**. The code reads `insets.left/right` in only **one** file (onboarding). Fourteen `SafeAreaView`s include left and right edges from the landscape pass. Everything else assumes zero side insets.
- Likely to overlap the strip:
  - Absolutely positioned overlays: World header, stats card and recentre control (`world.tsx:43-45`), floating buttons, the following rail, the live-card running border.
  - Full-bleed media: photo viewer, update viewer, boarding pass.
- Fix pattern: pad per edge from `useSafeAreaInsets()`, never `width - 2*left`. Test with the strip on **both** sides (Split View puts it on the outer edge).

### 3.4 Layout per display
**Outer display, 466 × 678 minus a ~80 pt strip ≈ 386 × 678:**
- The width is like an iPhone mini's. The height is shorter than any current iPhone (a 17 Pro is 874).
- The tab bar moves to the side, which gives back about 80 pt of height.
- Check screens that are tall by design:
  - the Flights hero and welcome card
  - the onboarding pager
  - the boarding pass (code plus text)
  - the paywall (RevenueCat native UI, which we don't control)
  - sheets with fixed detents (0.85–1.0)
  - the share-poster preview (its chrome allowance `56+202` is hard-coded, so on a 678 pt height the poster gets small)

**Inner display, landscape 951 × 669 (open book, bars on the side):**
- Regular width.
- Two-pane Flights already triggers. The right edge (~870 pt after the strip) still clears 840, but *only just*. The strip can push it below the threshold on some orientations or in Split View.
- **Change the trigger from "≥ 840" to "regular width".** That means the same threshold as `useWindowSizeClass` (≥ 600) plus a minimum detail width.

**Inner display, portrait 669 × 951 (hinge horizontal, laptop/tabletop):**
- 669 pt with horizontal bars.
- Current code shows single-column Flights, centred at 669 (under 800). It works but is wasteful.
- Apple would show list plus detail here too. Two panes at 669 means a ~290 pt list and a ~370 pt detail. `JourneyDetail` is designed for phone widths (~390), so it just fits.
- **Decision needed:** two-pane in inner portrait, or tabletop glance hero plus list (the Android tabletop path)? Apple's "additional level of hierarchy" guidance favours two-pane. Tabletop only makes sense while the device is actually half-folded (hinge state `partiallyOpen`).

**Other screens (Updates, Friends, World, Claims, Settings, Stats):**
- They are a centred ≤ 800 column today, which is acceptable on 951 pt.
- To look *really good*, the candidates for list + detail follow the existing `embedded` pattern:
  - **Friends:** person list → person
  - **Settings:** index → sub-screen
  - **Messages:** threads → thread
  - **Stats:** index → stat
- **Updates** feed: a 2-column grid (Apple: an even number of columns, so nothing lands on the fold). Photos use `photoAspect()` at full column width, so they get very tall unless capped.
- **World** is a full-bleed Skia globe measured by `onLayout`, and it resizes cleanly. Two refinements:
  - Place its overlay cards (`maxWidth: 480`) away from the fold when partly folded.
  - Consider a side panel for the route list in regular width.

### 3.5 Orientation
- `UISupportedInterfaceOrientations` is portrait-only for iPhone, and the inner display ignores it.
- **Unknown until tested on a 27.1 build:** does the portrait-locked app get laid out landscape at 951 × 669 on the inner display, or scaled? Apple says "your app will scale on the inner display". The simulator answers this.
- The outer display still honours the lock, so no landscape "tent" pose on the cover.
- Options:
  - Keep the lock. Apple lists tent support as encouraged, not required.
  - Unlock iPhone landscape and lock at runtime by width, as Android does in `useOrientationPolicy`.
- **Recommendation: keep the lock** for v1 of Duo support, and revisit after the device is in hand.

### 3.6 Fold state on iOS (the `flyright-fold` iOS backend)
Add Swift to `modules/flyright-fold` that emits the **same event shape** as the Android module, so the JS (`useFoldState`, `useIsTabletop`, the two-pane hinge split) works unchanged:

| Field | iOS source |
|---|---|
| `posture` | `UIHingeInteraction` state: closed / partiallyOpen / open → `none` / `halfOpened` / `flat` |
| `orientation`, `hingeBounds` | The active division region's frame from `reservedRegions(kind: .division)`, converted to dp the way `index.ts:55-68` does |
| `isSeparating` | true while a division is active |

Constraints:
- These APIs exist **only in the iOS 27.1 SDK**. They must be availability-checked (`if #available(iOS 27.1, *)`) *and* compile-guarded (`#if compiler(>=…)` or a build flag), because EAS cloud and Xcode 27.0 builds cannot see the symbols.
- The community reports that regions go stale right after a fold, with no change event (react-native#58594). Re-query on every layout pass, not only on hinge events.
- An upstream alternative is in progress: expo#50343 `expo-display-features`, draft behind `EXPO_IPHONE_DUO_SDK`, and RN's `Dimensions.getDisplayFeatures()`, whose native side is still a stub. **Don't wait for them.** Our module is small, and swapping its backend later is cheap.

### 3.7 Things we can't do much about
- **Live Activity / Dynamic Island.** On the Duo the Island is *vertical on the side* and "expands vertically" for Live Activities.
  - There are no ActivityKit API changes and no HIG guidance.
  - The **Duo simulator can't run app extensions** (Xcode 27.1 known issue), so our Live Activity and widget can't be checked before October.
  - Our compact and minimal views are text plus a small progress bar. Content that is fine horizontally may truncate in a vertical Island.
  - *Needs the device.*
- **The paywall** is RevenueCat's native UI. We don't control its layout. Check that it is usable at 386 × 678.
- **Multiple windows.** The Duo is the first iPhone with multiple windows of one app (inner display only). We set `UIApplicationSupportsMultipleScenes=false`. Keep it off; a second window of a trip tracker adds nothing.
- **Split View.** "All apps participate in multitasking on iPhone Duo." We will be run at half of 951 (≈ 475, compact) next to another app. That is the compact phone layout, which must already work, but the side strip is then on our *outer* edge.
- **The camera.** The boarding-pass scanner and document import use the camera. The inner display's under-display camera "moves the UI aside" while active, so check that the scanner's viewfinder and controls respect the occlusion region. The outer-display `CameraCaptureAccessory` is out of scope.

### 3.8 App Store and marketing
- Screenshot sizes: outer **1398 × 2034**, inner **2007 × 2853** (or landscape). Uploads open "later this year".
- The Duo simulator is enough to shoot them with the existing seeded-profile recipe (`scripts/seed-store-profile.mjs`). The shots must come from a 27.1-SDK Release build.
- Nothing says Duo optimisation is required for review.
- Apple's deadline: from **April 2027** every upload must be built with the iOS 27 SDK (already true for our local builds).

## 4. Testing: what the simulator can and cannot do

| Can do in the simulator | Cannot do yet |
|---|---|
| Install and run our app (done today: the 27.0 dev client runs) | Script fold or unfold. No `simctl`/`devicectl` command exists. Use **Device Hub**'s buttons under the device (open, close, rotate, fold). |
| Screenshot each display: `simctl io <udid> screenshot --display=primary` (outer) / `primary-1` (inner; black while closed) | Run or debug Live Activity, widget or share-extension code in the Duo runtime |
| Split View (drag the home indicator) | StandBy |
| Size-class, safe-area and vertical-bar layout on a 27.1 build | Real crease, touch at the hinge, one-handed reach on the cover |
| Tabletop / half-fold via Device Hub's fold control (a hidden Option-hinge slider is only a community report) | Maestro. It is untested on the Duo; the community reports taps not registering and portrait-only accessibility coordinates. Treat Maestro on the Duo as an experiment. Fall back to XCTest (`tests/physical-ios` style), which Apple supports. |

Before running the 27.1 build, the Duo simulator here needs:
- the Metro connection;
- the debugger. The Metro inspector did not answer for the Duo target today, so JS-side window metrics had to be read from screenshots.

Duo test matrix for each release once supported:
- **Poses:** outer portrait; inner landscape; inner portrait; half-folded (both hinge orientations); Split View with the strip on the left and on the right.
- **In each:** all five tabs, journey detail, add flight, boarding pass, onboarding, paywall, sign-in and share poster.
- **Resize continuity:** open and close *mid-flow*. For example, fold while the add-flight form is half filled, or while a journey is selected in two-pane. The selection and scroll position must survive. The two-pane selection is not in the URL today (`journey/[id]` pushes a full route), so this needs a deliberate check.

## 5. Plan

Estimates assume one developer who already knows the codebase.

| Phase | What | Effort | Can start now? |
|---|---|---|---|
| **0. Toolchain** | Install Xcode 27.1 beta alongside 27.0. Script a `DEVELOPER_DIR` Duo build of the dev client. Handle the expo#50365 cache. Record the baseline on both displays in every pose. | 0.5–1 day | yes |
| **1. Audit on a 27.1 build** | Rebuild with no code changes and inventory what breaks: tab bar vertical?, headers, safe-area overlaps (§3.3), portrait-lock behaviour on the inner display (§3.5), short outer height (§3.4). Save the screenshots in `store-assets/raw/duo/`. | 1 day | after 0 |
| **2. Must-fix** | Per-edge safe-area handling on overlays and full-bleed screens. Short-height fixes on the outer display (hero, onboarding, boarding pass, share-poster chrome maths). Base two-pane on regular width rather than ≥ 840. | 2–3 days | after 1 |
| **3. Fold awareness** | iOS backend for `modules/flyright-fold` (hinge + division region, SDK-guarded). Split two-pane at the hinge. Tabletop glance hero on a half-folded horizontal hinge. Keep the selection across fold and unfold. | 2–3 days | after 0 (needs the 27.1 SDK) |
| **4. Native bars** | Flights + / messages as native toolbar items with symbol + title. Item-based header buttons on the ~8 pushed screens. Visibility priorities. | 2–3 days | after 1; depends on what react-native-screens / expo-router expose in SDK 57 (spike first) |
| **5. More hierarchy on the inner display** | Two-pane Friends → person and Settings → sub-screen. 2-column Updates grid. World side panel (optional). | 3–5 days | after 2 |
| **6. Store** | Duo screenshots (outer + inner) from a 27.1 Release build. Listing copy mention. | 0.5 day | when ASC opens Duo uploads |
| **7. On-device check (late Oct)** | Live Activity in the vertical Island, crease/hinge touch, one-hand reach on the outer display, a real half-fold, camera occlusion in the scanner. | 0.5–1 day | device only |

**Minimum set to look "really good": phases 0–4, about 8–11 days.** Phase 5 is polish. Phases 2 and 5 also improve the iPad and Galaxy Fold inner display, because they share the regular-width code path.

**Release gating:** the Duo-aware build can reach users only once App Store Connect accepts **iOS 27.1 SDK** uploads (expected around iOS 27.1 GM). Until then:
- Keep shipping 27.0-SDK builds. They work on the Duo in the reduced mode measured above.
- Develop phases 0–5 on a branch.
- The Swift must be compile-guarded, so that `main` still builds with Xcode 27.0 and on EAS for Android.

## 6. Decisions for you

1. **Two-pane on the inner display in portrait (669 pt)?** Recommended: yes, it follows Apple's Mail pattern. The alternative is a single centred column.
2. **Native toolbar items on the tab roots (phase 4)?** Recommended: Flights only; keep the greeting header as content.
3. **Keep the iPhone portrait lock on the outer display?** Recommended: yes for now.
4. **Timing:** start phases 0–1 now (low risk, no user-facing change), or wait for Xcode 27.1 RC?

## 7. Open questions (verify, don't assume)

- Do react-native-screens native tabs and headers go vertical under the 27.1 SDK, and do `headerRight` custom views really stay horizontal?
- Do RN's `Dimensions` change event and Fabric's root size update correctly on fold and unfold? Do the Skia globe and WebGPU canvas resize without a blank frame? (The Android emulator showed a black Skia canvas until the texture loaded.)
- Does fold or unfold change the `UIScreen` for a non-full-screen app? This matters for anything that caches the screen scale, such as the globe textures and view-shot exports.
- The exact size of the side strip in points on each display. It was about 87 pt on the outer display in the 27.0 build. Read it from `useSafeAreaInsets` on a 27.1 build.
