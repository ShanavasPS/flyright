#!/usr/bin/env bash
# Phone-width A/B for the wide-layouts work (docs/wide-layouts-plan.md §9):
# shoots every tab on `main`, then on the current branch, on one iOS
# simulator running the dev build against Metro on :8081, and diffs them.
#   scripts/wide-layouts/ab.sh <sim-udid> <out-dir>
# Needs a clean src/ (it checks out main and back). The flow and the diff
# script only exist on the branch, so they are copied aside first, and the
# whole script runs from one function so bash has read it all before the
# checkout replaces this file.
set -euo pipefail

run() {
  local udid=$1 out=$2
  local here branch tools
  here=$(cd "$(dirname "$0")/../.." && pwd)
  branch=$(git -C "$here" branch --show-current)
  [ -z "$(git -C "$here" status --porcelain --untracked-files=no -- src)" ] || { echo "src/ has uncommitted changes"; exit 1; }
  mkdir -p "$out"
  tools=$(mktemp -d)
  cp "$here/.maestro/wide/phone-ab.yaml" "$here/scripts/wide-layouts/pixdiff.cjs" "$tools/"
  # pixdiff needs pngjs from the project.
  ln -s "$here/node_modules" "$tools/node_modules"

  shoot() {
    xcrun simctl terminate "$udid" com.shanavasshaji.flyright 2>/dev/null || true
    xcrun simctl launch "$udid" com.shanavasshaji.flyright >/dev/null
    sleep 2
    xcrun simctl openurl "$udid" "com.shanavasshaji.flyright://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
    maestro --device "$udid" test -e SHOTS="$out" -e NAME="$1" "$tools/phone-ab.yaml" | grep -E "FAILED" || true
  }

  trap "git -C '$here' checkout -q '$branch'" EXIT
  git -C "$here" checkout -q main; sleep 8; shoot main
  git -C "$here" checkout -q "$branch"; sleep 8; shoot branch
  for f in "$out"/main-*.png; do
    [ -e "$f" ] || { echo "no shots from main"; exit 1; }
    local name; name=$(basename "$f" .png); name=${name#main-}
    printf '%s: ' "$name"
    node "$tools/pixdiff.cjs" "$f" "$out/branch-$name.png" 180 || true
  done
}

run "$@"
exit
