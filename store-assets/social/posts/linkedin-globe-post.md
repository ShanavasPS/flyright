# LinkedIn post — the World tab globe (react-native-skia)

Video (the one to post): `demo/out/globe/flyright-globe-phones.mp4` — 26 s, 1080 × 1350, two real iPhone 15 Pro screen recordings side by side (dark on the left, light on the right, both hand-driven by Shanavas on 2026-09-18, signed in as the demo account), no captions (the bottom band is the download QR and store badges), works muted. Cover: `flyright-globe-phones-cover.png`. The simulator cut `flyright-globe.mp4` (34 s, one phone, scripted) is the alternative. Recipe in `scripts/globe-demo/README.md`.

---

react-native-skia by Shopify, Reanimated and Gesture Handler by Software Mansion, all inside an Expo app: that is the whole stack behind FlyRight's new World tab. The map is gone, and the globe is the map.

Why replace a map at all? Zoom out on your travels in any map app and it stops you at about a hemisphere. That is not a bug anyone can fix for you: MapKit and Google Maps both have a floor on how far out a map can go, and the react-native-maps issue asking to lift it is closed as "not planned". We wanted the whole planet with your routes on it.

Tap a trip and it opens on its own route, drawn on the globe. Tap the inset and World frames that flight; pinch out and the whole planet is there, flick it and it keeps turning. All travels puts every trip back on the sphere, and it looks the same in dark mode as in light, because the shader paints whatever colours the theme hands it.

For fellow developers, the shape of it:

The earth is one Skia runtime shader. For every pixel: view ray → does it hit the sphere → rotate into the globe's frame → latitude and longitude → sample a land mask → the theme's sea and land colours, a little lighting, a glow at the limb. Routes, airports and the planes on them are Skia paths built in Reanimated worklets, and the gestures are Gesture Handler's, so pan, pinch and tap never touch the JavaScript thread. The textures come from Natural Earth through a small sharp script: a 50 m base that is always loaded, 10 m coastlines as eight 2048² tiles and country borders as two more, all alpha-only, decoded once and faded in as you zoom.

Three decisions I'd make again:

Skia over a map SDK or a GPU framework. One dependency, the same code on iOS and Android, and a shader small enough to read in one sitting.

Masks instead of imagery. An alpha-only tile is 4 MB and takes whatever colours the theme hands it — dark mode cost nothing.

Mipmaps off. Derivative-based level of detail drew a dotted seam down the antimeridian where the texture wraps. Sampling the one level and letting the tiles carry the detail fixed it. (Related lesson from the texture script: unwrap the polygon rings past ±180° and stamp the drawing three times, or Antarctica breaks and a band appears across Siberia.)

Another little look inside FlyRight, built with Expo and React Native.

#FlyRight #Expo #ReactNative #Skia #Shopify #SoftwareMansion #Reanimated #BuildInPublic #Shipaton
