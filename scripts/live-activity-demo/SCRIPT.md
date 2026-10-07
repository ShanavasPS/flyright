# Live Activity demo — shooting script (2026-09-25)

Two 20-second LinkedIn videos, one per platform, showing the travel-day
surface move through a flight: **Departs in → Boarding (gate) → On board
(seat) → Lands in → Landed (belt)**. Nothing is faked in post: every frame is
the real widget / notification drawn from seeded data, and the countdowns
tick on the device.

## What the surfaces actually show (from the code, not from memory)

The one render model is `LiveContent` (`src/services/travel-day.ts`); the
fact beside the clock comes from `liveLead` in `convex/liveShared.ts`:

| Stage (manual trip)            | Clock label      | Lead fact              | Island compact | Countdown to |
|--------------------------------|------------------|------------------------|----------------|--------------|
| through security, boarding not open | DEPARTS IN  | GATE 22 · Boards HH:MM | G22            | departure    |
| through security, boarding open (boarding_time ≤ now) | BOARDING (green) | GATE 22 · Departs HH:MM | G22 (also in the minimal slot) | departure |
| boarded                         | DEPARTS IN      | SEAT 14A               | 14A            | departure    |
| departed (in the air)           | LANDS IN        | SEAT 14A               | 14A            | arrival      |
| landed                          | LANDED HH:MM    | BAGGAGE Belt 7         | Belt 7 (✓ trailing) | none    |

iOS draws this as the Lock Screen card (`LockScreenView`), the Dynamic Island
compact pill (plane + word left, ticking clock right) and the expanded island
(clock left, fact right, route line with the plane on its progress at the
bottom). Android draws the same lead as a native **Live Update**
(`modules/flyright-live-update`): title "Departs in · Gate 22", text "Boards
HH:MM", sub-text "HEL → LHR", the OS-ticked chronometer in the header,
`ProgressStyle` route bar with the plane tracker, and the Android 16+ status
bar chip (the countdown while one runs, the compact word after).

The manual trip's facts come from the journey's record columns (terminal,
gate, boarding_time, baggage_belt, seat) via `factsFor` → `withRecord`; no
network is needed, so the demo runs fully offline on both devices.

## Beats (both videos, 4.0 s each = 20.0 s)

| # | State id  | Seeded times (relative to seed time)                                     | Expected reading                                   |
|---|-----------|--------------------------------------------------------------------------|----------------------------------------------------|
| 1 | departs   | dep +1h24 (rounded to 5 min), arr dep+3h12, boarding dep−40, stage security | DEPARTS IN 1:24 · GATE 22 / Boards HH:MM            |
| 2 | boarding  | dep +0h39, boarding dep−40 (= 1 min ago), stage security                  | BOARDING 0:39 (green) · GATE 22 / Departs HH:MM     |
| 3 | onboard   | dep +0h18, stage boarded (stamp −2 min)                                   | DEPARTS IN 0:18 · SEAT 14A                          |
| 4 | air       | sched dep −2h00, departed stamp/actual −1h58, arr +1h12                   | LANDS IN 1:12 · SEAT 14A · plane ~62 % along        |
| 5 | landed    | sched dep −3h20, sched arr −5 min, actual arr / landed stamp −3 min        | LANDED HH:MM · BAGGAGE Belt 7 · plane at LHR        |

Beat 5's window closes 30 min after the landing stamp (direct flight, no
arrival steps), so shoot it within that half hour of seeding.

Per beat, what the camera sees:

- **iOS (iPhone 17 Pro simulator, iOS 27.1, Release 1.1.4 build 67 with the
  FlyRightWidget extension):** Lock Screen with the card (≈2 s, the clock
  ticking) → unlock (Home ×2) → Home Screen with the compact Dynamic Island
  (≈1 s) → long-press the island → expanded island (≈1 s). Beats 2 and 4
  end on the expanded island (gate in green / the plane mid-route); the
  others may stay compact if the long-press proves slow.
- **Android ("Galaxy S26 Ultra" AVD — a custom Samsung-sized device
  definition, 6.9", 1440×3120, on the newest system image on this Mac,
  android-37.1 Play image; stock Android, One UI cannot be emulated):**
  launcher with the status-bar chip (≈1 s) → pull the shade down (card with
  chronometer, progress plane, ≈2 s) → collapse → screen off → wake to the
  Lock Screen showing the Live Update (≈1 s).

## Mocking — data and calls

- No live lookups, no Convex, no OneSignal traffic is needed for the pixels:
  the trip is a **manual** row (`source = 'manual'`), so the app never polls
  a provider, and the Live Activity starts on-device through the OneSignal
  SDK's `startDefault` (it renders locally) and updates through
  `updateActivityContent` (ActivityKit, no network). The REST proxy call it
  also makes fails silently on the sim (no APNs token) — expected.
- Base data: `node scripts/seed-demo-data.mjs --travel-day` (the store
  profile's nine trips; `demo-upcoming` = AY1331 HEL→LHR with gate 22,
  terminal 2, boarding −40 min, seat 14A from its boarding pass; belt 7 is
  added by the state patch). Then `scripts/live-activity-demo/seed-state.mjs
  --state <id>` rewrites that row's clocks + the `travel_day` row.
- iOS: the app must be launched once after every reseed (foreground
  reconcile) — `travel-day-lifecycle` then updates the existing activity in
  place; the activity id kv (`travel-activity-id-demo-upcoming`) is kept so
  the same activity lives through all five beats. First-ever start pops
  "Allow Live Activities" on the Lock Screen → `.maestro/demo/travel-day-allow.yaml`.
- Android: dev client (debuggable, needed for `run-as` seeding) on Metro
  :8081 via `adb reverse`; `POST_NOTIFICATIONS` granted with `pm grant`, the
  in-app push intent defaults to on; launch through the dev-client deep link
  after every reseed, then Home. The chip shows only from the launcher.
- Nothing about the sim clock is changed: all times are real "now" offsets,
  so the countdowns are genuinely ticking in the footage.

## Capture

- iOS: `xcrun simctl io <udid> recordVideo --codec h264 --force <file>` per
  beat, actions by Maestro CLI (`pressKey: Lock / Home`, `longPressOn` at
  the island). `fps=30` before `trim` in ffmpeg (recordVideo writes only
  changed frames).
- Android: `adb shell screenrecord` per beat, actions by `input keyevent`
  and `cmd statusbar expand-notifications/collapse`.
- Every beat is checked from its own screenshot before the take (the
  numbers in the table above must be on screen); a beat that reads wrong is
  reseeded, never edited.

## Edit

`render.mjs` (adapted from `scripts/heat-demo/render.mjs`): 1080×1350 feed
frame, the phone on the left, on the right a five-step column ("Departs in",
"Boarding", "On board", "Lands in", "Landed") lighting up with the beat, the
header naming the stack. Two outputs:
`demo/out/live-activity/flyright-live-activity-ios.mp4` and
`…-android.mp4`, 20.0 s each, muted, plus cover PNGs. Copies + the post
draft go to `~/Downloads/flyright-live-activity-demo-2026-09-25/`.

## Post

`store-assets/social/posts/linkedin-live-activity-post.md` — the honest
split: iOS Live Activities via OneSignal (SDK start on-device, Convex →
OneSignal REST → APNs for every update, countdown anchored to a timestamp so
it ticks offline); Android as a native Live Update (promoted ongoing
notification, ProgressStyle, chronometer, alarms for take-off/landing), with
OneSignal as the push layer around it.

## What changed on the day (2026-09-25)

- The live surface is Pro-gated (`proLocked()` in the lifecycle): both demo
  installs got a 3-day RevenueCat "Owed Pro" grant on their anonymous ids
  instead of signing in an account.
- iOS: an in-place ActivityKit update after a reseed was logged but did not
  repaint the archived card on the simulator, so each state starts a fresh
  activity (`ios-take.sh`: reinstall the same `.app`, forget the activity
  kv, relaunch). The `keep` mode updated in place fine for the landed beat.
- Android: `Galaxy_S26_Ultra` runs at FHD+ (1080×2340) — the QHD+ profile
  pushed the emulator to software rendering on this 18 GB Mac.
- Beats are jump-cut from the takes (three segments on iOS, two on Android,
  4.0 s each) because Maestro's holds on iOS run several times longer than
  asked. Cut points: `demo/out/live-activity/<platform>/cuts.json`.
- Known blemish: the iOS Home Screen shows Maestro's `maestro-driver-i…`
  runner icon (it is installed by the driver during every flow).
