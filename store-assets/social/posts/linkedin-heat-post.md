# LinkedIn post — the share poster's TypeGPU heat layer, and how the image is shared

Video (the one to post): `demo/out/heat/flyright-heat.mp4` — 17 s, 1080 × 1350, in the globe/Detour frame: Shanavas's iPhone 15 Pro screen recording from 2026-09-21 (`~/Downloads/ScreenRecording_09-21-2026 8-49-21 pm_1.mov`, 1×, start to end, muted) on the left, "How it's made" on the right (Heat on the GPU / Two themes, two shapes / One tap to share), each lit while it is on screen. **The share sheet's contact row (real people's photos and names) is box-blurred** from the first frame the sheet appears; nothing else in the footage is changed. The account is the store profile Maja Lindqvist. Cover: `flyright-heat-cover.png`. Re-render: `node scripts/heat-demo/render.mjs`.

The poster and heat layer shipped in 1.0.38, which is live on both stores.

---

The glow on this travel poster is a GPU compute shader, written in TypeScript. TypeGPU by Software Mansion, running inside an Expo app.

FlyRight's World tab can turn your travels into a poster: story or square, dark or light, with your flights, airports, countries and hours in the air. The heat layer is what makes it yours. It glows where you fly most, so a route you take every month burns bright and a one-off trip stays a thin blue line.

That is a lot of maths per image: for every pixel, the distance to every route you have flown, turned into a soft glow and added up. It is exactly the kind of work a GPU is for.

For fellow developers, the shape of it:

Two compute passes, written as 'use gpu' TypeScript functions that unplugin-typegpu compiles to WGSL at build time. The first sums every route's glow into a density field and tracks the brightest pixel with an atomic max. The second exposes the field against that peak and colours it through the poster theme's ramp. Once-flown routes are capped at blue, so a journal of one-off trips doesn't turn green everywhere. react-native-webgpu runs it headless: no canvas, just a buffer read back to the CPU.

The read-back is the bit I'd point out. A screenshot library can't see into a Metal or WebGPU layer, so the heat never stays on the GPU. The pixels are saved as a PNG, and the poster draws that PNG with expo-image under its SVG route lines. From then on it is an ordinary view.

That keeps sharing boring, which is what you want. react-native-view-shot's captureRef renders the poster to a 1080-pixel-wide PNG with a readable file name, and shareAsync from expo-sharing, by Expo, hands it to the system share sheet. No GPU → the Heat switch simply isn't shown, and the poster is the plain atlas.

Another little look inside FlyRight, built with Expo and React Native.

#FlyRight #TypeGPU #WebGPU #SoftwareMansion #Expo #ReactNative #BuildInPublic #Shipaton
