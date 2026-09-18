# World tab globe demo (react-native-skia)

A 34-second, 1080 × 1350 feed video for LinkedIn: the World tab's globe
arriving with the comets on the upcoming flight, a flick with inertia,
Recenter, two double taps into Europe (detail coastlines and borders fade
in), a drag, a route tap with its docked card, the trip page with the inset
globe, and a dark-mode beat. The globe is `src/components/globe-view.tsx`
(maths in `src/services/globe.ts`, textures from
`scripts/generate-globe-texture.mjs`).

Output (gitignored): `demo/out/globe/flyright-globe.mp4`, the `.srt`
captions and a cover PNG. Post draft:
`store-assets/social/posts/linkedin-globe-post.md`.

## What was recorded (2026-09-18)

The "FlyRight Shots" simulator (`E41015CC-1A17-42A9-8658-F7D4E2487A9B`,
iPhone 17 Pro, iOS 26.5) with the **Release 1.0.37 (54)** build it already
held from the store-screenshot reshoot, anonymous, re-seeded with
`scripts/seed-demo-data.mjs` so the upcoming HEL → LHR flight sits ~12 h out
(that is what makes the comets run). Two takes of the same flow, one per
appearance, each under `xcrun simctl io <udid> recordVideo`:

```sh
U=E41015CC-1A17-42A9-8658-F7D4E2487A9B
xcrun simctl terminate $U com.shanavasshaji.flyright
node scripts/seed-demo-data.mjs --ios --sim $U
xcrun simctl status_bar $U override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
for mode in light dark; do
  xcrun simctl ui $U appearance $mode
  xcrun simctl io $U recordVideo --codec h264 --force demo/out/globe/take-$mode.mp4 & REC=$!
  maestro --device $U test -e OUT="$PWD/demo/out/globe/$mode" scripts/globe-demo/capture.yaml
  kill -INT $REC; wait $REC
done
node scripts/globe-demo/render.mjs   # cuts in edit.json
```

`explore.yaml` is the scouting flow (cold start → World → screenshot) used
to aim the taps. Cut points were read off 1–2 fps contact sheets
(`ffmpeg -vf "fps=2,scale=220:-1,tile=12x7"`) plus
`select='gt(scene,0.08)',showinfo` for the hard cuts; the recording starts
~20 s before Maestro launches the app, so every take begins with stale frames.

## Gotchas

- Maestro cannot pinch; zoom is the double tap (×2.2 each, so two of them
  pass the border fade-in at 2.2–4.5×). Maestro's `doubleTapOn` lands inside
  the globe's 420 ms window.
- **Every tap also selects the nearest route within 22 pt**, so a double tap
  on or near an arc docks that route's card mid-zoom (the first take zoomed
  on the DXB → LAX arc and its card popped up). The flow now zooms about the
  western Mediterranean, clear of every arc.
- The route card's leg row is one merged accessibility element
  ("AY5 · Finnair / Flown · May 23, 2026"), so a text regex on "Flown" fails;
  it is tapped by position (50 %, 83 %).
- `recordVideo` only writes frames where pixels changed: `fps=30` must come
  before `trim` in the renderer (already the case), and a hold on a static
  screen is a 2-frame file.
- The tap on the World tab is the natural way in — a deep link would skip
  the arrival animation.
- ffmpeg here has no `drawtext`; contact sheets are read by grid position
  (12 per row at 1 fps → column + 12 × row seconds).
