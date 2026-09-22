#!/usr/bin/env bash
# Android twin of ab.sh (docs/wide-layouts-plan.md §9, Pass 2): shoots every
# tab on `main`, then on the current branch, on one emulator or phone running
# the debug build against Metro on :8081, and diffs them.
#   scripts/wide-layouts/ab-android.sh <serial> <out-dir>
# Uses .maestro/wide/tabs-snapshot.yaml; tools are copied aside because they
# only exist on the branch.
set -euo pipefail

run() {
  local serial=$1 out=$2
  local here branch tools
  here=$(cd "$(dirname "$0")/../.." && pwd)
  branch=$(git -C "$here" branch --show-current)
  [ -z "$(git -C "$here" status --porcelain --untracked-files=no -- src)" ] || { echo "src/ has uncommitted changes"; exit 1; }
  mkdir -p "$out"
  tools=$(mktemp -d)
  cp "$here/.maestro/wide/tabs-snapshot.yaml" "$here/scripts/wide-layouts/pixdiff.cjs" "$tools/"
  ln -s "$here/node_modules" "$tools/node_modules"
  local adb="$HOME/Library/Android/sdk/platform-tools/adb"

  shoot() {
    "$adb" -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null
    "$adb" -s "$serial" shell am force-stop com.shanavasshaji.flyright
    "$adb" -s "$serial" shell am start -a android.intent.action.VIEW \
      -d "flyright://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" >/dev/null 2>&1
    sleep 40
    mkdir -p "$out/$1"
    maestro --device "$serial" test -e SHOTS="$out/$1" "$tools/tabs-snapshot.yaml" | grep -E "FAILED" || true
  }

  trap "git -C '$here' checkout -q '$branch'" EXIT
  git -C "$here" checkout -q main; sleep 8; shoot main
  git -C "$here" checkout -q "$branch"; sleep 8; shoot branch
  for f in "$out"/main/*.png; do
    [ -e "$f" ] || { echo "no shots from main"; exit 1; }
    local name; name=$(basename "$f")
    printf '%s: ' "$name"
    node "$tools/pixdiff.cjs" "$f" "$out/branch/$name" 150 || true
  done
}

run "$@"
exit
