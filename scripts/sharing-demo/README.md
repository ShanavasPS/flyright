# Share a ticket into FlyRight

The LinkedIn post is in `store-assets/social/posts/linkedin-sharing-post.md`.
Its technical claim is about Expo Sharing's capability: receiving compatible
files is supported on both iOS and Android in [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/).
FlyRight's Android intake migration remains future work. This task changes
the post and creates demo assets; it does not modify the app implementation.

The video is `demo/out/sharing/flyright-share-to-trip.mp4`: a 10-second,
1080 × 1350, H.264 edit with visible step captions, intended to work muted in
the LinkedIn feed. `flyright-share-to-trip.srt` contains editable captions.
The footage shows a real screenshot import through Photos' system share
sheet, followed by review, confirmation and the saved trip in My travels.
The sample PDF is supplied too; the filmed input is the PNG.

The cover and every video scene include a scannable QR code and the official
App Store / Google Play download badges. The QR encodes the existing smart link
`https://flyright.godetour.link/0tItTZgtyO`, which selects the appropriate store
on mobile. No new redirect service or website deployment is required.
The final distribution copies are `flyright-share-to-trip-10s-qr.mp4` and
`flyright-share-to-trip-cover-qr.png` in the output folder and the dated Downloads
folder. A standalone `flyright-download-qr.png` is generated too.

All four steps are also available as individual 1080 × 1350 PNG covers in
`demo/out/sharing/covers/`, numbered in upload order. Each includes the same
QR code and store badges. `flyright-four-steps-preview.png` previews the set;
`flyright-four-step-covers-qr.zip` packages the four full-size images.

## Capture

Recorded on 2026-09-14 in an isolated iPhone 17 Pro simulator named
`FlyRight Sharing Demo`, running iOS 26.5. Simulator UDID:
`7A99390E-323B-4594-A61D-A120020047D2`. The installed app is FlyRight 1.0.34
(51), using the existing local development binary and Metro on port 8081.
The sample is anonymous and local, with no account, live tracking, purchase,
invitation or claim submission. Existing phones and app installations were
preserved. This is a demo recording, not release-candidate verification.

`ticket.mjs` generates a synthetic Helsinki–London receipt in PDF and PNG
formats. All passenger and booking details are fictitious. The recorded
route is AY1331, HEL → LHR, 20 September 2026, departing 08:00 in Helsinki
and arriving 09:10 in London, with booking reference DEMO26.

The successful import/save flow is `final-import.yaml`, which delegates to
`record-import.yaml` and `record-save.yaml`. Start it with Photos already
showing the final sample image, FlyRight running at My travels, and the
sample trip absent from the isolated journal. `capture.yaml` includes the
opening photo/share clip, using the thumbnail position in this simulator's
sample library. These coordinate taps depend on that prepared layout.
Always use an explicit simulator ID and run one automation process at a time.

```sh
node scripts/sharing-demo/ticket.mjs
maestro --device 7A99390E-323B-4594-A61D-A120020047D2 test \
  -e OUT="$PWD/demo/out/sharing" \
  scripts/sharing-demo/final-import.yaml
```

The recording used a 9:41 status-bar override. Development loading/LogBox
overlays were temporarily disabled in this simulator's running process via
LLDB (`RCTDevLoadingViewSetEnabled(false)` and `RCTRedBoxSetEnabled(false)`),
then restored after capture. No app source was altered to hide them.

## Render

```sh
node scripts/sharing-demo/render.mjs
node scripts/sharing-demo/export-covers.mjs
```

Edit `edit.json` for cut points, durations and captions. The renderer uses
the local `sharp`, `qrcode` and FFmpeg tools, preserves the complete phone display,
and adjusts clip speed to fit each scene. The 10-second edit removes the
idle time before the share and add taps and holds the closing screen for
two seconds. The original export is preserved as `flyright-share-to-trip-26s.mp4`.
The closing scene holds the real
saved-journal frame; simctl emits only two frames for that static screen.
No voiceover or music is added.
The raw clips, stills, sample files and output video stay in the existing
gitignored `demo/out/sharing/` directory. Retake logs also remain there.

## Validation and observations

The final automation asserted the import's add button, booking DEMO26 and
return to My travels. A read-only SQLite query confirmed exactly one active
trip, no account owner, HEL → LHR, the correct date, 05:00Z departure and
08:10Z arrival (08:00/09:10 local), and booking DEMO26. The query result is
saved as `saved-trip.json` beside the video. The export was decoded in full
without FFmpeg errors, checked as H.264 at 1080 × 1350 / 30 fps / 10 seconds,
and visually inspected using a contact sheet and full-size frames.

The QR revision was decoded successfully with Apple's barcode reader from ten
video frames (one per second), the full-size cover and a 540-pixel-wide JPEG
copy at quality 75. The code has a four-module white quiet zone and remains
stationary throughout the ten seconds. Live browser checks with iPhone/Safari
and Android platform emulation observed automatic document navigation to
App Store ID `6801505051` and Google Play package
`com.shanavasshaji.flyright`. These verify browser routing, not native store
launches on physical phones. Evidence is in `qr-decode-results.txt` and
`link-checks/browser-results.json` beside the video. Badge sources are recorded
in `assets/README.md`.

An earlier synthetic fixture headed “FLIGHT CONFIRMATION” exposed an existing
parser edge case: the generic confirmation-label matcher selected AY1331 as
the booking reference. The final fixture uses “E-TICKET RECEIPT” and imports
correctly. The app parser was not changed; this observation is retained for
later follow-up. Initial retakes also encountered development warning banners
covering the add button; the final capture runs with those overlays disabled.
