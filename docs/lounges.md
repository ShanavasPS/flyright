# Lounge access

Which airport lounges a traveller can use before a flight, and what to have
ready at the desk. Design and decisions: the "Lounge access concepts" canvas
(https://claude.ai/artifact/KkKVMTZjjLvzLCoeNq9T4g), pages "Designs (A + B)"
and "How it works" (Technical plan, Feasibility).

## Status

Steps 0–3 are built (the first release): a lounge line on the trip page before the day, and on the travel day a lounge card and sheet.

| Piece | File | State |
| --- | --- | --- |
| Alliance level per tier | `src/services/loyalty-programmes.ts` (`Tier.level`, `allianceLevelOf`) | Built |
| Eligibility engine | `src/services/lounge-access.ts` (`loungeOptions`) + test | Built |
| Frequent flyer number and fast track from the boarding pass | `src/services/bcbp.ts` (`frequentFlyer`, `fastTrack` per leg) + test | Built, unused |
| Lounge directory | `convex/lounges.ts` (`atAirports`, public), `convex/loungesInternal.ts` (`replaceAirport`), `convex/loungeShared.ts` (shape, `loungeProblem`) | Built, seeded on dev only |
| Directory data and scripts | `scripts/lounges/directory.json` (+ test), `seed.mjs`, `check.mjs` | HEL, DOH |
| App side, offline copy | `src/services/lounges.ts` (`useLounges`) | Built, unused |
| Trip facts for the engine, boarding-pass match, the line's wording | `src/services/lounge-trip.ts` (+ test) | Built |
| Trip-page line (design A1) | `src/components/lounge-line.tsx`, `TripFactsCard` `afterFirst` | Built, 'saved' moment |
| Travel-day card (A3) | `src/components/lounge-card.tsx`, slot `'lounge'` after progress in the 'travel' moment | Built |
| Lounge sheet (A4) | `src/screens/lounge-sheet.tsx`, route `/lounge?journeyId=&lounge=` (form sheet) | Built: Show boarding pass, Member number, Not today |
| Shared verdicts, "Not today" | `src/hooks/use-lounge-options.ts`, `src/services/lounge-dismissals.ts` | Built |
| Passes and visits (device-only tables) | — | Step 4, a later release |
| Booking evidence (`booking_loyalty`) | — | Step 5 |

## Rules

- **Leave by** = the posted boarding time − 15 min, else departure − 45 min;
  a delay (FlightFacts `estimatedDeparture`) moves it and the verdicts. The
  card is gone once that time passes. Walk times to gates are not in the
  directory yet.
- **Not in the first release:** pass visits, "I'm in the lounge", visit
  counting (step 4, device tables), the connection card, U1/U3/U4.

- **FlyRight is never what the desk scans.** The desk reads the boarding
  pass, a pass company's own app, or a payment card. Copy says "Have ready",
  never "You're in".
- **"Included" needs evidence on the booking:** a premium cabin, or a status
  whose member number the boarding pass carries. A typed status is "likely"
  until then, with the fix (`LoungeFix`).
- **A free way in beats a pass visit.** Pay-only lounges are listed, with the
  price, after the usable ones.
- **No travel-day stage for lounges.** `STAGE_ORDER` and `travel_day.plan`
  sync into the live session and reach followers, pushes and Live Activities.
  A lounge visit stays on the phone; followers never see it.
- **No new journey columns.** Lounge facts are recomputed from `passCode`,
  `cabin`, `terminal` and `gate`; `passCode` is read, never rewritten.
- **The frequent flyer number from a pass is never stored on its own.** Only
  the match against a saved membership and the last four characters, on the
  phone.

## Data

There is no open, general lounge feed (checked 2026-10-05: bank and network
APIs serve their own cardholders; no Priority Pass API or URL scheme). The
directory is a hand-checked list served from Convex, for the airports in
real journals, chosen by counting production departures and connections.
Every lounge has `checkedOn`; a script flags entries older than 90 days
before each release. An empty answer from the server hides every lounge
surface, which is also the kill switch. A paid feed is considered only after
the coverage is measured, with a licence read like docs/flight-paths.md.

## Testing on a device

`python3 scripts/seed-lounge-trips.py <SQLite-dir> likely|included|none|travel|clear`
writes an anonymous AY5 HEL→JFK (and a Finnair Plus Platinum membership)
into a stopped app; `.maestro/lounge-trip-line.yaml` with `CASE=` checks the
line; `.maestro/lounge-travel-day.yaml` with `JOURNEY=` (the id the
`travel` seed prints) walks card → sheet → boarding pass → Not today. iOS reads the line as one accessibility label, so the flow matches
with `.*…*`. The days-before cases depart 15:40 Helsinki time so every HEL
lounge is open.

## Updating the directory

1. Edit `scripts/lounges/directory.json`: one list per airport, each entry
   with the operator's own page as `source` and today as `checkedOn`.
   `npx jest scripts/lounges` checks the shape.
2. `node scripts/lounges/seed.mjs HEL` writes that airport to the dev
   deployment; `--prod` writes production. Production only after the owner
   has checked the entries, and only once the backend with `lounges` is
   deployed there.
3. Before each release: `node scripts/lounges/check.mjs` lists entries older
   than 90 days.
4. To pull an airport, set its list to `[]` and seed it: the app hides it.

The starter list (2026-10-06) was checked against Finnair's lounge page,
Qatar Airways' press release and Priority Pass's lounge pages. Qatar
Airways' own lounge page refused automated reads, so the Al Safwa and Al
Mourjan entries carry no hours (unknown, never shown as closed); confirm
them by hand before seeding production. Al Mourjan is for Business and
First tickets only; status holders use the Platinum and Gold lounges.

## Decisions (2026-10-06)

1. Boarding passes keep syncing as issued (docs/memberships.md, privacy policy).
2. Hand-checked list first; paid feed only after measuring coverage.
3. First release: days before and the travel day (steps 0–3); passes later.
4. Lounge list and card free; pass tracking (visits left, value) Pro.
5. Pay-only lounges shown with the price.
6. "Not today" hides lounges for this flight only.
7. The list is checked by hand and by the 90-day script.
