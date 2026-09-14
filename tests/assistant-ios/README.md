# Siri and App Shortcuts checks

This XCTest target invokes all three FlyRight actions across cold and warm starts, through both Apple's Siri test interface and the Shortcuts app. It builds a test helper, not FlyRight. Install the new development app first. Use a dedicated simulator with no upcoming flights and complete FlyRight's onboarding before running. Open Shortcuts to its All Shortcuts catalog, where the three FlyRight actions must appear. The suite does not create, remove, or change trips or accounts.

**Sign the FlyRight simulator app with an actual Apple Development identity.** On iOS 26.5, ad-hoc signing lets the app launch and its catalog appear, but `linkd` rejects execution because it cannot find a team ID. Its log says `Unable to get teamId` and Shortcuts says `Unable to run App Shortcut`. Use an existing development identity for the app's `CODE_SIGN_IDENTITY` and `CODE_SIGNING_ALLOWED=YES`. The test helper itself can use ad-hoc signing.

```sh
xcodebuild test \
  -project tests/assistant-ios/FlyRightAssistantUITests.xcodeproj \
  -scheme FlyRightAssistantUITests \
  -destination 'platform=iOS Simulator,id=<simulator-udid>' \
  -parallel-testing-enabled NO \
  -derivedDataPath /private/tmp/flyright-assistant-ui-build \
  -resultBundlePath .maestro/out/assistant-siri/results.xcresult \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES
```

Siri must be available and enabled on the test target. If Siri discovery, account configuration, connectivity, or the simulator prevents invocation, report that separately from the native build and deep-link checks. Use `-only-testing:FlyRightAssistantUITests/FlyRightAssistantUITests/testAppShortcutsAcrossColdAndWarmStarts` to isolate direct Shortcuts execution. A compiled helper, catalog entry, or successful URL launch is not a Siri pass. Review the screenshots attached to the result bundle.

The Shortcuts check opens **Library → FlyRight**, outside the user's personal All Shortcuts search. It opens FlyRight's information sheet and enables its Siri switch if needed, recording before/after screenshots and requiring the switch to report on. On iOS 26, the accessibility tree exposes both a switch row and its nested control: tap the nested switch, because tapping the row's center does nothing. The Siri check also handles Apple's first-use Turn On prompt. This setup enables the requested FlyRight integration; it does not change general Siri settings or create personal shortcuts. Keep the phone idle during automation.

The empty-journal test covers the no-flight state for both read actions and the existing add-flight form. Saved-flight/pass selection, time zones, account isolation, and deferred handoff also have Jest coverage. A release still needs the repository's separate candidate and physical-device gates.

## Physical iPhone with an existing journal

Observe the phone's next saved flight first, and set `FLYRIGHT_ASSISTANT_EXPECTED_FLIGHT` (for example, its observed flight number) in the test target's `EnvironmentVariables` dictionary in the generated `.xctestrun` file. Use `build-for-testing` followed by `test-without-building -xctestrun <file>` on the physical UDID. The suite first opens that trip through My travels to establish whether a boarding pass is already saved. It then checks the same flight, the corresponding saved-pass or missing-pass state, and the add-flight form through both assistant entry points. It preserves the journal and does not seed test data. Screenshots and accessibility hierarchies include the original fixture and every action.

For Shanavas's iPhone, follow the wireless connection, installed-version, crash, two-start, and five-tab checks in [the physical iPhone guide](../physical-ios/README.md). A local feature test needs the new native app installed with production account configuration and the **actual app signing identity**; the separate XCTest helper's signing team is not proof of the app's team. Inspect current Apple profiles and the certificate itself before installing over an existing app. Record the binary hash because a local test build can share a version/build number with the store binary.
