# FlyRight Shipaton demo

The current deliverable is `output/ios27/flyright-shipaton-1m59s.mp4`: a
119-second, 1920 × 1080 cut recorded on an **iPhone 18 Pro simulator running
iOS 27.0**, from a development build of **FlyRight 1.1.3 (65)** signed in as
the store profile Maja Lindqvist. The display keeps its own aspect ratio
inside a rounded screen mask, slim metal bezel and side buttons, with the
complete phone visible. English synthesized narration and captions sit beside
the app. H.264 video and AAC audio, ready for YouTube or Vimeo. The same
folder holds editable captions (`flyright-shipaton.srt`), the narration track
(`voiceover.wav`) and a nine-tile contact sheet (`qa-final.png`). The earlier
iOS 26 cut of version 1.0.31 stays in `output/ios26/`.

This cut follows the 23 September pricing rework rather than the original
feature tour: open on Flights → the three ways to add a flight → flights
grouping themselves into destination trips → travel day → the people, free on
both sides → the Skia globe → the Madrid delay and its 400 EUR verdict → the
Pro offer, its RevenueCat plans and the take-off reminder it proposes instead
of a wall → the close. See [the timed narration](NARRATION.md), [the shot
timeline](TIMELINE.md) and [the editable storyboard](storyboard.json).

The closing scene names **no single award category**, so the same file suits
every entry. The Pro scene shows the real offering fetched by RevenueCat, and
says on screen that it is a development build: a Release binary refuses the
Test Store key, so the prices on camera are the test-store values, not store
pricing. Nothing is purchased, no reminder is saved, no claim is submitted and
no invitation is sent. The compensation figure is the seeded Madrid delay.

## Re-record

Use a populated iOS 27 simulator with the app past onboarding, signed in as
the store profile. This recording used the **FlyRight iOS 27 Social**
simulator (iPhone 18 Pro) and a **development** build, because the paywall
needs one: `initPurchases` only falls back to the RevenueCat Test Store key
when `__DEV__` is set, and a Release build without platform keys shows "Plans
are unavailable". Build it with `npx expo run:ios --device <udid>` and leave
Metro running for the whole capture.

Seed the journal first — the flow depends on all three fixtures:

```bash
node scripts/seed-demo-data.mjs --ios --sim <udid> --future --travel-day
```

`--travel-day` puts today's HEL→LHR departure about an hour out and stamps it
through security; `--future` adds the Lisbon trip three weeks out, which the
Pro offer needs before it will propose a take-off reminder (it wants 48h of
lead time). The Madrid delay that carries the 400 EUR verdict is always
seeded. Re-seed right before recording so the relative labels read correctly.

```bash
xcrun simctl list devices booted
DEMO_DEVICE=AA6A8347-57FC-40E6-AA7B-27180F27DD47 \
DEMO_HIDE_LOADING=1 \
MAESTRO_DRIVER_STARTUP_TIMEOUT=240000 \
DEMO_OUT="$PWD/scripts/shipaton-demo/output/ios27" \
bash scripts/shipaton-demo/record.sh
```

Always use an explicit UDID when multiple simulators are running. The script sets a clean 9:41 status bar and clears that override when it finishes. Each scene has its own MP4 and still image, making individual retakes easy. The [Maestro flow](../../.maestro/shipaton-demo.yaml) performs the taps, typing, scrolling, assertions, and local recordings.

For a development build, the script uses LLDB to temporarily disable React Native's loading overlay in the simulator process, then restores it on exit. This fixes a recording-only blue “Refreshing…” banner that can be absent from screenshots. It changes no app source or stored data. For a Release build, set `DEMO_HIDE_LOADING=0` to skip the debugger step. On a new Mac, debugger access may require system permission.

Three things about a development build cost a retake each, so the flow works
around them. A custom-scheme deep link raises an "Open in FlyRight?" dialog,
so the flow navigates by taps and never uses `openLink` inside a recording. A
trip page is pushed over the tab bar, so a scene that ends on one must step
back before it can tap another tab. And any `launchApp` restores the loading
overlay, so `record.sh`'s LLDB step has to run *after* the last relaunch — if
you re-shoot a scene by hand, disable the overlay again first or `verify.mjs`
will catch the banner. Maestro matches a selector against the whole label, so
use a regex like `.*Flew on.*` for text that sits inside a longer one.

Keep Metro and the app source stable while recording. Do not run a second automation session on the same simulator during capture. Recordings omit navigation/loading between scenes and retain actual interactions within them. The editor fits long clips to their chapter and holds the final frame of shorter clips.

## Build or revise the edit

Dependencies: Node with the repository's `sharp` package installed, macOS `say`, and FFmpeg compiled with `libx264`, `libass`/the `subtitles` filter, and AAC. The renderer detects the FFmpeg binary available on the original recording machine; use `FFMPEG=/absolute/path/to/ffmpeg` to override it. Some minimal FFmpeg distributions omit subtitles support.

```bash
export DEMO_OUT="$PWD/scripts/shipaton-demo/output/ios27"
node scripts/shipaton-demo/render.mjs prepare
node scripts/shipaton-demo/render.mjs voice
node scripts/shipaton-demo/render.mjs render
node scripts/shipaton-demo/verify.mjs
```

Edit `storyboard.json`, then repeat those commands. Scene durations must sum to 119 seconds. `prepare` updates the backgrounds and documentation; `voice` generates local Samantha narration and adjusts speaking rates to fit; `render` creates captions, normalizes speech, assembles the final video, checks its duration, and decodes the entire export for errors. `verify` checks audio levels, samples all raw clips for the development loading banner, and makes a contact sheet for visual review. Generated media stays under the ignored `output/` directory.

To re-render only a replaced clip, retaining the other rendered segments:

```bash
DEMO_SCENES=03-travel node scripts/shipaton-demo/render.mjs render
```

The iOS 26 revision reuses the original per-scene narration. If the narration text is unchanged, copy the existing `output/audio/*.aiff` and `output/audio/timings.json` into the new output's `audio/` directory and skip `voice`. The caption timings are estimated within each measured narration segment. They are editable in the SRT file. To use your own narration, record each scene using `NARRATION.md` as a teleprompter, then replace the narration track in a video editor. Keep each take within its allocated duration.

## Useful apps and sites

| Tool | Best use for this demo |
| --- | --- |
| [ElevenLabs Studio](https://elevenlabs.io/studio) | Replace the system voice with a more expressive AI voice, adjust speech, and export captions. |
| [Descript](https://www.descript.com/) | Revise the edit by editing its transcript; record your own narration and clean up audio. |
| [Screen Studio](https://screen.studio/guide/recording-iphone-ipad) | Record a connected iPhone over USB for a future physical-device take. |
| [Maestro](https://docs.maestro.dev/api-reference/commands/startrecording) | Repeat the same app interactions and capture each scene locally. |

The supplied video is produced locally with Maestro, FFmpeg, and macOS speech; these other services are optional. No external voice account or paid video service was used. ElevenLabs was discovered through Stripe Directory; the editor capabilities above were checked against their official websites.

## Submit

Upload the MP4 to YouTube or Vimeo and use the shareable video link in Devpost. RevenueCat's [submission guide](https://www.revenuecat.com/blog/engineering/how-to-submit-your-app-for-shipaton) accepts unlisted YouTube links and asks for the core experience and monetization within the first two minutes. Check that the judges can open the link without your login. The MP4 has not been uploaded or submitted by this workflow.

The [official rules](https://revenuecat-shipaton-2026.devpost.com/rules) also require the other submission materials, including store availability, app artwork, and judge access to premium functionality. The [current prize categories](https://www.shipaton.com/) describe the Design Award as recognizing product craft, design, and animation. This video does not replace those other submission materials.
