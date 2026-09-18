# LinkedIn post — the World tab globe (react-native-skia)

Video (the one to post): `demo/out/globe/flyright-globe-phones.mp4` — 26 s, 1080 × 1350, two real iPhone 15 Pro screen recordings side by side (dark on the left, light on the right, both hand-driven by Shanavas on 2026-09-18, signed in as the demo account), captions burned in, works muted. Cover: `flyright-globe-phones-cover.png`; captions in `flyright-globe-phones.srt`. The simulator cut `flyright-globe.mp4` (34 s, one phone, scripted) is the alternative. Recipe in `scripts/globe-demo/README.md`.

---

Zoom out on your travels in any map app and it stops you at about a hemisphere. That is not a bug anyone can fix for you: MapKit and Google Maps both have a floor on how far out a map can go, and the react-native-maps issue asking to lift it is closed as "not planned".

We wanted the whole planet with your routes on it. So in FlyRight the map is gone, and the globe is the map.

Tap World and every flight you've saved is on one sphere, the comets are the flights still ahead of you. Flick it and it keeps turning. Double-tap and the coastlines sharpen and borders fade in. Tap a route and its flights dock below; open one and the trip page draws the same globe as its map.

It runs on react-native-skia by Shopify, inside an Expo app.

For fellow developers, the shape of it:

The earth is one runtime shader. For every pixel: view ray → does it hit the sphere → rotate into the globe's frame → latitude and longitude → sample a land mask → the theme's sea and land colours, a little lighting, a glow at the limb. Routes, airports and comets are Skia paths built in Reanimated worklets, so pan, pinch and tap never touch the JavaScript thread. The textures come from Natural Earth through a small sharp script: a 50 m base that is always loaded, 10 m coastlines as eight 2048² tiles and country borders as two more, all alpha-only, decoded once and faded in as you zoom.

Three decisions I'd make again:

Skia over a map SDK or a GPU framework. One dependency, the same code on iOS and Android, and a shader small enough to read in one sitting.

Masks instead of imagery. An alpha-only tile is 4 MB and takes whatever colours the theme hands it — dark mode cost nothing.

Mipmaps off. Derivative-based level of detail drew a dotted seam down the antimeridian where the texture wraps. Sampling the one level and letting the tiles carry the detail fixed it. (Related lesson from the texture script: unwrap the polygon rings past ±180° and stamp the drawing three times, or Antarctica breaks and a band appears across Siberia.)

Built with Expo and React Native; Reanimated and Gesture Handler by Software Mansion do the gestures. Another little look inside FlyRight.

#FlyRight #Expo #ReactNative #Skia #Shopify #SoftwareMansion #BuildInPublic #Shipaton
