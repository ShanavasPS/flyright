# FlyRight · iOS 27 LinkedIn announcement

## Editorial revision

Open `editorial.html` in a browser to compare the two directions and download either 1080 × 1350 PNG. It is self-contained and also works offline.

- `flyright-ios27-editorial-light.png`: white, product-led layout using the current store capture.
- `flyright-ios27-editorial-night.png`: navy, globe-led layout with Apple’s official dark iOS 27 icon.
- `post-v2.md`: revised LinkedIn copy and alt text.
- `flyright-ios27.canvas`: the two exports on an editable JSON Canvas board.
- `editorial.template.html`: editable typography, layout and styling.
- `build-editorial.mjs`: embeds the original app icon and screenshot assets in the review page.

These layouts are composed in HTML/CSS, not generated as a single image. Type stays precisely set and the imagery comes from existing app captures. The light source is `store-assets/raw/phone-06-world.png`; the dark globe comes from `assets/images/landing/dark/world.png`, with the surrounding older interface excluded. The dark source is 640 pixels wide and is enlarged in this treatment; the light direction has the sharper product capture.

Run `node design/linkedin-ios27/build-editorial.mjs` after editing the template. For image export, open `editorial.html?export=light` or `editorial.html?export=night` at a 1080 × 1350 viewport and capture the viewport at device scale 1. Both layouts have been rendered and visually inspected at that size.

## Official iOS 27 icon correction

Both exported designs now include the actual platform icon, not just the words “iOS 27.” Original Apple assets, linked from [What’s new in iOS](https://developer.apple.com/ios/whats-new/):

- Light: https://developer.apple.com/assets/elements/icons/ios-27-num/ios-27-num-256x256_2x.png
- Dark: https://developer.apple.com/assets/elements/icons/ios-27-num-dark/ios-27-num-dark-256x256_2x.png

The files are used unchanged. They identify platform support, not Apple sponsorship.

## Video status — not recorded yet

`capture/` contains a separate Apple XCTest helper for the real-screen tour. Its simulator build passed. Capture is blocked by an unresponsive CoreSimulator service; the isolated new simulator remains in `Booting`, and even read-only app-container queries on a previously booted simulator do not return. Another Maestro-launched Xcode test was also running. It was not interrupted without permission. No account was signed in/out, seeded or cleared; no device’s existing FlyRight binary was replaced.

The intended account is Maja (`scripts/store-profile.json`), not the older Eve/Shipaton accounts. The existing screenshot Release binary is 1.1.1 and links `iphonesimulator27.0`. The isolated capture target is `AA6A8347-57FC-40E6-AA7B-27180F27DD47` (FlyRight iOS 27 Social). A shutdown was requested after its first boot stalled, but that request also stalled. The helper build is `/private/tmp/flyright-ios27-social-build`; it does not rebuild FlyRight.

Once simulator service is healthy: install the existing screenshot Release build on the isolated target, initialize and seed only that target with the existing demo script, sign in as Maja, verify all screen content, then record `FlyRightSocialCapture/testTour` with `simctl recordVideo`. The helper emits `SOCIAL_CAPTURE_READY`, per-tab timing markers and `SOCIAL_CAPTURE_DONE` for the edit. Review footage before publishing; compilation is not proof of a successful demo.

## Original generation — retained for comparison

- `flyright-ios27-linkedin.png`: original portrait graphic, rejected by the user; generated with the built-in image generation tool.
- `post.md`: LinkedIn copy, alt text, source references and the release-status note.
- `prompt.md`: the exact generation prompt, using the actual World screenshot and current icon as compositing inputs.

The imagegen skill guided the original glass material treatment and use of the supplied app imagery. In that original, the World screenshot was used as a generation reference inside a product mockup; it is campaign artwork, not pixel-exact release-test evidence. No app icon, app source, store listing or social account was changed. Nothing has been published.

The current release record confirms iOS 27 SDK support and simulator checks but last records the new build awaiting App Review. “Ready for iOS 27” avoids announcing that an unverified new store update is live.
