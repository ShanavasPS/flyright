# LinkedIn post — the travel-day Live Activity (iOS) and Live Update (Android), and how OneSignal fits in

Two videos, 20 s each, 1080 × 1350, muted, in the globe/Detour frame with a
five-step column ("Departs in → Boarding → On board → Lands in → Landed")
that lights up with the beat:

- `demo/out/live-activity/flyright-live-activity-ios.mp4` — iPhone 18 Pro
  simulator, iOS 27.0, Release 1.1.4 (67): Lock Screen card → unlock →
  compact Dynamic Island → expanded island, five times.
- `demo/out/live-activity/flyright-live-activity-android.mp4` — "Galaxy
  S26 Ultra" emulator (a Samsung-sized device definition, 6.9", FHD+, stock
  Android 17 preview image; One UI cannot be emulated): launcher with the
  status-bar chip → notification shade → Lock Screen, five times.

Every frame is the real widget / notification drawn from seeded data; the
countdowns tick on the device. Covers: `…-ios-cover.png`, `…-android-cover.png`.
Re-render: `node scripts/live-activity-demo/render.mjs ios|android`
(shooting script and retake recipe in `scripts/live-activity-demo/SCRIPT.md`).
Post as one post with both videos (iOS first), or two posts a day apart.

---

Your flight, on the Lock Screen, without opening the app. This is FlyRight's travel day on iPhone and on Android, and the part I want to say out loud: OneSignal powers both the Live Activity and every push notification in the app, and it has been a breeze.

One card carries the whole day. Before the flight it counts down to departure, with the gate and the boarding time beside the clock. When boarding opens, the label turns green and the gate is the only fact you need. Once you are on board, the seat takes its place. In the air the clock counts to landing and the plane rides the route line. After touchdown it shows the landing time and the baggage belt, and then it retires on its own.

For fellow developers, how it is wired:

The iOS card is a Live Activity, and OneSignal does the heavy lifting. Its SDK starts the activity on the phone and owns the push tokens, so the widget is one SwiftUI file in a widget extension and there is no token plumbing of our own. When the app is closed, our Convex backend can start the activity remotely with push-to-start, and from then on every change reaches the Lock Screen and the Dynamic Island through OneSignal's Live Activities API and APNs. A gate change or a delay arrives as a push, not a poll. The countdown itself ticks on the phone from a timestamp in the content, so nothing is sent per minute and it keeps running in airplane mode.

Android 16 draws the same content as a Live Update, the promoted notification with the status-bar chip, from a small native Expo module. There OneSignal is the push layer around it, the same one that carries every other notification FlyRight sends: the people following your trip hear about boarding and landing, a photo shared from a trip reaches them, a follow request or a support reply lands as a push, and a new release announces itself once. Users are identified by an external id mirrored from the sign-in session, segments come from tags the app sets from your trip schedule, and rich pushes go through the notification service extension. All of that was the boring part, which is the highest praise I have for an SDK.

Same trip, same facts, two very different surfaces. Built with Expo and React Native.

#FlyRight #OneSignal #LiveActivities #ActivityKit #Android16 #LiveUpdates #Convex #Expo #ReactNative #BuildInPublic
