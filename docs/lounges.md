# Lounge access

Which airport lounges a traveller can use before a flight, and what to have
ready at the desk. Design and decisions: the "Lounge access concepts" canvas
(https://claude.ai/artifact/KkKVMTZjjLvzLCoeNq9T4g), pages "Designs (A + B)"
and "How it works" (Technical plan, Feasibility).

## Status

Steps 0–6 are built: a lounge line on the trip page before the day, on the travel day a lounge card and sheet, lounge passes with logged visits, what a boarding pass says about the traveller's memberships, and the practical cases (delay, connection, long layover, the pass year).

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
| Passes and visits (device-only tables) | `lounge_passes`, `lounge_visits` (migration 0022), `src/services/lounge-passes.ts` (+ `.web.ts`: none on web) | Built |
| Pass maths: networks, membership year, visits left | `src/services/lounge-pass-logic.ts` (+ test) | Built |
| Passes in Memberships (B1), add/edit (B2), detail (B3) | `src/components/lounge-pass-list.tsx`, `lounge-pass-card.tsx`, `src/screens/lounge-pass-edit.tsx` (`/lounge-pass-edit`), `lounge-pass-detail.tsx` (`/lounge-pass`) | Built; adding a pass is Pro |
| "I'm in the lounge", in-lounge card (A3), Undo, "I've left" | `src/screens/lounge-sheet.tsx`, `src/components/lounge-card.tsx` | Built |
| "Also on this pass" (B4) under a saved boarding pass | `src/components/pass-loyalty.tsx` on `/boarding-pass`, `passLoyalty` in `lounge-trip.ts` | Built, from the barcode |
| Add a membership found on a pass (B5) | `/membership?fromJourney=` (`membershipFromPass`) | Built: programme and number filled in; the tier is the traveller's to pick |
| Printed tier from Wallet passes and documents (`booking_loyalty`) | — | Not built: import keeps no tier today; the barcode carries none |
| Delay (U1), connection (A4), long layover (U3) on the card | `LoungeCard` `inbound`, `connectionMinutes`, `delayNote` in `lounge-trip.ts` | Built |
| The pass year (U4) | `passYear` in `lounge-pass-logic.ts`, "This year" on the pass | Built: free used, paid and what was paid |

## Rules

- **Leave by** = the posted boarding time − 15 min, else departure − 45 min;
  a delay (FlightFacts `estimatedDeparture`) moves it and the verdicts. The
  card is gone once that time passes. Walk times to gates are not in the
  directory yet.
- **Connections:** the card on an onward leg says "2 h 55 min to connect"
  (inbound landing, actual when known, to this departure, delays
  included) and stays away under 60 min. From 4 h it adds the 3-hour entry
  window and what leaving the airport means.
- **Delays** move the departure the verdicts use, the leave-by time ("was
  14:55") and an open visit's leave-by; from 2 h the card mentions vouchers.
- **Not possible yet:** walk times to gates, door-price equivalents ("worth
  it"), visits status would also have covered, stay limits, live crowding.
  The directory has none of these.
- **Free visits left** = free visits a year − (what was typed as used when
  the pass was added, if that was this membership year) − pass visits
  logged since the year began (`renewsOn`'s last anniversary). Undo deletes
  the visit, so it gives the visit back. "Running low" from 2 left.
- **A visit closes itself** at its leave-by time; "I've left" closes it
  sooner. Visits are logged for every way in (status, cabin, pass, pay),
  device-only, and never reach followers.
- **No pass company publishes a link into its app**, so "Open Priority Pass"
  opens its App Store page (it shows Open when installed) or the network's
  site; the desk scans their app, never FlyRight.

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
- **Evidence is read live from the saved barcode**, never copied: the
  verdicts, the airport-card line and "Also on this pass" all parse
  `passCode` when shown. Only the add form sees the full number, on this
  phone; links carry the trip id, never the number.
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
line; `.maestro/lounge-practical.yaml` (`delay` or `layover` seed, same
CASE) checks the delay and connection wording; `.maestro/lounge-pass-read.yaml` (`travel` seed with CASE=saved,
`unsaved` seed with CASE=unsaved) checks "Also on this pass" and adding the
membership from it; `.maestro/lounge-pass.yaml` with `JOURNEY=` (the `pass` seed: QR3
from DOH with a Priority Pass) logs an Al Maha visit and undoes it;
`.maestro/lounge-travel-day.yaml` with `JOURNEY=` (the id the
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

## Batch 2 (2026-10-06): the airports travellers use

Chosen by counting departure airports across production accounts
(2026-10-06: 28 accounts, 158 departures, 48 airports; HEL and DOH covered
24% of departures). COK, FRA, LAX, DFW, DXB, TRV and LHR take it to about
58% of departures and 59% of upcoming trips. Researched one airport per
agent, each entry from the operator's, airline's or airport's own page, then
reviewed here: 90 lounges added, 101 in all. Seeded on dev only.

Review before production, in particular:
- **FRA Lufthansa lounges:** Fraport's pages say only "eligible passengers";
  the cabin and Star Alliance Gold rules are Lufthansa's published policy,
  not quoted from the cited page. FRA Terminal 3 opened 23 April 2026.
- **LHR oneworld airline lounges** (Qantas, Cathay, AA, Qatar): the access
  rule is oneworld.com's general lounge policy; the cited page is the
  airline's.
- **US airline lounges** (AA, United, Delta, Air Canada at DFW/LAX): cabin
  and status marked `internationalOnly`, which is stricter than the rules
  for some members (another oneworld programme's Sapphire on a domestic
  flight). Walk-in passes left out: who may buy them is restricted.
- **DXB Emirates lounges:** no walk-in price (sold to Emirates passengers
  only); marhaba A/B take Priority Pass only for Emirates and Qantas flights.
- **LAX terminal "B"** is Tom Bradley; LAX is renumbering terminals for 2026.
- **Left out** (no way in the schema can express, closing, or unconfirmed):
  card-only lounges (Amex Centurion, Capital One, Chase), LHR Clubrooms
  (Priority Pass pays extra) and Club Aspire T5 (closed 2 Nov 2026 to
  spring 2027), FRA SkyTeam Lounge and several LHR airline lounges whose
  rules could not be read, arrivals lounges, Indian bank-card and DreamFolks
  access, Emirates Skywards status.
- Research agents read some blocked airline pages through the Chrome debug
  profile on port 9222; they opened and closed their own tabs.

`cabin.anyCarrier` (any airline's business class, TRV) and
`cabin.internationalOnly` were added to the shape for this batch.

## Batch 3 (2026-10-06): airports with two travellers each

BGO 1, BLR 5, AYT 2, SIN 18, NRT 8, ARN 6, LAS 2, AMS 4, AUH 1, KUL 11:
58 lounges, 159 in all at 19 airports. Seeded on dev only. Research used
web search and fetch only (no local browser).

Review before production, in particular:
- **Access from alliance policy, not the cited page:** SIN Qantas, BA,
  Cathay and Qatar (Changi's pages say "airline eligibility"); NRT JAL and
  ANA (jal.co.jp and ana.co.jp blocked reads; existence and hours from the
  airport's page).
- **ARN SAS lounges:** rules from Swedavia's pages; flysas.com was blocked.
- **AMS** is incomplete: the research ran out of searches after the KLM
  Crown and Aspire lounges.
- **Left out:** Etihad's AUH lounges and Turkish Airlines' AYT domestic
  lounge (seen only in search snippets), AYT Elite (bundled meet-and-assist
  price), SIN First Class SilverKris and The Private Room (snippets only),
  NRT IASS Executive Lounge 1 (sources disagree on whether it serves
  departures), KrisFlyer Gold lounges (carrier-restricted status), and
  airline lounges at NRT whose rules could not be read (United, Korean,
  Turkish, China Airlines, Emirates).

`serves` ('international' | 'domestic') was added to the shape for this
batch: a domestic terminal's lounge (KUL, AYT, BLR) no longer shows for an
international departure, and an international-only lounge's walk-in price
(BGO) no longer shows for a domestic one.

## Batch 4 and rechecks (2026-10-06)

BOM 5, SEA 5, JFK 11, SZG 1, CLT 1, BGI 1, plus the Air France lounge at
LHR T4: 184 lounges at 25 airports, about 84% of production departures.
VAA has no lounge (Finavia); KGD's site renders only with JavaScript.
Seeded on dev only. The session's web-search allowance ran out early in
this batch, so most of it came from fetching known official pages.

Still missing, because the official sites blocked automated reads:
- **JFK Terminal 8** (BA, American, Admirals Club, Flagship) and T7 (Aer
  Lingus); **CLT** Admirals Clubs; **SEA** United Club, Alaska Lounges and
  BA; **BOM** Adani and Air India airline lounges.
- **Rechecks that found nothing new:** Etihad at AUH; United, Korean,
  Turkish, China Airlines, Emirates and Aspire at NRT (Narita's page says
  "check with your airline"); other lounges at AMS; Lufthansa, United,
  Emirates, Etihad, Gulf Air and Saudia at LHR.
These need a pass from a network where those sites load, or by hand.

Fixed in this pass: Delta One lounges (LAX, SEA, JFK) admit business
only; listing "first" with DL would have called Delta's domestic first
"Included".

## Decisions (2026-10-06)

1. Boarding passes keep syncing as issued (docs/memberships.md, privacy policy).
2. Hand-checked list first; paid feed only after measuring coverage.
3. First release: days before and the travel day (steps 0–3); passes later.
4. Lounge list and card free; pass tracking (visits left, value) Pro.
5. Pay-only lounges shown with the price.
6. "Not today" hides lounges for this flight only.
7. The list is checked by hand and by the 90-day script.
