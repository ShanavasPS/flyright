#!/bin/bash
# One iOS beat, end to end: seed the state, reinstall the same .app (the
# simulator never delivers Live Activity pushes and a local ActivityKit
# update did not repaint the archived card here — a reinstall ends the OS
# activity while the data survives), forget the old activity in the app's
# kv store, bring the app up so it starts a fresh activity with the new
# content, then record the Lock Screen → Home → expanded island beat.
# Usage: ios-take.sh <udid> <state> <n> [keep]   e.g. ios-take.sh 5696… boarding 2
# `keep` skips the reinstall and updates the running activity in place instead.
set -euo pipefail
U=$1; STATE=$2; N=$3; KEEP=${4:-}
D=scripts/live-activity-demo
O=demo/out/live-activity/ios
mkdir -p $O
APP=$(xcrun simctl get_app_container $U com.shanavasshaji.flyright app)
DATA=$(xcrun simctl get_app_container $U com.shanavasshaji.flyright data)
node $D/seed-state.mjs --state $STATE --ios $U
if [ -z "$KEEP" ]; then
  xcrun simctl install $U "$APP"
  DATA=$(xcrun simctl get_app_container $U com.shanavasshaji.flyright data)
  sqlite3 "$DATA/Documents/SQLite/ExpoSQLiteStorage" "delete from storage where key like 'travel-activity-%' or key like 'travel-day-posted-%';"
fi
~/.maestro/bin/maestro --device $U test $D/ios-prepare.yaml 2>&1 | grep -E "FAILED" || true
xcrun simctl io $U recordVideo --codec h264 --force $O/beat-$N-$STATE.mp4 2>/dev/null &
REC=$!
sleep 1.5
~/.maestro/bin/maestro --device $U test $D/ios-beat.yaml 2>&1 | grep -E "FAILED" || true
sleep 1
kill -INT $REC
wait $REC 2>/dev/null || true
ffmpeg -hide_banner -nostdin -loglevel error -y -i $O/beat-$N-$STATE.mp4 -vf "fps=1,scale=110:-1,tile=13x6" -frames:v 1 $O/sheet-$N-$STATE.png
echo "recorded $O/beat-$N-$STATE.mp4"
