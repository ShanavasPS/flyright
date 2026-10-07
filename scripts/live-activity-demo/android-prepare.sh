#!/bin/bash
# NOT recorded: after a reseed, cold-start the dev client on Metro so the
# lifecycle re-posts the Live Update, then go Home (the chip shows only from
# the launcher). Usage: android-prepare.sh <serial>
set -euo pipefail
D=$1
ADB=~/Library/Android/sdk/platform-tools/adb
$ADB -s $D shell am force-stop com.shanavasshaji.flyright
$ADB -s $D shell am start -a android.intent.action.VIEW -d "flyright://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" >/dev/null
for i in $(seq 1 40); do
  sleep 2
  if $ADB -s $D shell dumpsys notification --noredact 2>/dev/null | grep -q "tag=demo-upcoming"; then break; fi
done
sleep 3
$ADB -s $D shell input keyevent KEYCODE_HOME
sleep 1.5
$ADB -s $D shell dumpsys notification --noredact 2>/dev/null | grep -E "android.title=|android.text=|android.subText=" | head -3
