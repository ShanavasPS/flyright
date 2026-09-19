# Physical iPhone tab checks with Apple tools

This standalone XCTest UI target uses only Xcode, XCTest and CoreDevice. It launches the **already installed** `com.shanavasshaji.flyright` by bundle identifier. Building this project builds a separate test helper, not FlyRight. It does not reinstall FlyRight, clear its data, sign in/out, seed trips, submit claims or change settings. Normal app effects from opening tabs still apply, such as marking People notifications seen.

The test performs two cold starts, each with a 30-second startup observation, then physically taps **My travels, World, Friends (formerly People), Claims and Settings** and returns to My travels. Each tab must be tappable and selected, destination content must load, the app must remain in the foreground, and common app/backend error messages must be absent. Screenshots and accessibility hierarchies are attached for every tab on both passes, plus a final-state capture on success or failure.

## Run

1. Discover the physical phone with `xcrun devicectl list devices`. Shanavas's iPhone 15 Pro has hardware UDID `00008130-0008642C0204001C` and CoreDevice ID `3A998669-73E7-5A25-9A43-52F0CC4FC555`. Require a successful live `device info lockState` query; a cached "available (paired)" listing or partially returned device details does not establish connectivity. Unlock the phone and accept any trust prompt. USB is a fallback for a failed wireless tunnel. Developer Mode and Settings → Developer → Enable UI Automation must be enabled.
2. Follow the version/build, crash inventory and data-preservation checks in [release-checks.md](../../docs/release-checks.md). For a release, require the intended candidate version/build. Record what is installed before running; this target deliberately does not update the app. Complete onboarding beforehand.
3. From the repository root, use a fresh output directory and the explicit **physical** UDID:

```sh
FLYRIGHT_IOS_TEST_OUT="$PWD/.maestro/out/physical-ios-tabs-$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$FLYRIGHT_IOS_TEST_OUT"
xcodebuild test \
  -project tests/physical-ios/FlyRightPhysicalUITests.xcodeproj \
  -scheme FlyRightPhysicalUITests \
  -destination 'platform=iOS,id=00008130-0008642C0204001C' \
  -destination-timeout 30 \
  -parallel-testing-enabled NO \
  -test-timeouts-enabled YES \
  -maximum-test-execution-time-allowance 300 \
  -derivedDataPath "$FLYRIGHT_IOS_TEST_OUT/build" \
  -resultBundlePath "$FLYRIGHT_IOS_TEST_OUT/results.xcresult" \
  DEVELOPMENT_TEAM=7NNC4W2FUU
```

Use host execution if the sandbox blocks Xcode, signing or CoreDevice. On 2026-09-14 this helper built and signed successfully using the existing local Apple Development identity and Xcode-managed wildcard profile for this team; no Apple login, Appium, WebDriverAgent, new certificate or Developer Portal mutation was needed. Let Xcode select the existing profile automatically. Manually forcing that Xcode-managed profile fails. If it later expires or signing fails, record the actual error and resolve signing before claiming a test run.

4. Export evidence, including on a test failure when a result bundle exists:

```sh
xcrun xcresulttool export attachments \
  --path "$FLYRIGHT_IOS_TEST_OUT/results.xcresult" \
  --output-path "$FLYRIGHT_IOS_TEST_OUT/attachments"
xcrun xcresulttool get test-results summary \
  --path "$FLYRIGHT_IOS_TEST_OUT/results.xcresult"
```

Read the attachment manifest to identify the named screenshots. **Inspect the actual images** for every tab, especially the map and trip list. Copy useful screenshots to Downloads. A green XCTest assertion alone does not establish that map tiles, photos or all visual content rendered correctly. Check crash logs again, record the installed version/build, source commit/dirty state, account state, test result and any coverage gaps in a dated report and `docs/release-state.md`.

This is a core tab smoke test, not proof that every feature works. Either existing account state is supported and is preserved; the Settings screenshot establishes which was observed. Signed-in production backend behavior and a retained trip/photo across an upgrade remain separate release gates. Camera scanning, Wallet, purchases, push delivery and Live Activities need their own affected-feature checks.

## Established status

**Verified on 2026-09-14:** the suite passed on the physical iPhone 15 Pro running iOS 26.0.1 and FlyRight 1.0.34 (51), wirelessly with USB unplugged and NordLayer still connected. Both five-tab passes completed in 123.355 seconds with zero failures. The second-pass screenshots and first-pass trip list were visually reviewed, the existing signed-in account/trips remained, and no new FlyRight crash reports appeared. See [release-state.md](../../docs/release-state.md) for evidence and coverage limits. A successful helper build alone is not a physical UI pass; connection, unlock, UI Automation or signing failures must remain explicit blocked checks.

If an unlocked USB-connected phone still returns `RemotePairingError` 4, inspect the Mac's `remotepairingd` errors and compare the reported network interface with `scutil --nc status <active-VPN-service>`. On 2026-09-14, Apple's device connection timed out through `utun4`, the active NordLayer interface, despite successful USB discovery and pairing. **Unplugging USB and retrying the paired wireless hostname restored live device queries while NordLayer stayed connected.** Device details then reported `transportType: localNetwork` and `tunnelState: connected`. Try that established wireless path before proposing any VPN change; the earlier timeout did not prove the VPN needed disabling. Require `passcodeRequired: false` before starting UI tests. A VPN pause needs authorization because it affects other Mac traffic; restore any approved temporary change after testing.

Apple APIs: [XCUIApplication](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication), [tap](https://developer.apple.com/documentation/xcuiautomation/xcuielement/tap()), [screenshots](https://developer.apple.com/documentation/xcuiautomation/xcuiscreenshot).
