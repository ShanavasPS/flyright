# Share poster heat layer demo (TypeGPU)

A 17-second, 1080 × 1350 feed video for LinkedIn: one iPhone 15 Pro screen
recording (Shanavas, 2026-09-21, store profile Maja Lindqvist) played at 1×:
World → Share → Heat on/off, Dark/Light, Story/Square → Share image → the
iOS share sheet. It sits in the globe/Detour frame with a "How it's made"
column whose three items light up with the footage.

**Privacy:** the share sheet's contact row shows the phone owner's real
contacts. `render.mjs` box-blurs it (`blurs`, source pixels) from 15.38 s, with
a taller band while the sheet animates in. A new recording needs its own
times and boxes; check every frame of the pop-in (`fps=30,tile`) before posting.

```sh
mkdir -p demo/out/heat
cp ~/Downloads/ScreenRecording_09-21-2026*8-49-21*.mov demo/out/heat/source.mov   # U+202F before "pm"
node scripts/heat-demo/render.mjs
```

Output (gitignored): `demo/out/heat/flyright-heat.mp4` + cover PNG. Post
draft: `store-assets/social/posts/linkedin-heat-post.md`.
