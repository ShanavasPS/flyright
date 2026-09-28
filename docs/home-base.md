# Home base

Where a traveller lives, and since when. It decides where a trip starts and
ends, which city Travel stats calls home, what counts as a destination and
which country Places reads in take-offs. Design: the "Home base" canvas
(https://claude.ai/artifact/RjW4G7MmPryRY6YU3yqQZ1), all options A–E chosen
on 27 September 2026.

## Before this

- Travel stats' "Home base" was the city with the most take-offs, all time.
- Places marked the most-departed *airport*, so the two could disagree
  (London's LHR + LGW against one airport elsewhere).
- Trip grouping never used it: a trip ran from its first departure until the
  traveller returned there. After a move every trip from the new city chained
  into one long "trip" (broken only by the 180-day gap rule), and a lone
  return flight home became a destination named after home.
- None of it could be corrected.

## Model

```ts
interface HomePeriod {
  id: string;
  city: string;          // cityOf() name: "London" folds LHR, LGW, STN, LCY
  country: string;       // ISO 3166-1 alpha-2
  from: string | null;   // YYYY-MM-DD inclusive; null = since the first flight
  until: string | null;  // YYYY-MM-DD inclusive; null = still home
}
interface HomeBaseState {
  periods: HomePeriod[]; // sorted by from, never overlapping
  dismissed: string[];   // answered prompts: `nudge:<country>:<city>`, `move:<journeyId>`
  updatedAt: number;     // last local change, ms; 0 = never set (Automatic)
}
```

A home base is a **city**, never one airport. A day is the departure
airport's local calendar day (`flightDay`), the same day the Flights list
prints. With no periods at all, trip grouping uses the **automatic home**
(`autoHome`: take-offs plus time on the ground) for every flight
(`groupingHome`). Once any period is set, a day none of them covers has no
home: grouping falls back to the old rule (the trip's first departure),
because one guessed city for the whole journal would be wrong for the years
before a move. Stats keep the city with most take-offs until a period is set.

Pure logic lives in `src/services/home-base.ts` (no React, fully unit
tested). `src/services/home-base-store.ts` keeps one state per account (and
`guest`) in zustand + AsyncStorage, like `pro-prompts`. A signed-in account
syncs through Convex table `homeBases` (`convex/homeBase.ts`, `mine` /
`save`), last write wins on `updatedAt`; `components/home-base-sync.tsx`
mounts in `CloudSync`. The same component saves the phone's automatic home to
the row's `auto` field (`saveAuto`) whenever it changes; the web build keeps no
journal and never writes it. A guest's home base carries over to the first account
that has none.

## Rules

1. **Lookup.** `homeOn(state, day)` returns the period containing the day.
2. **Editing a period** (`upsertPeriod`) trims neighbours so periods never
   overlap: a neighbour that starts inside the edited period starts the day
   after it ends, one that ends inside it ends the day before it starts, one
   that falls entirely inside it is removed. The editor shows those changes
   before saving.
3. **Changing the current home** from the picker: with no periods it creates
   one period for all time; otherwise it changes the city of the period
   covering today, or adds one from the day after the last period ends.
   Choosing Automatic removes every period.
4. **A move** (`markMove`, from a flight or the nudge) ends the old home the
   day before and starts the new one on the move day. With no periods yet the
   old home is the automatic one at that time, written as a period so past
   trips keep counting from it.
5. **Trip grouping** (`buildTripGroups(rows, homeAt)`), when a home is known:
   - a trip starts and ends at the home the traveller had at its departure
     (city, or country for an international trip);
   - a flight from the old home (read the day before it leaves: the move day
     already belongs to the new home) to the new home is **its own item,
     "Moved to London"**, never the start of a trip;
   - a flight *to* home whose origin is not home and that nothing precedes
     (the outbound was never logged) groups under its origin, not under home;
   - a trip whose flight out was never logged, but whose later flight lands
     at home, still left from home: that flight ends the visit it leaves
     instead of opening a heading of its own;
   - after a move, a flight to a former home is an ordinary destination with
     its stay.
   Without a home (an empty journal, or a day no set period covers) grouping
   is exactly as before.
   - **Stay names follow the home at the time:** a stay abroad from the home
     the traveller had when they landed is named after its country ("13 days
     in the US" for a London home), a stay in the home country after its city
     ("3 days in Manchester"). Someone who lived in Dallas in 2022 sees "4
     days in Los Angeles" for that year. With no home known, a stay that lands
     in a city and leaves from it again is that city, and one that leaves from
     another city (in at JFK, out at BOS) is its country.
6. **Stats.** Travel stats shows today's home and its take-offs, or the
   automatic city. Top destination skips arrivals into the home the traveller
   had then. Places reads take-offs for today's home country and marks every
   airport of the home city.
7. **Nudge.** Round trips leave from home about half the time, so on Flights,
   when another city has at least 3 of the last 8 past take-offs and today's
   home at most 1, ask once: "Is London home now?". Yes = a move on the last
   flight into that city from home before its first take-off there (or that
   take-off). Not now = never ask about that city again.
8. **Move card** on a flight: a past one-way flight from today's-then home to
   another city, not followed by a return within 30 days, with at least 2 of
   the next 3 departures from the new city, and not the return from a visit
   that started in the destination within 30 days. Yes = a move on that
   flight's day; No = never ask for that flight again.
9. **Suggestions.** Each flight takes the city most departed from among the 7
   flights around it; consecutive flights of one city with at least 3 take-offs
   form a home. A new home starts with the first flight into it from the
   previous home that is followed by a take-off from it (the move). Two or more
   homes, and no periods yet, show "You seem to have lived in N places" with
   checkboxes; Confirm writes those periods.
10. Claims never read the home base. **Friends' cards group trips the way
    the traveller's own Flights tab does**: `circle.travelOf` attaches to each
    trip a member may see its `home` (the home on its departure day, from the
    periods, else the saved automatic home) and, on a move day, `homeBefore`
    (`convex/homeBaseShared.tripHome`); `services/person-home.personHomeAt`
    turns them back into the grouping lookup. The periods themselves never
    leave the owner, nor anything about trips the member cannot see, and the
    home is never printed as a label. An older server sends neither field and
    the card groups as before.

## Screens

| Where | What |
| --- | --- |
| Travel stats | Home base card: the city's photo, city, country · Auto / Set by you, airport chips, **Change**; the whole card opens `/home-base` |
| `/home-base` | The photo edge to edge under the status bar (own back button, no stack header), airports, the reason, Change city / Change photo, Undo after a picker change, homes over time with a photo each, suggestions, Add a period, Use automatic |
| `/home-base-city` | Picker: one tap chooses — no radios, no confirm button. Automatic, cities from your flights (photo thumbnails), search (flags); the current one says "Current". From `/home-base` it changes today's home and offers Undo for 8 s; from the editor it fills the draft |
| `/home-base-period` | Edit a period under the city's photo: city, From month, Until month or "I still live here", neighbour changes, Remove |
| `/home-photo` (sheet) | Photo for the city: Wikipedia's, one of yours, or none (the flag) |
| Settings | Home base row next to Appearance |
| Flights | One-time nudge card |
| A flight's page | "Did you move on this flight?" card |

## City photos

Every home base city shows a photo (the canvas's option G5).

- `convex/cityPhoto.ts` looks the photo up on Wikipedia once per city and
  keeps it in the `cityPhotos` table for everyone (60 days; `none` retried
  after 7). No account needed; a global budget of 600 lookups an hour.
  `ensure` does the lookup, `get` reads it, `forget` drops a bad answer
  (`npx convex run cityPhoto:forget '{"key":"FI:Oulu"}'`).
- The page is the city's bare name when its summary mentions the country,
  otherwise Wikipedia search for "City Country". "Oulu / Oulunsalo" looks up
  "Oulu".
- Candidates: the page image, then the article's images in order. Skipped
  (`convex/cityPhotoShared.ts`, unit tested): anything not a JPEG, collages,
  maps, flags, arms, logos, drawings, years before 1950 in the name,
  satellite images, portrait files, files whose Commons categories say
  drawings/paintings/maps/old photographs, and anything not CC BY / BY-SA /
  CC0 / public domain. Found in testing: Oulu's page image is a collage,
  its next images a 1800 picture, a satellite image and an 1886 map, and
  Wikidata's image a drawing — the rules land on a 2025 street photo.
- The photographer and licence show on the photo wherever it appears (card,
  hero), as the licences ask.
- On the phone (`services/city-photo.ts`): the answer is kept in
  AsyncStorage for offline use, expo-image keeps the file on disk. The
  traveller's choice per city (Wikipedia / own / none) is per phone and not
  synced; an own photo is copied into the app's documents and stays on
  that phone.
- The flag (`flagArt`) is drawn underneath at all times: it shows while the
  photo loads, offline, when nothing usable exists, and for "No photo".

## Test cases

Unit (`src/services/home-base.test.ts`):
- `homeOn`: inclusive boundaries, open start and end, gap → null.
- `autoHome`: folds a city's airports (LHR + LGW beat one airport), ties keep
  the first seen, no flights → null.
- `upsertPeriod`: trims a neighbour on either side, removes one inside,
  keeps adjacency, sorts, rejects from > until.
- `setCurrentHome`: empty → all-time period; with periods → changes today's
  period; after the last period → appends.
- `markMove`: splits at the day, creates the old automatic home when empty,
  idempotent for the same day.
- `suggestPeriods`, `nudgeFor`, `moveCandidate`: positive and negative cases,
  dismissals respected.
- `sanitize`: drops malformed periods from storage or the server.

Grouping (`src/services/trip-groups.test.ts`):
- no home → identical groups to before (the existing suite);
- trips after a move no longer chain; the move is its own "Moved to London";
- a visit to a former home is a destination with a stay;
- a lone return flight groups under its origin;
- an international return to another airport of the home country closes the
  trip.

Stats (`src/services/timeline.test.ts`): set home drives `homeCity`; top
destination skips arrivals home at the time.

Device (iOS simulator, Android emulator, physical Pixel):
1. Travel stats shows the automatic home with its reason; Change → pick
   London → the card says "Set by you" and Places marks London's airports.
2. Home base screen: add a period with dates; a neighbour is trimmed as the
   note said; Remove works.
3. Use automatic clears every period.
4. Settings row opens the same screen and shows the current home.
5. Flights regroups after a move (seeded one-way HEL → LHR then London trips).
6. The nudge and the move card appear for seeded data, and answering hides
   them for good.
7. A home set on one device reaches another signed-in device (sync).
