# LinkedIn post — iOS 27, the reworked app, postcards and the sun switch

Video (the one to post): `demo/out/ios27/flyright-ios27.mp4` — 33 s, 1080 × 1350, in the same frame as the globe and Detour posts: Shanavas's iPhone 15 Pro screen recording from 2026-09-21 (`~/Downloads/ScreenRecording_09-21-2026 8-24-42 pm_1.MP4`, footage untouched, 1×, start to end, muted) on the left, and on the right "New in 1.1" with Flights first / Updates & postcards / A sun-lit World, each lit while it is on screen; QR and store badges at the bottom. Cover: `flyright-ios27-cover.png`. Copies in `~/Downloads/flyright-ios27-demo-2026-09-21/`. Re-render: `node scripts/ios27-demo/render.mjs` (README beside it). The phone is signed in as the store profile Maja Lindqvist with synthetic friends (Noah, Clara, Tomas).

What the clip shows, in order: Flights ("Welcome back, Maja", tomorrow's AY1331 live card counting down to the second) → the trip page (one card: terminal, check-in, gate, boarding, seat, booking, baggage) → the boarding pass → trip progress → Travel stats → **Updates** (friends rail with progress rings, postcards with hearts and replies, a postcard full screen, Noah's in-flight status sheet) → Friends (live cards) → **World**, with the sun switch turning day and night on and off, then Recenter.

Status when written (2026-09-21): 1.1.1 is live on Google Play production; on iOS it is in App Review (App Store still serves 1.0.38). Post after Apple approves it, or keep the "in review" wording below.

---

FlyRight is built with the iOS 27 SDK — the build Apple is reviewing now is the first one.

Apple will require the iOS 27 SDK for every App Store upload from April 2027. There is a catch that doesn't show up until you try it: once an app links against iOS 27, the UIKit scene lifecycle is no longer optional. We measured both ways on an iOS 27 simulator. Without it, the same binary doesn't even launch — "UIScene life cycle is required for apps built with this SDK". With it, every tab comes up.

I had pencilled this in for the Expo SDK 58 upgrade. It turned out not to need one: Expo backported scene support to SDK 57, and it is a single line in app.json (expo-build-properties → ios.enableSceneSupport). Prebuild rewrites the AppDelegate and adds the scene manifest for you.

The one thing missing is a cloud image: EAS Build has no Xcode 27 yet. So the iOS build runs on my Mac with eas build --local, using the same remote credentials and build numbers as the cloud, and eas submit uploads the IPA. Apple processed it as valid on the first try. Android stays on EAS cloud and is already live.

And since a new SDK is a good excuse, the app got reworked too. What you see in the video:

Flights opens on your own trip. It greets you by name and puts tomorrow's flight at the top, counting down to the second, with the gate, seat and booking all in one place on the trip page.

Updates is new: the friends who are in the air, with a ring showing how far along each one is, and the postcards they send from the window seat. Every postcard shows the flight and where it was sent from, and you can heart it or reply to it.

The World tab's globe is lit by the real sun, day and night where they are right now. The sun button in the header switches it off when you just want your routes.

Built with Expo and React Native.

#FlyRight #iOS27 #Expo #ReactNative #EAS #BuildInPublic #Shipaton
