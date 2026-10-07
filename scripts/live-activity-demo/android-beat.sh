#!/bin/bash
# One Android beat: launcher with the status-bar chip → shade → lock screen.
# Usage: android-beat.sh <serial> <out.mp4>
set -euo pipefail
D=$1; OUT=$2
ADB=~/Library/Android/sdk/platform-tools/adb
A="$ADB -s $D"
$A shell input keyevent KEYCODE_HOME
$A shell rm -f /sdcard/beat.mp4
$A shell screenrecord --bit-rate 12000000 --size 720x1560 --time-limit 30 /sdcard/beat.mp4 &
REC=$!
sleep 1.6
$A shell cmd statusbar expand-notifications
sleep 2.8
$A shell cmd statusbar collapse
sleep 0.9
$A shell input keyevent KEYCODE_SLEEP
sleep 0.7
$A shell input keyevent KEYCODE_WAKEUP
sleep 2.4
$A shell wm dismiss-keyguard
sleep 0.8
$A shell "pkill -INT screenrecord" || true
wait $REC || true
sleep 1
$A pull /sdcard/beat.mp4 "$OUT" >/dev/null
echo "recorded $OUT"
