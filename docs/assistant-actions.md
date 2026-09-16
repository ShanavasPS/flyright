# Siri and Android AppFunctions

FlyRight exposes three navigation actions:

| Action | Siri phrase | App route |
| --- | --- | --- |
| Next flight | “Show my next flight in FlyRight” | `flyright://assistant/next-flight` |
| Boarding pass | “Show my boarding pass in FlyRight” | `flyright://assistant/boarding-pass` |
| Add a flight | “Add a flight in FlyRight” | `flyright://assistant/add-flight` |

The next flight is the earliest saved flight that has not finished, including a flight in progress. Airport-local manual dates are resolved with the same time-zone helpers as the journal. Deleted flights and another account's flights are excluded. Anonymous local flights remain available. If that next flight has no saved boarding pass, the app offers to open the flight to add one; it never substitutes a later flight's pass. Add a flight opens the existing form and does not save or book anything automatically.

All data resolution happens inside the app after the current account state and database are ready. These integrations expose no trip catalogs, passenger information, booking references, barcode payloads, or account tokens to assistants. Spoken flight answers and background data queries are outside this implementation.

## iOS

`plugins/with-assistant-actions.js` adds `plugins/assistant/FlyRightAppIntents.swift` to the **main app target**, where Xcode extracts App Intents metadata. The plugin refreshes App Shortcuts at launch and is safe to run repeatedly during prebuild. It does not create an extension, App Group, or new provisioning capability.

The intents require device authentication and bring the app into the foreground. `modules/flyright-assistant/ios` stores only the most recent action and request time until React Native, auth, and navigation are ready. It handles both cold and warm starts, defers during onboarding/sign-in, consumes each request once, and expires unhandled requests after five minutes. The JS bridge is optional so older development binaries can still start.

This uses Apple's native framework within Expo 57. The npm `expo-app-intents@0.3.0` package inspected on 2026-09-14 depends on `@expo/ui ^58.0.1`; installing it would pull in components outside this app's SDK. Revisit that wrapper at a future SDK upgrade. New native builds are required; an OTA JS update cannot register these shortcuts.

## Android

`modules/flyright-assistant/android` registers `FlyRightAppFunctions#showNextFlight`, `#showBoardingPass`, and `#addFlight`. Each returns an **immutable PendingIntent targeted explicitly at FlyRight's MainActivity**. The authorized caller must launch that PendingIntent. The function does not attempt a prohibited background activity launch or claim that it has already shown a screen.

Google's Jetpack service supplies the `BIND_APP_FUNCTION_SERVICE` protection. KSP generates the function inventory and XML schema. No API key or Gemini SDK is needed.

The dependency is pinned to **1.0.0-alpha08**, which supports compileSdk 36 and AGP 8.9.1+. The alpha09, alpha10, and alpha11 AARs inspected on 2026-09-14 require compileSdk 37 and AGP 9.1.0+. Upgrading to alpha10+ also requires migration to `AppFunctionServiceEntryPoint` and removal of the old service artifact/aggregation flag. Upgrade this with the Expo native toolchain, not by bumping just the dependency.

**Gemini availability is not guaranteed by registration.** Google's current documentation restricts the complete pipeline to selected early-access apps. This implementation prepares testable functions; it does not enroll FlyRight or claim public Gemini support.

### Gemini status — checked 2026-09-15

- Google's AppFunctions page states that the Gemini integration is "in a private preview with trusted testers" and that "only a limited number of apps and system agents can access the entire pipeline." Access is by an Early Access Program.
- The EAP registration form linked from that page (`forms.gle/GN5ybjQFhzHRCguM7`) now shows only "Thank you for your interest in the Android AppFunctions Early Access Program. The Early Access Program is currently at capacity." There is nothing to submit. It points to a developer feedback form (`forms.gle/uTjn571hKdN6vFw96`, Google sign-in; asks for the package name, the Play listing link, screen recordings of the functions and API feedback), which is the only remaining channel to Google.
- App Actions (`shortcuts.xml` capabilities with built-in intents such as `actions.intent.OPEN_APP_FEATURE`) are documented for Google Assistant only; none of Google's App Actions pages mention Gemini. They are not built here. If Google publishes Gemini support for App Actions, add a config plugin that writes `shortcuts.xml` with one `OPEN_APP_FEATURE` capability per action, accept the App Actions terms in Play Console (Advanced settings → App Actions) and wait for Google's review.
- Library: `androidx.appfunctions` released alpha09 (May 2026), alpha10 (July 2026, introduces `AppFunctionServiceEntryPoint`; every `@AppFunction` must live inside the annotated service) and alpha11 (August 2026). All three need compileSdk 37 / AGP 9.1, so the module stays on alpha08 until the Expo toolchain moves.

Until Google opens the pipeline, the Android functions can be exercised only through the platform CLI (`adb shell cmd app_function …`) or the [AppFunctions testing agent](https://github.com/android/appfunctions) built from Google's sample, not through the Gemini app.

## Verification

Run `npx expo prebuild`, then compile both native apps. SDK 57 recreates native directories by default; use `--no-clean` for an incremental regeneration, or run CocoaPods installation again after an iOS clean prebuild. Confirm the iOS app's `Metadata.appintents` contains all three intents and phrases, and that the Android APK contains `assets/app_functions.xml`, `assets/app_functions_v2.xml`, and the protected service.

Run the assistant action and router Jest tests, including the existing native-intent suite. On a device with Android 17's CLI tools:

```sh
adb -s <serial> shell cmd app_function list-app-functions
adb -s <serial> shell cmd app_function execute-app-function \
  --package com.shanavasshaji.flyright \
  --function 'expo.modules.flyrightassistant.FlyRightAppFunctions#showNextFlight' \
  --parameters '{}' \
  --timeout-duration 20 \
  --pending-intent-path property/androidAppfunctionsReturnValue
```

The final option sends the returned PendingIntent. Without it, the command only invokes the function and does not open the screen.

Test all three incoming routes on cold and warm launches, including no trips, no boarding pass, a saved pass, and an account switch. On iOS, invoke each registered shortcut through Siri or Shortcuts; the [XCTest suite](../tests/assistant-ios/README.md) covers all three phrases on a dedicated development simulator. Deep-link tests alone do not establish Siri discovery or execution. Preserve the test device's existing data and distinguish development/simulator checks from release-candidate physical checks.

## Physical Pixel 9a validation — 2026-09-16

Shanavas's Pixel 9a (`tegu`, Android 17 `CP2A.260805.005`), connected by USB after a wireless-adb session found it locked, running the **Play-installed 1.0.35 (49)** release. Android lists all three FlyRight functions (`cmd app_function list-app-functions`). Each function was executed through the platform CLI with `--pending-intent-path property/androidAppfunctionsReturnValue` three times: cold (process force-stopped first), warm (app already open) and, for `showNextFlight`, a second strict cold run with a 35-second process-survival check. Every run returned `{}` plus "Sent PendingIntent", FlyRight's `MainActivity` became the resumed activity, and the screenshots (reviewed) show the expected screens: **next flight** and **boarding pass** land on the "No upcoming flight saved" fallback with *Add a flight* / *My travels* because this phone's account has no upcoming flight, and **add flight** opens the Add Flight form. Logcat had no `FATAL EXCEPTION` or ANR for the package, `ApplicationExitInfo` stayed empty, and no new crash/ANR dropbox entries appeared. No trip, account or setting was changed; `stay_on_while_plugged_in` was restored to off and the screen timeout set to 30 s after the run.

**Signed-in pass (same morning, same binary):** after the user signed the phone into an account with 32 trips, all three functions were executed again, cold and warm, with the same CLI recipe. **Next flight** opened the QR304 Qatar Airways HEL→DOH trip page dated Sat, Sep 19 ("In 3 days") with the map, times and the *Add your boarding pass* card; **boarding pass** showed "No boarding pass saved for your next flight" with *Open my flight* / *My travels*, the correct branch because that flight has no saved pass; **add flight** opened the Add Flight form. No `FATAL EXCEPTION`/ANR lines, empty `ApplicationExitInfo`, no new dropbox entries; trips and account untouched. Evidence: `.maestro/out/physical-pixel-appfunctions-signedin-2026-09-16T05-04-37Z/`, copies under `~/Downloads/flyright-pixel-appfunctions-2026-09-16/signed-in/`. Still untested on hardware: a next flight that *has* a saved pass (emulator-only on 2026-09-14).

**Saved-pass branch (same morning, same binary):** a fictitious single-leg BCBP for QR304 HEL→DOH on Sep 19 (`M1MOCK/TESTPASS … HELDOHQR 0304 262Y014A0042 100`, rendered as PDF417 with zxing-wasm) was uploaded through the trip page's *Add your boarding pass* → *Upload a ticket PDF or screenshot* → Files; the import screen read it, matched the existing trip ("In My travels — update boarding pass") and saved it. `showBoardingPass` then opened the boarding-pass screen with the PDF417 and its facts (Testpass Mock, seat 14A, sequence 42, booking MOCK01, cabin Y), cold and warm, FlyRight's process surviving both. Cleanup: the pass was removed through the pass screen's *Remove boarding pass*, the seat and booking the import had stamped on the trip were cleared through *Edit trip details*, the image was deleted from the phone, and a final cold `showBoardingPass` showed the "No boarding pass saved" offer again; no crash or ANR records. Note for future runs: an `ACTION_SEND` intent from adb (running or cold) does not open the import screen on the release build — use the in-app upload picker; and `uiautomator dump` fails with a "UiAutomationService … already registered" `FATAL EXCEPTION` while Maestro's accessibility service is attached (that line is in the shell tool's process, not FlyRight's). Evidence: `…/mock-pass/` under the signed-in folder.

A first attempt produced black screenshots because the phone re-locked before the first capture; that run is kept under `black-run-1/` and does not count. Coverage notes: the phone exercised only the empty-journal branches (the saved-flight and saved-pass branches were checked on the Android 17 emulator on 2026-09-14), and a CLI pass is not a Gemini invocation — Gemini still cannot call these functions (see the Gemini status above). Evidence: `.maestro/out/physical-pixel-appfunctions-2026-09-15T18-30-34Z/` (gitignored), screenshots copied to `~/Downloads/flyright-pixel-appfunctions-2026-09-16/`.

## Physical iPhone validation — 2026-09-14

Installed a local Release/ad-hoc **1.0.34 (51)** build with production configuration on Shanavas's iPhone 15 Pro, iOS 26.0.1, through the established wireless connection. All three actions passed through Apple's Shortcuts app on both cold and warm starts in **87.282 seconds**, using the existing QR304 flight and its missing-pass state. All six action screenshots were reviewed. Testing found and fixed a missing Back button after a cold entry into the nested journeys stack: the stack now anchors My travels, and the assistant redirect uses `withAnchor`. The corrected flow returned to My travels after every action. No trip or account was removed, and no new FlyRight crash reports appeared.

Siri recognized FlyRight initially and displayed all three phrases in its first-use prompt. Voice execution remains pending: later calls returned web results while the app-specific Siri setting remained off. The helper now taps the actual nested Siri switch and verifies its on state; tapping its accessibility row had no effect. The next run and the post-install five-tab/PID checks await wireless reconnection after the phone was plugged into the Mac by USB. This does not establish a full physical release gate or saved-barcode/photo-upgrade coverage. Evidence and latest status: `.maestro/out/physical-iphone-assistant-2026-09-14T17-56-57Z/` and [release state](release-state.md).

## Earlier development validation — 2026-09-14

Both local development binaries use the existing version **1.0.34**, iOS build **51** and Android version code **48**. This feature has not been released. Evidence is under `.maestro/out/assistant-2026-09-14/` (gitignored).

- **Builds and JS:** Android debug assembly and iOS simulator build succeeded. TypeScript, ESLint for changed sources, and all **69 Jest suites / 758 tests** passed. Both generated native inventories contain all three actions.
- **iOS App Shortcuts:** all three appeared in Apple's Shortcuts catalog and passed XCTest execution on both cold and warm launches on iPhone 17 Pro / iOS 26.5 simulator. This checks the durable native handoff, empty-journal fallbacks, and the add-flight form. See `assistant-signed-results.xcresult`. The app must have a development certificate signature with a team ID; ad-hoc signing was rejected by `linkd` despite successful catalog discovery.
- **Siri phrases:** the separate spoken-phrase XCTest failed to open the first action on this simulator, even after direct Shortcuts execution passed. Siri phrase recognition and invocation remain **unverified**; the combined XCTest result therefore includes one passing test and one failing test. Do not describe the Shortcuts pass as a Siri voice pass.
- **Android:** Android 17's AppFunctions CLI indexed and invoked all three functions and sent each returned PendingIntent. The next saved flight, its saved boarding-pass barcode, and add-flight form were visually confirmed (`android-confirm-next.png`, `android-pass-after-wait.png`, `android-settled.png`). Repeated cold/warm screen checks were **not a clean stability pass**: this emulator had system-wide startup ANRs, and FlyRight reported a WorkManager `SystemJobService` startup ANR. The pass screen recovered after choosing Wait. Details are in `android-events.log`; early screenshots that show loading or blank frames do not count as successful screen checks.
- **Remaining coverage:** Siri voice invocation, public Gemini invocation, and release-candidate physical-device validation. Saved-pass selection and account isolation have Jest coverage; the iOS UI fixture was an empty anonymous journal. No existing trips or accounts were removed.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Apple App Intents](https://developer.apple.com/documentation/appintents), [Expo App Intents source](https://github.com/expo/expo/tree/main/packages/expo-app-intents), [Google AppFunctions](https://developer.android.com/ai/appfunctions), [Jetpack releases](https://developer.android.com/jetpack/androidx/releases/appfunctions).
