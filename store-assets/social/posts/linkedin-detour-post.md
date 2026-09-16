# LinkedIn post — deferred deep links with Detour

Video: `demo/out/detour/flyright-deferred-link.mp4` (20 s, 1080 × 1350, captions burned in, works muted). Cover: `flyright-deferred-link-cover.png`.

---

Your friend sends you a link to follow their trips. You don't have the app yet.

Tap the link. Install FlyRight from the store. Open it — and it opens on their invitation. Their photo, their name, one button to follow.

No "paste the link again". No "search for Daniel". The link survived the trip through the App Store.

This is deferred deep linking, and in FlyRight it runs on Detour by Software Mansion.

For fellow developers, the shape of it:

The invite link is a normal https link on our own domain. On a phone without the app, the web landing's store button goes through Detour, which records the click and redirects to the App Store or Google Play. On first launch the Detour SDK asks once whether a recent click matches this install — the install referrer on Android, a device fingerprint on iOS — and hands the app the path. Expo Router pushes it, the intro is skipped, and the invitation is on screen.

Three decisions I'd make again:

Deferred only. Universal links and app links still go straight through Expo Router; Detour only handles the "not installed yet" case.

An allowlist for what a deferred link may open: invite pages and shared trips. The destination comes from a server, so the app never lets it pick an arbitrary screen.

Never depend on the match. Fingerprinting can miss. So the landing page also offers "already have FlyRight? Open the invitation", and the People tab has "paste an invite link". Detour makes the good path great; the fallbacks make sure nobody is stranded.

Built with Expo and React Native. Another little look inside FlyRight.

#FlyRight #Expo #ReactNative #SoftwareMansion #Detour #BuildInPublic #Shipaton
