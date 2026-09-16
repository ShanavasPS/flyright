#!/bin/bash
# Runs the share-sheet frame capture on Shanavas's iPhone over Wi-Fi, first
# switching the app to the demo account (Daniel). Nothing is sent; the draft
# is discarded. Frames land in $OUT/results.xcresult.
set -euo pipefail
cd "/Users/sshaji/Documents/Projects/flyRight"
OUT="/Users/sshaji/Documents/Projects/flyRight/.maestro/out/physical-ios-detour-share-2026-09-16T10-15-06Z"
TEST_RUNNER_FLYRIGHT_CAPTURE_INTERVAL=0.3 \
TEST_RUNNER_FLYRIGHT_TO_NAME="Emma" \
xcodebuild test \
  -project tests/physical-ios/FlyRightPhysicalUITests.xcodeproj \
  -scheme FlyRightPhysicalUITests \
  -destination "platform=iOS,id=00008130-0008642C0204001C" \
  -destination-timeout 60 -parallel-testing-enabled NO \
  -test-timeouts-enabled YES -maximum-test-execution-time-allowance 500 \
  -only-testing:FlyRightPhysicalUITests/FlyRightPhysicalUITests/testCaptureSendFrames \
  -derivedDataPath "$OUT/build" -resultBundlePath "$OUT/results.xcresult" \
  DEVELOPMENT_TEAM=7NNC4W2FUU > "$OUT/xcodebuild.log" 2>&1 || true
grep -E "Test Case.*(passed|failed)|error:|TEST (SUCCEEDED|FAILED)" "$OUT/xcodebuild.log" | head -8 | cut -c1-200
