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

## Two phones (third cut, the one to post)

`flyright-deferred-link-two-phones.mp4` — 38 s, Daniel's simulator on the
left, Emma's on the right, the live side lit and the other dimmed, so the
hand-off from one phone to the other is unmistakable. Renderer
`render2.mjs`, scenes in `edit2.json` (each phone per scene: clip segments
sped to fit, a still lifted from a recording, or a PNG).

Story: Daniel invites and sends (left, `01-invite.mp4`) → Emma taps the link
Daniel sent (it sits in Reminders: the simulator has no Notes and Messages
cannot receive) → web invitation → App Store → Detour → install → first
launch lands on the invitation → sign in (Clerk test user
`emma+clerk_test@example.com`, OTP 424242, profile "Emma Laurent" + Unsplash
portrait `1494790108377-be9c29b29330` set afterwards through Edit profile) →
"Waiting for Daniel" → her People tab shows Daniel "Asked to follow" (right,
`10-invitee.mp4`, one 165 s take: `invitee-link.yaml`, `simctl install`,
`invitee-launch.yaml` under `simctl io recordVideo`) → Daniel's People tab
shows "Emma · opened your invite link" → Allow → Followers 1 (left,
`allow.yaml` → `11-allow.mp4`). Recorded 2026-09-16 on a fresh "FlyRight
Invitee" simulator (`invitee-udid.txt`); Detour matched the install again.

Then the loop closes both ways (`follow-back.yaml` → `14-follow-back.mp4`,
Emma's Allow under `simctl io recordVideo` → `16-emma-allow.mp4`,
`mutual.yaml` → `18-mutual.mp4`): Daniel taps Follow back → "Requested",
Emma's Followers tab shows "Daniel wants to follow your trips" → Allow →
"You follow each other", and the last scene lights both phones: Daniel's
Following tab with Emma, Emma's Followers tab with Daniel. Daniel and Emma
now follow each other on production. Row chips are merged into one
accessibility element on iOS, so those taps are by position.

The store and install beats on Emma's side are the iPhone 15 Pro frames
(`phone-flow.mp4`, scenes `04b-get` and `05-install`): the simulator cannot
show the App Store, the phone can — so the cut goes simulator landing → real
App Store listing → cloud re-download → Open → simulator splash/intro. The
phone's status bar (11:29, "◀ Safari") differs from the simulator's 9:41 for
those five seconds.

Simulator gotchas: system alerts (dictation, "Open in FlyRight?") swallow
Maestro taps and my own point taps kept re-triggering the mic; the Reminders
link is not a text element (tap by position); `openLink` on an app already in
front raises the Open-in dialog — navigate through the tab bar instead.

## The physical iPhone (second cut, same day)

The store and first-launch scenes were re-shot on Shanavas's iPhone 15 Pro
(iOS 26.0.1) after the user deleted FlyRight from it. Capture =
`testCaptureDemoFrames` in `tests/physical-ios/FlyRightPhysicalUITests.swift`:
an XCTest that opens the invite link, taps App Store on the landing, the store
button (GET, or the cloud re-download icon by position), Open, Skip and Allow,
taking a full-screen frame every 0.35 s the whole way; frames come out of the
result bundle with `xcrun xcresulttool export attachments`. Run over Wi-Fi
(USB tunnels fail on this Mac):

```sh
OUT=".maestro/out/physical-ios-detour-demo-$(date -u +%Y-%m-%dT%H-%M-%SZ)"; mkdir -p "$OUT"
TEST_RUNNER_FLYRIGHT_OPEN_URL=https://getflyright.com/i/<token> xcodebuild test \
  -project tests/physical-ios/FlyRightPhysicalUITests.xcodeproj -scheme FlyRightPhysicalUITests \
  -destination 'platform=iOS,id=00008130-0008642C0204001C' -parallel-testing-enabled NO \
  -only-testing:FlyRightPhysicalUITests/FlyRightPhysicalUITests/testCaptureDemoFrames \
  -derivedDataPath "$OUT/build" -resultBundlePath "$OUT/results.xcresult" DEVELOPMENT_TEAM=7NNC4W2FUU
xcrun xcresulttool export attachments --path "$OUT/results.xcresult" --output-path "$OUT/attachments"
```

On 2026-09-16 11:29 the whole chain ran in 30 s: landing → Detour → App Store
listing → cloud re-download (no Face ID for a previously downloaded free app)
→ Open → intro → Skip → tracking prompt → "Daniel invited you to follow their
trips" with a live "Follow Daniel's trips" button. Detour matched the install
on the real phone too. Frames are index-based at 3 fps in `phone-flow.mp4`
(`phone-frames/`); `phone-invitation.png` is the closing still. QuickTime /
ffmpeg screen capture of the phone over USB never exposed the device, so
frames it is.

Two earlier runs were discarded: in one nobody tapped and the phone locked
(lock-screen frames with notification previews — deleted, nothing kept); in
the other the GET query never matched the cloud icon (its clean store frames
are `phone-store/`, later frames with message banners deleted). The kept
frames show only Safari on the invitation, the App Store listing and FlyRight.

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
