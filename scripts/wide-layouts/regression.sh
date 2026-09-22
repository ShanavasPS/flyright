#!/usr/bin/env bash
# Runs a list of Maestro flows on one device, one after another, and prints
# PASS/FAIL per flow with the first failing step. Each flow starts from a
# freshly launched app (dev client pointed at Metro :8081 on iOS).
#   scripts/wide-layouts/regression.sh <device> <out-dir> <flow>[:KEY=VAL,KEY=VAL] ...
set -uo pipefail
dev=$1; out=$2; shift 2
here=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$out"
ios=false; xcrun simctl list devices | grep -q "$dev" && ios=true
for spec in "$@"; do
  flow=${spec%%:*}; envs=(); [ "$spec" != "$flow" ] && IFS=',' read -ra kv <<< "${spec#*:}" && for p in "${kv[@]}"; do envs+=(-e "$p"); done
  if $ios; then
    xcrun simctl terminate "$dev" com.shanavasshaji.flyright 2>/dev/null
    xcrun simctl launch "$dev" com.shanavasshaji.flyright >/dev/null
    sleep 2
    xcrun simctl openurl "$dev" "com.shanavasshaji.flyright://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
    sleep 25
  else
    adb=("$HOME/Library/Android/sdk/platform-tools/adb" -s "$dev")
    "${adb[@]}" reverse tcp:8081 tcp:8081 >/dev/null
    "${adb[@]}" shell am force-stop com.shanavasshaji.flyright
    "${adb[@]}" shell am start -a android.intent.action.VIEW \
      -d "flyright://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" >/dev/null 2>&1
    sleep 40
  fi
  log="$out/$flow.log"
  maestro --device "$dev" test -e SHOTS="$out/$flow" "${envs[@]}" "$here/.maestro/$flow.yaml" > "$log" 2>&1
  if grep -q "FAILED" "$log"; then echo "FAIL $flow — $(grep -m1 FAILED "$log" | sed 's/^ *//')"; else echo "PASS $flow"; fi
done
