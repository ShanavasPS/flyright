# Deferred deep link demo (Detour)

A 20-second, 1080 × 1350 feed video for LinkedIn: someone invites a friend to
follow their trips, the friend has no app, installs it from the link, and the
first launch opens on that invitation. The deferred link is
[Detour by Software Mansion](https://godetour.dev); the app-side wiring is in
`src/components/deferred-link-router.tsx` and `src/services/deferred-links.ts`
(design notes in the file comments and in the web landing's `AppHandoff`).

Output (gitignored): `demo/out/detour/flyright-deferred-link.mp4`, the
`.srt` captions and a cover PNG. The post draft is
`store-assets/social/posts/linkedin-detour-post.md`.

## What was recorded (2026-09-16, iOS 26.5 simulators, FlyRight 1.0.35 (52) Release)

Two phones, both iPhone 17 Pro simulators, both real:

- **The inviter** — the "FlyRight Demo" simulator
  (`C4BEEE4E-D066-45B1-AEEF-120A9A838CCF`), signed in to the demo account
  `shipaton+clerk_test@example.com` (Clerk prod user
  `user_3JOqVYYtyVX2rUg8gTgGHkDb5Ub`, shown as **Daniel Reyes** with a stock
  portrait — see below). `invite.yaml`: People → Invite someone → Send →
  share sheet. `createInvite` reuses the open invite, so the token
  (`demo/out/detour/token.txt`) stayed the same across retakes.
- **The invitee** — a fresh simulator that never had the app. `landing.yaml`
  opens `https://getflyright.com/i/<token>` in Safari, scrolls to the store
  card and taps App Store. That goes to `flyright.godetour.link/…/i/<token>`,
  where Detour records the click and redirects to the App Store. The
  simulator has no App Store: `itms-apps:` fails with "Safari cannot open the
  page", so the scene ends on Detour's interstitial (app icon, "FlyRight:
  Flight Tracker"), just before the alert.
  Then `xcrun simctl install <udid> demo/out/detour/FlyRight.app` (the
  Release bundle copied out of the Demo simulator) and `first-launch.yaml`,
  recorded with `xcrun simctl io <udid> recordVideo`: Home → FlyRight icon →
  intro → Skip. On that first launch the Detour SDK matched the install to
  the click (IP + device fingerprint, 15-minute window: click 07:14 UTC,
  launch 07:15 UTC) and the router pushed `/i/<token>` — the invitation with
  the inviter's photo and name, no paste, no search. The ATT prompt then
  covered it; the still used for the last scene is the same page after
  "Allow" (`09-invitation.png`).

The match is the one thing this demo could not fake: the app has no other way
to know the token on a fresh install. (The app deliberately does not rely on
it in production — a real iOS install missed once on 2026-09-06 — which is why
the landing also offers `flyright://` and People has "paste an invite link".)

## Retake

```sh
# Inviter (signed-in demo sim; leaves the link on the pasteboard via Copy)
maestro --device C4BEEE4E-D066-45B1-AEEF-120A9A838CCF test \
  -e OUT="$PWD/demo/out/detour" scripts/detour-demo/invite.yaml
npx convex data circleInvites --prod --limit 3 --order desc   # the token

# Invitee: a NEW simulator each time (Safari remembers the store tap per path,
# and the Detour SDK asks once per install)
U=$(xcrun simctl create "FlyRight Invitee" "iPhone 17 Pro" com.apple.CoreSimulator.SimRuntime.iOS-26-5)
xcrun simctl boot $U && xcrun simctl status_bar $U override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
# open any page once and dismiss Safari's first-run tip (tap its ×) before recording
maestro --device $U test -e OUT="$PWD/demo/out/detour" -e LINK=https://getflyright.com/i/<token> scripts/detour-demo/landing.yaml
xcrun simctl io $U recordVideo --codec h264 --force demo/out/detour/03-first-launch.mp4 &   # Ctrl-C / SIGINT to stop
xcrun simctl install $U demo/out/detour/FlyRight.app
maestro --device $U test -e OUT="$PWD/demo/out/detour" scripts/detour-demo/first-launch.yaml

node scripts/detour-demo/render.mjs     # cuts in edit.json; a scene may be a clip or a still (`image`)
```

Gotchas met on the way: Maestro's "Copy" / "Invite someone" text matches are
flaky (the share sheet lives in another process; the pitch card loads late) —
the flows use regexes, long waits and one point tap. `recordVideo` emits frames
only when pixels change, so a static screen makes a 2-frame file; stills go in
as PNGs. The invitee simulator keeps a "maestro-driver" icon next to FlyRight
on the Home screen; the install scene is kept short because of it.

## The demo account

The Clerk user behind `shipaton+clerk_test@example.com` had been deleted, so
the sign-in helper created it again (Clerk test address, OTP 424242). It was
named **Daniel Reyes** and given a stock portrait through the app's own
Settings → account → Edit profile (the Clerk CLI cannot upload images):
Unsplash photo `1507003211169-0a1dd7228f2d`
(https://unsplash.com/photos/1507003211169-0a1dd7228f2d, Unsplash licence),
added to the simulator with `xcrun simctl addmedia`. Clerk's `user.updated`
webhook carried the new name and image to Convex within seconds, so the web
landing, the in-app invitation and the share-sheet text all say Daniel.

Not changed: the People tab's empty-state illustration still uses the
initial-letter avatars ("A M J") — that is product UI, not a profile picture.
