# Demo video pipeline

Everything needed to regenerate the Shipaton demo (`demo/out/flyright-demo.mp4`)
from a clean simulator. Read `script.md` for the cut itself.

## Tools

- **ffmpeg** — `brew install ffmpeg` (composition, encoding, audio mix).
- **Maestro CLI** — `~/.maestro/bin/maestro` drives the app; flows in `.maestro/demo/`.
- **xcrun simctl** — `recordVideo` captures the simulator screen (h264, native resolution).
- **macOS `say`** — narration; swap for a Premium voice or ElevenLabs (see script.md).
- **sharp** (already a dev dependency) — renders the background, phone frame,
  captions and title/outro cards as PNG layers.

## One-time device prep

```bash
# 1. A fresh simulator (clean keychain: anonymous, no cloud trips pulled on top of the seed)
UDID=$(xcrun simctl create "FlyRight Demo" "iPhone 17 Pro" com.apple.CoreSimulator.SimRuntime.iOS-26-5)
xcrun simctl boot "$UDID"

# 2. Metro serving the API routes (Release builds don't load JS from it, only /api/*)
npx expo start          # leave running on :8081

# 3. A RELEASE build whose /api/* calls go to that Metro — live lookups need a
#    signed-in user and an origin the simulator can reach (getflyright.com is
#    gateway-blocked on this network; the dev client paints a banner into captures)
FLYRIGHT_ROUTER_ORIGIN=http://localhost:8081 npx expo run:ios --configuration Release --no-bundler --device "$UDID"

# 4. First launch, sign-in (Clerk dev user, OTP 424242) and the demo journal
node scripts/demo-video.mjs setup --sim "$UDID"
```

## Produce the video

```bash
node scripts/demo-video.mjs voice                  # narration → demo/out/voice/*.aiff + durations
node scripts/demo-video.mjs record --sim "$UDID"   # seeds, runs each flow while recording → demo/out/capture/
node scripts/demo-video.mjs assemble [--music track.mp3]   # → demo/out/flyright-demo.mp4
```

`record --only 06-verdict-claim,07-world` re-captures those scenes (reseeding
as each needs); `art` renders the PNG layers alone for a look at the layout.

## The claim letter needs Pro

Generating a claim is a Pro feature, so the claim scene stops at the verdict
card unless the demo user holds the entitlement. The Release build runs the
production RevenueCat key (pulled from the EAS production env at build time —
the Test Store key is refused by a Release binary, and a promotional grant
over the API is blocked in auto mode). To record the full letter:

1. RevenueCat dashboard → project FlyRight → Customers → the demo user's
   Clerk id (`sqlite3 <container>/Documents/SQLite/flyright.db "select distinct user_id from journeys"`)
   → Grant promotional entitlement → "Owed Pro", any duration.
2. `DEMO_PRO=true node scripts/demo-video.mjs record --sim "$UDID" --only 06-verdict-claim`
3. `node scripts/demo-video.mjs assemble`

Record the paywall scene (`08-pro`) BEFORE granting — a Pro user gets the
change-plan sheet instead.

## Gotchas collected while making it

- Only a **Release** build is worth recording — expo-dev-client's "Refreshing…"
  banner never clears in a dev build.
- `simctl recordVideo` needs SIGINT (not SIGTERM) to write the file, and a
  second of slack after the flow so the tail frames land.
- Maestro has no sleep: the flows pause with an optional `extendedWaitUntil`
  on text that never appears. Tab-bar taps don't work on iOS 26 — every
  scene navigates with `flyright://` deep links.
- The Maestro CLI sometimes hangs after a flow has passed; the script kills
  it after four minutes and keeps the capture.
- The first Live Activity start asks for permission **on the Lock Screen** —
  `travel-day-allow.yaml` handles that before the travel-day scene records.
- Restore the debug build afterwards (`npx expo run:ios`), or the sim keeps
  the demo Release app.
