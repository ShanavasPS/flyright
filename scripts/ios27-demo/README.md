# iOS 27 + 1.1 rework demo

A 33-second, 1080 × 1350 feed video for LinkedIn: one iPhone 15 Pro screen
recording (Shanavas, 2026-09-21, signed in as the store profile Maja
Lindqvist) played untouched at 1×. Flights → trip page → pass → Travel stats
→ Updates and postcards → Friends → World with the sun switch. It sits in the
globe/Detour frame with a "New in 1.1" column whose three items light up with
the footage (times read off a 1 fps contact sheet, in `render.mjs`).

```sh
mkdir -p demo/out/ios27
cp ~/Downloads/ScreenRecording_09-21-2026*pm_1.MP4 demo/out/ios27/source.mp4   # U+202F before "pm"
node scripts/ios27-demo/render.mjs
```

Output (gitignored): `demo/out/ios27/flyright-ios27.mp4` + cover PNG. Post
draft: `store-assets/social/posts/linkedin-ios27-post.md`.
