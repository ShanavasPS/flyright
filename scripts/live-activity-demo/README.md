# Live Activity demo (2026-09-25)

Two 20-second LinkedIn videos: the travel-day Live Activity on iOS and the
Live Update on Android through five beats (Departs in → Boarding → On board
→ Lands in → Landed). The shooting script, with what each surface shows and
how the states are seeded, is `SCRIPT.md`; the post draft is
`store-assets/social/posts/linkedin-live-activity-post.md`. Outputs are
gitignored under `demo/out/live-activity/`.

## Devices

- iOS: simulator "FlyRight Live Demo" (iPhone 18 Pro, iOS 27.0) with the
  Release 1.1.4 (67) `.app` copied from another sim (`simctl install`).
- Android: AVD `Galaxy_S26_Ultra` — a custom Samsung device definition in
  `~/.android/devices.xml` (6.9", 1440×3120 → run at FHD+ 1080×2340 / 420 dpi
  to keep the emulator on the hardware GPU), cloned by hand from
  `Galaxy_Flip_Test` onto `android-37.1` (google_apis, rootable). Debug APK
  from `android/app/build/outputs/apk/debug` on Metro :8081 via
  `adb reverse`; `pm grant … POST_NOTIFICATIONS`; `locksettings
  set-disabled false` for a Lock Screen; the "Serial console enabled"
  developer notification snoozed with `cmd notification snooze`.
- **Pro:** the live surface is gated on RevenueCat's "Owed Pro". Both demo
  installs got a 3-day promotional grant on their anonymous RC ids
  (`grant-customer-entitlement`, project proj8a10ae83, entitlement
  entl2e6a62a7ab); nothing to sign in.

## Takes

```sh
U=<sim udid>; S=emulator-5558
node scripts/seed-demo-data.mjs --ios --sim $U --travel-day          # once
ANDROID_SERIAL=$S node scripts/seed-demo-data.mjs --android --travel-day
for n in 1:departs 2:boarding 3:onboard 4:air 5:landed; do
  scripts/live-activity-demo/ios-take.sh $U ${n#*:} ${n%%:*}          # add `keep` to update in place
  ANDROID_SERIAL=$S node scripts/live-activity-demo/seed-state.mjs --state ${n#*:} --android
  scripts/live-activity-demo/android-prepare.sh $S
  scripts/live-activity-demo/android-beat.sh $S demo/out/live-activity/android/beat-${n%%:*}-${n#*:}.mp4
done
python3 scripts/live-activity-demo/timeline.py <take.mp4>   # transitions → cuts.json
node scripts/live-activity-demo/render.mjs ios && node scripts/live-activity-demo/render.mjs android
```

Gotchas met on the day: a reseed followed by a foreground reconcile updated
the iOS activity through ActivityKit (logged) but the archived card kept its
old content on the simulator — `ios-take.sh` therefore reinstalls the same
`.app` (ends the OS activity, keeps data) and forgets the activity id so a
fresh one starts with the new content; the one start that vanished was an
app relaunched twice within 20 s (`keep` then worked). Boarding must be
seeded with `boarding_time` already past (rounding the departure up to five
minutes pushed it into the future). Maestro holds on iOS run 3–10× longer
than asked, so beats are jump-cut from the takes (`cuts.json`, segments of
exactly 4.0 s per beat) rather than trimmed from one point.
