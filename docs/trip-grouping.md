# Flights: destination groups

The Flights list uses the approved flat grouping and option C from
`design/trip-containers/canvas.html`, with the 23 September live-flight revision: when the first flight is live,
the small all-time summary leads and that flight expands into the live card
inside its destination group. A later live flight has a top card linked to
its original full row. Country flags and right-aligned dates identify each destination. A clock with a
dotted vertical marker identifies a connection; a bed, explicit “Stay” label and
short 16-point side lines identify time at the destination. Each destination
group has a filled, bordered container with a blue-grey title band. This replaces
the full-width separators, including those between independent overall trips.

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
- Complete trips remain together in Current trip, Upcoming or a completed-year
  section. Flights within them read in travel order. Completed independent trips
  remain newest first. Classify the full trip before highlighting the active row,
  so the final flight home cannot file the itinerary as completed too early.
  An ongoing trip stays current during known stays between flights.

## Live flight in the itinerary

When the active flight is the first flight in the list, the small all-time
summary comes first, then the destination heading and the expanded live card
in that flight’s normal position. No duplicate row or jump links appear.
This also covers a lone flight, a first connecting leg and the day-before
reminder. The existing tabletop fold layout keeps its fixed glance pane.

When an earlier flight precedes it, the live card remains at the top and the
active flight keeps its full card in the chronological group: airline logo,
date, flight number, route, cities and flight times. “View live card ↑” returns
to the top; “View in trip ↓” finds that row. Both are separate 44-point targets,
so tapping the flight body still opens the trip or selects the tablet detail.
Both cards have the same animated border. After a connecting-leg handover,
the first flight becomes a normal row and the later live flight gains the
linked layout automatically.

YYZ → BOS remains in Canada. BOS → HEL belongs to US trip continued, after its
resumed stay. Both surfaces use one selection and minute clock, so reminder,
arrival and connection handovers work without a journal edit. Stable row keys
retain the reader's place. The iOS list reserves bottom safe-area clearance so
the final row stays above the floating tabs when reached by the shortcut.

Both cards reuse RunningBorder: 1.5-point stroke, 30% highlight and a 3.2-second
clockwise lap. Absolute frame timestamps keep their phase aligned after a row
remounts. Both derive amber/cobalt and flight estimates from the same facts;
changed flight times retain the original times struck through. The border runs
throughout the displayed travel-day window, including the day-before reminder.
The hero retains its live status label; the row uses the return shortcut.
Reduce Motion stays solid.

## Trip containers

Each container includes its flag, title, date range, flights, connections and
stays. It uses the theme's selected fill for the title band, field fill for the
body, a 1-point hairline-colour outline and 16-point outer corners. The header
has 12-point vertical padding and a 12-point gap before the first flight or
stay. There are 12 points between groups and an 8-point inset around the body.
The container extends 8 points into the existing list margins, preserving the
flight cards' width and existing 24-point corners.

`TripGroupFrame` joins adjacent virtualized cells into that surface. The list
filters out separator markers and wraps each existing row, preserving its key,
measured scroll target, detail action and live-card shortcuts. Grouping and
stored journeys are unchanged. The enclosing border stays still; only the
active flight's border animates.

The live hero has 12-point vertical padding, 16-point horizontal padding and
4-point row gaps. Countdown and gate sizes stay unchanged. Its group link is a
separate 44-point tap target. Inside the group body, gaps are 4 points and stays
have 4-point vertical padding. Short stay accents and dotted connection markers
keep their distinct styles.

## Regression checks

Run `npm run typecheck` and `npm test -- --runInBand --watchman=false`.
`src/services/trip-groups.test.ts` covers incremental imports, deletion, date
edits, incomplete returns, connections, bookings, repeated visits, domestic
travel, calendar boundaries, malformed schedules, hero placement, connection handovers and row identity.

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
an independent Portugal flight to check its separate container and the absence
of the old separator.

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


### Live-row native checks

Use `.maestro/live-trip-row.yaml` with `CASE` and `SHOTS`. The helper
`scripts/seed-live-trip-row.py <SQLite-directory> <scenario>` prepares
clock-relative anonymous fixtures in a **stopped, dedicated test app** and
refuses a database with signed-in users’ other trips. It supports direct,
connection, Canada-return, homebound, stay, one-way and reminder cases. It only
replaces `live-pointer-*` records and their cached facts. Follow the existing
copy/stop/relaunch recipe above; do not seed a personal installation.

The test checks first-flight expansion with no duplicate row or jump links,
then both shortcuts for a later live flight. It opens the original trip detail
from the full row and hero and checks connections and the Canada/continued-US
boundary. The first-flight branch includes one-way and day-before reminders.
Evidence for the option-A implementation is under
`.maestro/out/live-trip-pointer-20260923/`. These are development simulator and
emulator checks, not a new store release or physical-device verification.

The homebound check caught a final-row overlap with iOS's floating tabs; the
list now explicitly reserves its safe-area clearance, and both shortcuts pass.
Live-card taps cap the test runner’s idle wait at one second because the
countdown and border intentionally keep changing. Before tapping the flight
body after a shortcut, the flow allows the list scroll two seconds to settle
and targets the body clear of the separate shortcut. Destination assertions
still require the expected card or trip detail; a manual native tap also
verified Android detail navigation while diagnosing the runner’s stale bounds.

On 2026-09-23, the original pointer version’s six seeded scenarios (Canada, connection, homebound,
reminder, one-way and stay) passed on the iPhone 17 Pro / iOS 27 simulator
and Pixel 9a / Android API 37 emulator. The existing clean-launch/onboarding
smoke passed on both. TypeScript, scoped ESLint, all 96 Jest suites (1,139
tests), all 24 security fixtures and the web export passed.

Fresh email-OTP sign-up passed on both platforms. iOS also passed the existing
sign-out/new-account/original-account round trip. Android required native
keyboard input after Maestro's known Clerk erase-text timeout; space repeated
R key events more than 200 ms apart when typing into the native Compose form,
or React Native Debug's double-R shortcut reloads the app mid-address. The
new Android account passed both signed-in cold starts and was signed out
through the native account sheet afterward. No authentication code changed.

The final first-flight expansion revision passed four native cases on **each**
platform: reminder, first connecting leg, lone flight, and the later Canada
return. The first three require a single expanded live card and no jump links;
the later-flight case checks both links and trip detail from both cards.
The earlier homebound check also passed on both platforms, including the final
row’s clearance above the tabs. The final grouping/travel-day run passed all
86 tests, with TypeScript, scoped ESLint and the web export also passing.
Screenshots and flow logs are in `.maestro/out/live-trip-row-20260923/`.
Short native recordings confirmed moving borders, including the reminder window.

After testing, the dedicated iOS fixtures were cleared and the original iOS
simulator was reopened with its 82 stored journey rows and no fixture IDs.
Android’s pre-test snapshot was restored; all 30 original journey IDs matched
its backup and the original account was reopened. No authentication, backend,
version or release configuration changed in this live-card revision. Physical
phones were skipped as requested; these checks used Debug 1.1.2 (iOS 63,
Android 59) with the current workspace served by Metro.

### Trip-container verification (23 September 2026)

The selected title-band design passed TypeScript, scoped ESLint and all 100
tests in the grouping, travel-day and imported-journey suites. The existing
Maestro flows passed on the iOS 27 test simulator and Android API 37 emulator
for a simple return plus an independent Portugal trip, connecting returns,
USA → Canada → USA, the first connecting flight live, the Canada return live,
the final flight home live, and a lone live flight. Both live shortcuts and
trip-detail taps were checked. Android's clean-launch/onboarding smoke passed.

Final light and dark multi-destination screenshots were inspected on both
platforms. Android's rounded-background renderer slightly insets even a flat
edge; a non-interactive fill at the joined edges removes that visible seam.
The existing flight-card shadows retain their 4-point spacing below each row.

The grouping flow now first returns to the stats action, so a retained scroll
position cannot skip the first group. On Android it dismisses only the existing
Expo Router development warning, as the core-screen flow already does. One
iOS run required restarting Maestro after a stale accessibility-element error;
the retry and remaining scenarios passed.

Evidence is in `.maestro/out/trip-containers-20260923/`, with final appearance
and lone-flight checks under `final/`. These were Debug 1.1.2 builds (iOS 63,
Android 59) using the current Metro workspace. The original iOS simulator
retains 82 journey rows and no fixtures; all 30 original Android journey IDs
were verified after restoring its snapshot. Dedicated test fixtures were
cleared and appearance settings restored. These checks are simulator/emulator
coverage, not physical-device checks or a store release.
