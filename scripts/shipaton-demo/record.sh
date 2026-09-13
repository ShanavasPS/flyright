#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DEMO_DEVICE:?Set DEMO_DEVICE to the simulator UDID shown by xcrun simctl list devices booted}"
DEMO_OUT="${DEMO_OUT:-$PWD/scripts/shipaton-demo/output}"
mkdir -p "$DEMO_OUT/raw" "$DEMO_OUT/stills"
APP_PID=""
cleanup() {
  if [[ -n "$APP_PID" ]]; then
    xcrun lldb --batch -p "$APP_PID" -o 'expression -- (void)RCTDevLoadingViewSetEnabled(true)' -o 'process detach' > "$DEMO_OUT/loading-overlay-restore.log" 2>&1 || true
  fi
  xcrun simctl status_bar "$DEMO_DEVICE" clear
}
trap cleanup EXIT
maestro --device "$DEMO_DEVICE" test .maestro/shipaton-prepare.yaml
xcrun simctl status_bar "$DEMO_DEVICE" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100
if [[ "${DEMO_HIDE_LOADING:-1}" == "1" ]]; then
  # RN's development loading UIWindow can remain visible only in recordings.
  # Change the debug process in memory, then restore it on exit. No app edits.
  APP_PID=$(xcrun simctl spawn "$DEMO_DEVICE" launchctl list | awk '$3 ~ /^UIKitApplication:com.shanavasshaji.flyright\[/ {print $1}')
  if [[ ! "$APP_PID" =~ ^[0-9]+$ ]]; then
    echo "Could not identify flyRight's simulator process." >&2
    exit 1
  fi
  xcrun lldb --batch -p "$APP_PID" \
    -o 'expression -- (void)RCTDevLoadingViewSetEnabled(false)' \
    -o 'expression -l objc++ -- (void)[[NSNotificationCenter defaultCenter] postNotificationName:@"RCTInstanceDidLoadBundle" object:nil]' \
    -o 'process detach' > "$DEMO_OUT/loading-overlay.log" 2>&1
fi
maestro --device "$DEMO_DEVICE" test -e "DEMO_OUT=$DEMO_OUT" .maestro/shipaton-demo.yaml
echo "Capture complete: $DEMO_OUT/raw"
