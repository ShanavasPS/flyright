# Flights: destination groups

The Flights list uses the approved flat design in `design/trip-grouping/canvas.html`.
Country flags and right-aligned dates identify each destination. A clock with a
dotted vertical marker identifies a connection; a bed, explicit “Stay” label and
short 16-point side lines identify time at the destination. The more visible
full-width separator appears only between independent overall trips.

## How grouping works

`src/services/trip-groups.ts` derives the display from the current journal. It
stores no group IDs and changes no journey, booking, claim or account records.
Adding, editing or deleting flights recomputes the groups through `useJourneys`.

- One outward flight gets a destination header. A stay appears only when the
  next departure is known.
- Connecting legs retain the existing same-airport, positive-gap, up-to-24-hour
  itinerary rule. The destination and stay use the last leg's arrival. Explicit
  same-day backtracking is treated as a return rather than a connection.
- Adjacent, geographically continuous directions form an overall trip until
  the traveller returns home. International trips use countries, allowing
  arrival in JFK and onward departure from LGA or BOS. Domestic trips use cities.
- Disconnected or overlapping flights remain separate. An inferred gap over
  180 days stays separate unless the adjacent directions share a booking
  reference. A shared booking never overrides missing geographic continuity.
- A return flight belongs to the destination it leaves. For HEL → JFK,
  LGA → YYZ, YYZ → BOS, BOS → HEL, the groups are **US trip**, **Canada trip**
  (including YYZ → BOS), then **US trip continued**. The continued header
  precedes its US stay. These groups have no separator between them.
- Stay lengths count arrival-to-departure local calendar days, excluding
  flights and connecting layovers. A same-day visit says “Less than a day”.
  Missing or invalid schedules do not produce invented durations.
- Complete trips remain together in Live, Upcoming or a completed-year section.
  Flights within them read in travel order. Completed independent trips remain
  newest first. The existing hero flight is omitted only after grouping, so its
  destination and any following stay are retained.

## Regression checks

Run `npm run typecheck` and `npm test -- --runInBand --watchman=false`.
`src/services/trip-groups.test.ts` covers incremental imports, deletion, date
edits, incomplete returns, connections, bookings, repeated visits, domestic
travel, calendar boundaries, malformed schedules, hero exclusion and row identity.

The native layout flow is `.maestro/trip-grouping.yaml`. Use dedicated test
installations with Metro serving the current workspace. Stop the app, obtain
its current SQLite database (a Maestro clear-state run changes the iOS container),
then run:

```sh
python3 scripts/seed-trip-grouping-test.py <sqlite-file> simple
maestro --device <simulator-udid-or-android-serial> test \
  -e LAYOUT=simple -e SHOTS=<absolute-evidence-directory> \
  .maestro/trip-grouping.yaml
```

Repeat with `multi` and `connections`; `clear` removes only fixture IDs beginning
with `grouping-`. Android requires copying the stopped app's database and any
WAL to a temporary local directory, seeding there, and replacing the app's
database. Never seed a personal installation. The simple fixture also includes
an independent Portugal flight to exercise the stronger separator.

Use the existing smoke, add-flight, airport-picker, core-screen and
`e2e-signup-roundtrip.yaml` flows on both platforms. Sign-up checks use fresh
Clerk development `+clerk_test` accounts and the existing OTP helper; no real
email or personal account is needed. Native Debug apps currently load Metro
directly, so the affected launch flows no longer open an obsolete
`expo-development-client` route. The iOS demo-verdict selector includes its
existing leading accessibility icon label.

On the iPhone 17 Pro / iOS 27 test simulator, Clerk's SwiftUI email button
reported shifted accessibility bounds while its keyboard was open. After
inspecting the screenshot, the sign-in helper accepts the optional
`IOS_EMAIL_CONTINUE_POINT=50%,42%` override for that target. Other simulators
keep the native identifier; inspect their actual layout before using an
override. Android form flows dismiss Gboard's optional first-use stylus
tutorial and close the keyboard before testing navigation Back.

The separate `npm run test:security` fixture script had two stale expectations
on the unchanged baseline: foreign photo rows are skipped instead of aborting
the batch, and the existing per-user upload quota is 200, not 30. Its assertions
now check that no foreign attachment is written and that the 201st upload
ticket is refused. All 24 security checks pass without security-code changes.

Verification evidence for this change is saved under
`.maestro/out/trip-grouping-20260922/`. These are development simulator/emulator
checks, not store-release or physical-phone certification.

Fresh email-OTP sign-up was confirmed on both native platforms. iOS also
restored its original test account; Android used native adb keyboard input
after Maestro timed out erasing Clerk's email field. The original Android
installation remains protected by its pre-test emulator snapshot.

The Android core-screen flow dismisses only the previously documented
expo-router development warning (“Can't perform a React state update…”),
whose toast covers the tab bar. It still requires the signed-in account,
loaded Friends data and World on both cold starts. Production candidate
checks run separately without development LogBox overlays.
