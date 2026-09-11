#!/bin/sh
# Cold-starts the dev client on a booted iOS simulator and screenshots it
# every ~150ms for a few seconds, then keeps only the frames that differ —
# a poor man's screen recording for what the home screen paints between
# launch and the journal (the "Add your first flight" flash of b3d1807's
# era). Frames land in $OUT as NNN.png; duplicates are dropped.
#   scripts/cold-start-frames.sh <udid> <out-dir> [seconds]
set -e
UDID="$1"; OUT="$2"; SECS="${3:-8}"
APP=com.shanavasshaji.flyright
mkdir -p "$OUT"; rm -f "$OUT"/*.png
xcrun simctl terminate "$UDID" "$APP" 2>/dev/null || true
sleep 1
xcrun simctl openurl "$UDID" "flyright://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
END=$(( $(date +%s) + SECS )); i=0
while [ "$(date +%s)" -lt "$END" ]; do
  xcrun simctl io "$UDID" screenshot "$OUT/$(printf %03d $i).png" >/dev/null 2>&1 || true
  i=$((i+1))
done
prev=""
for f in "$OUT"/*.png; do
  h=$(md5 -q "$f")
  if [ "$h" = "$prev" ]; then rm "$f"; else prev="$h"; fi
done
ls "$OUT" | wc -l | xargs echo "distinct frames:"
