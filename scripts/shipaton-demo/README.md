# FlyRight Shipaton demo

The revised deliverable is `output/ios26/flyright-shipaton-1m59s.mp4`: a 119-second, 1920 × 1080 video recorded in a **new iPhone 17 Pro simulator running iOS 26.5 (23F77)**. The native floating tab bar and glass controls come from the running app. The display keeps its original aspect ratio inside a rounded screen mask, slim metal bezel, and side buttons, with the complete phone visible. English synthesized narration and captions sit beside the app. H.264 video and AAC audio are suitable for uploading to YouTube or Vimeo. The same output folder contains editable captions (`flyright-shipaton.srt`), narration (`voiceover.wav`), and capture metadata (`capture.json`). The earlier iOS 18 export remains in `output/`.

The story follows a traveller: add a flight → travel day → people → world and stats → journal → compensation example → Pro plans. See [the timed narration](NARRATION.md), [the shot timeline](TIMELINE.md), and [the editable storyboard](storyboard.json).

The closing scene targets the **RevenueCat Design Award** as an editorial default. Replace that scene's category and narration if your submission targets a different award. The video shows the real RevenueCat paywall and plan selection; it does not show a completed transaction. The compensation scene uses the app's built-in demo verdict. The journeys and account shown are the simulator's existing sample data. No claim is submitted and no invitation is sent by the flow.

## Re-record

Use a populated iOS 26 or later simulator, with the app past onboarding. This recording uses the local Release build of FlyRight 1.0.31 (44), built with the iOS 26.5 SDK and bundled JavaScript. Its API origin points to Metro on localhost:8081, which must remain running for API requests. The current flow expects a travel-day hero with today's itinerary and the existing `demo-dxb` journey with notes. The existing Dee test account supplies the sample journeys and circle. The new simulator's sample departure time and travel stages were prepared locally, backed up first, and marked synced so the fixture edits do not upload. Refresh those fixtures for a later recording; the capture flow deliberately does not seed or clear application data.

```bash
xcrun simctl list devices booted
DEMO_DEVICE=29707CA2-66F4-4475-BD93-DAE3BC6F8613 \
DEMO_HIDE_LOADING=0 \
DEMO_OUT="$PWD/scripts/shipaton-demo/output/ios26" \
bash scripts/shipaton-demo/record.sh
```

Always use an explicit UDID when multiple simulators are running. The script sets a clean 9:41 status bar and clears that override when it finishes. Each scene has its own MP4 and still image, making individual retakes easy. The [Maestro flow](../../.maestro/shipaton-demo.yaml) performs the taps, typing, scrolling, assertions, and local recordings.

For a development build, the script uses LLDB to temporarily disable React Native's loading overlay in the simulator process, then restores it on exit. This fixes a recording-only blue “Refreshing…” banner that can be absent from screenshots. It changes no app source or stored data. For a Release build, set `DEMO_HIDE_LOADING=0` to skip the debugger step. On a new Mac, debugger access may require system permission.

Keep Metro and the app source stable while recording. Do not run a second automation session on the same simulator during capture. Recordings omit navigation/loading between scenes and retain actual interactions within them. The editor fits long clips to their chapter and holds the final frame of shorter clips.

## Build or revise the edit

Dependencies: Node with the repository's `sharp` package installed, macOS `say`, and FFmpeg compiled with `libx264`, `libass`/the `subtitles` filter, and AAC. The renderer detects the FFmpeg binary available on the original recording machine; use `FFMPEG=/absolute/path/to/ffmpeg` to override it. Some minimal FFmpeg distributions omit subtitles support.

```bash
export DEMO_OUT="$PWD/scripts/shipaton-demo/output/ios26"
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
