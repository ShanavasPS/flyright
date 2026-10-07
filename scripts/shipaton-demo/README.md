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

## The story panel (second look, 24 September)

`DEMO_STYLE=story` renders the left panel through `panel-story.mjs` instead of
the inline SVG: a fixed thesis line, a numbered scene index with its accent
rule, the scene headline and body in SF Pro, a caption strip, a footer with
the QR code, both store badges and the site, and a HEL → HND progress track
under the header whose plane and flown line are one continuous clip drawn per frame at fractional positions (`trackStrip` in the panel module, laid over the finished film), so the motion is sub-pixel smooth rather than hopping a pixel every third frame. The footage, the
voice and the phone's position are untouched, so a re-render needs only the
copied `raw/` and `audio/` folders of the cut it restyles:

```bash
export DEMO_OUT="$PWD/scripts/shipaton-demo/output/story-v2" \
       DEMO_BOARD=storyboard-story.json DEMO_STYLE=story \
       DEMO_FINAL=flyright-maja-1m59s.mp4
node scripts/shipaton-demo/render.mjs prepare
node scripts/shipaton-demo/render.mjs render   # skip `voice`: audio/ is copied
node scripts/shipaton-demo/verify.mjs
```

`output/story-v2/` holds that render of the Maja cut; the first look stays in
`output/story/`. The renderer now asserts the final frame size — an overlay
chain with its inputs the wrong way round once produced a 34 × 34 film that
decoded and concatenated without complaint.

### The lock-screen date

The simulator's Lock Screen read "Sat 1. Jan" above a 24 September flight in
`01-morning`. The `story-v2` copy of that clip is patched rather than reshot:
`fixes/lock-screen-date.mjs` builds a mask of the old glyphs (bright pixels
in the date's box, dilated 3 px), ffmpeg's `removelogo` rebuilds the wallpaper
under them, and "Thu 24. Sep" is drawn in SF Pro Text at the measured cap
height, colour and centre and overlaid on every frame. A box erase (`delogo`)
was tried first and smeared the wallpaper's swirl. The untouched clip stays
beside it as `raw/01-morning-sat1jan.bak.mp4`; the mask and text layers are
in `fixes/`.

### v3: dissolves and a clock that follows the day

`output/story-v3/` is v2 with two more passes, saved beside it rather than
over it (the user keeps v2). `DEMO_XFADE=0.5` makes the renderer dissolve
each scene into the next: every segment but the last is extended by holding
its final frame for the dissolve, the video is an xfade chain over those held
segments, and the audio is the original segments trimmed to their scene
lengths and concatenated, so the narration keeps the hard cut's timing and
the film stays 119 s. `fixes/status-bar-time.mjs` rewrites the status-bar
clock in the seventeen app clips (the Lock Screen keeps its own) to a
schedule that reads off each screen — 1.04 at the airport before a 1:55 PM
departure, 7.42 to 7.58 in the air, 4.36 to 4.47 in Tokyo — erasing the
old clock and the screen-recording pill with `removelogo`, redrawing the
plain Dynamic Island, and drawing the time in the override's SF Pro style,
black once the boarding pass turns the bar white. The seven pill clips are
1180 × 2556 rather than 1206 × 2622, so the layers scale per clip.

```bash
SRC=$PWD/scripts/shipaton-demo/output/story-v2/raw \
DST=$PWD/scripts/shipaton-demo/output/story-v3/raw \
node scripts/shipaton-demo/fixes/status-bar-time.mjs
export DEMO_OUT="$PWD/scripts/shipaton-demo/output/story-v3" \
       DEMO_BOARD=storyboard-story.json DEMO_STYLE=story \
       DEMO_FINAL=flyright-maja-1m59s.mp4 DEMO_XFADE=0.5
node scripts/shipaton-demo/render.mjs prepare && node scripts/shipaton-demo/render.mjs render
node scripts/shipaton-demo/verify.mjs
```

`DEMO_SCENES=none` skips the per-scene renders and only re-assembles.

### v4: ElevenLabs narration and a music bed

`output/story-v4/` is v3 with a new voice and music. `DEMO_TTS=elevenlabs`
speaks through the ElevenLabs API (`ELEVENLABS_API_KEY` in `.env.local`;
`DEMO_VOICE` a premade voice's first name or an id, `DEMO_MODEL` defaults to
`eleven_multilingual_v2`), fits each scene through the voice's `speed`
setting, caches every request under `audio/cache/` so re-runs are free, and
keeps the returned character alignment so each caption appears with its
first spoken word and leaves after its last. `DEMO_MUSIC=<file>` lays a bed
under the narration in the final assembly: trimmed, faded, levelled to
`DEMO_MUSIC_LUFS` (default -29) and ducked a few dB by a sidechain compressor (`DEMO_DUCK_THRESHOLD` 0.2, `DEMO_DUCK_RATIO` 2.5; the first setting muted it) keyed
on the voice. The v4 bed is `music/bed.mp3`, 121 s composed by ElevenLabs
Music from a prompt (soft piano and pads, no vocals). v4 uses Eric (stability 0.6, style 0 — Brian read as too stern; his cut is kept in Downloads as v4-brian). The close is a six-second scene (a second each from the poster and Updates scenes) read as three beats from a `speech` script with ElevenLabs pause tags, pinned at `voiceSpeed` 0.9 with its own `voiceSettings`; the caption keeps the plain `narration`.

```bash
export ELEVENLABS_API_KEY=$(grep '^ELEVENLABS_API_KEY=' .env.local | cut -d= -f2)
export DEMO_OUT="$PWD/scripts/shipaton-demo/output/story-v4" \
       DEMO_BOARD=storyboard-story.json DEMO_STYLE=story \
       DEMO_FINAL=flyright-maja-1m58s.mp4 DEMO_XFADE=0.5 \
       DEMO_TTS=elevenlabs DEMO_VOICE=Eric \
       DEMO_MUSIC="$PWD/scripts/shipaton-demo/output/story-v4/music/bed.mp3" DEMO_MUSIC_START=3.8
node scripts/shipaton-demo/render.mjs prepare
node scripts/shipaton-demo/render.mjs voice
node scripts/shipaton-demo/render.mjs render
node scripts/shipaton-demo/verify.mjs
```

The v4 storyboard runs 118 s: the plans scene lost the second of silence after "cancel anytime", and `verify.mjs` now checks the film against the storyboard's `duration` rather than a fixed 119 s. A full voice pass costs about 4,400 credits. ElevenLabs is also in the
Stripe Projects catalog, but provisioning it there failed twice with a 403
from the provider; the key came from the user's own Creator account.

### v5: the film of Maja's day

`output/story-v5/` is v4 plus a film window in the panel: `DEMO_MOVIE=1`
gives the panel's middle to a 1154 × 500 window and keeps one headline line
under it (`panel-story.mjs` → `movieBackground`); the renderer plays
`movie/<scene id>.mp4` in that window, cropped to fill, cut or slowed by up
to a quarter to the scene's length, under a rounded mask. Scenes without a
clip keep the empty window. `storyboard-movie.json` holds the shot list —
one cinematic prompt per scene following the narration (home, taxi,
terminal, security, gate, seat, the postcard, Haneda, the delay, Tokyo at
dawn, her people at home) plus the style line and Maja's description.
`movie.mjs` generates the clips through ElevenLabs' media API
(`POST /v1/flows/video`, Seedance v2.5 by default or Veo 3.1 via
`DEMO_VIDEO_MODEL`), with a character sheet made from `brand/maja-avatar.png`
as the subject reference; `--probe` does one scene and reports its credit
cost. The API needs the Pro plan (Creator answers `paid_plan_required`), and
the API key's own credit quota must be lifted or raised (the default
50,000 cap stopped the first batch). ByteDance's Seedance models are
disabled per workspace until support enables them, so v5 used Veo 3.1 at
720p: about 11,500 credits per 8-second clip, 23 clips including five
retakes, roughly 300,000 credits in all. Lessons: scenes without Maja
(the exterior of the plane, her people at home) are listed in
`noCharacter`, because with the reference image the model puts her into
every shot; Google's filter blocked a shot with a child in it, so the
friends are adults only. Rejected takes stay in `movie/rejected/`. Clips
made elsewhere can be dropped into `movie/` under the scene ids.

```bash
export ELEVENLABS_API_KEY=$(grep '^ELEVENLABS_API_KEY=' .env.local | cut -d= -f2)
export DEMO_OUT="$PWD/scripts/shipaton-demo/output/story-v5" DEMO_BOARD=storyboard-story.json \
       DEMO_STYLE=story DEMO_MOVIE=1 DEMO_FINAL=flyright-maja-1m58s.mp4 DEMO_XFADE=0.5 \
       DEMO_TTS=elevenlabs DEMO_VOICE=Eric DEMO_MUSIC="$DEMO_OUT/music/bed.mp3" DEMO_MUSIC_START=3.8
node scripts/shipaton-demo/movie.mjs --probe     # then without --probe
node scripts/shipaton-demo/render.mjs prepare && node scripts/shipaton-demo/render.mjs render
node scripts/shipaton-demo/verify.mjs
```

### v6: hand-picked Seedance clips

`output/story-v6/` is v5 with the film window fed from clips the user
generated and picked by hand (Seedance, 1280 × 720 at 24 fps), dropped into
`~/Downloads/scenes/` under the scene ids and copied to `movie/`. The
storyboard folds the old `07b-world` beat into the 11-second `07-globe`
scene, so that scene's clip is the two shots joined with a plain cut —
`07-globe-solo.mp4` (the plane crossing the sky) then `07b-world.mp4` (the
fly-by and Maja at the window) — and, at about 10 s together, the renderer
slows the pair rather than cutting either. If a longer pair ever needs a
trim, take it from the first shot, never from 7b. The join is video-only;
the renderer never uses a clip's audio:

```bash
cd scripts/shipaton-demo/output/story-v6/movie
ffmpeg -y -i 07-globe-solo.mp4 -i 07b-world.mp4 -filter_complex \
  "[0:v]fps=24,scale=1280:720,setsar=1,format=yuv420p[a];[1:v]fps=24,scale=1280:720,setsar=1,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -an -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart 07-globe.mp4
DEMO_SCENES=07-globe,14-plans node scripts/shipaton-demo/render.mjs render   # with the v5 env, DEMO_OUT=…/story-v6
```

Replaced clips go to `movie/previous/` rather than being deleted. The
26 September pass swapped 7, 7b and 14 (the ramen shop) this way.

### v7: second round of hand-picked clips

`output/story-v7/` is a copy of v6 with four clips swapped for the user's
retakes from `~/Downloads/scenes/` — 01-morning, 03-steps, 08-postcard and
17-close (the close came in at 8 s and was cut to its first 6 s; the last
two seconds were unwanted). A later retake of 02-terminal (7 s) replaced the
5-second clip the renderer had been slowing by a third. The v6 clips are kept in `movie/previous-v6/`.
Only those four scenes were re-rendered (`DEMO_SCENES=…` with the v5 env and
`DEMO_OUT=…/story-v7`); the render phase reads the cached voice timings, so
no ElevenLabs credits are spent.

### v8: flags on the route row

`output/story-v8/` is v7 with Finland's and Japan's flags beside HEL and
HND in the panel's route row (`routeEnds()` in `panel-story.mjs`: vector
flags at true proportions, 16 px tall, on the outer side of each code; the
track now runs 194–1152 so the plane clears both codes). Footage, phone
captures and voice are v7's. Panel changes need `render.mjs prepare`
(it draws `graphics/<scene>.png`) before `render`; `render` alone reuses the
old backgrounds. `prepare` also rewrites NARRATION.md and TIMELINE.md.

### v9: the belt scene gets a lead-in

`output/story-v9/` is v8 with a new 12-belt clip: the first 2 s of
`belt_pre_walk.mp4` (the Belt 12 screen in her hand) then `12-belt.mp4` from
1.0 s on, joined video-only like 07-globe (6.04 s, so nothing is slowed).
The trim comes off the start of the walk, never the arrival at the belt.
The v8 clip and the pre-walk source are in `movie/previous-v6/`.

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
