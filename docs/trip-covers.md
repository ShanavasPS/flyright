# Trip photos and destination pages

Every trip on Flights opens with its destination's photo, and tapping it
opens that destination: every trip there, all time. Design: the "Home base"
canvas (https://claude.ai/artifact/RjW4G7MmPryRY6YU3yqQZ1), rows T (T2, T5,
T6 chosen) and D (D1, D5, D6 chosen), 27 September 2026.

## Trip headers (`components/trip-cover.tsx`)

- The header is the destination's photo with the trip's name, its dates and
  the country after a small flag; a move reads "NEW HOME · Moved to London ·
  13 Aug 2025 from 🇫🇮 Helsinki".
- The destination is the first flight's arrival city (`services/destination`
  `tripDestination`); a move group's id starts with `move:`.
- Text wraps rather than clipping: the title takes two lines, the dates and
  the flag + place are separate pieces that wrap as units, and the header
  grows past its 132 pt minimum. Checked at font scale 1.6.
- The whole header is one button that opens `/destination`. A friend's trips
  (`person-travel.tsx`) keep the flag band.

## Which photo shows

`useTripCoverPhoto(group, place)`, first match wins:

1. the trip's own choice (`tripCovers[group.id]`): one of its journal photos,
   or none (the flag);
2. the city's choice (`tripCovers["city:<CC>:<City>"]`), which also drives the
   destination page and the Home base screens (`usePlacePhoto`);
3. this phone's Home base choice (`services/city-photo`, per phone);
4. Wikipedia's photo (`convex/cityPhoto`, see docs/home-base.md "City photos");
5. the flag, while any photo loads or when there is none.

Choices live in `services/trip-covers.ts` (zustand + AsyncStorage per
account) and sync through Convex `tripCovers` (`mine` / `save`, last write
wins on `updatedAt`, `components/trip-covers-sync.tsx` in CloudSync). A
journal photo is named by its `trip_photos` id, the same on every device; a
library photo is imported into the trip's journal first, so it syncs with
the journal. Account deletion removes `tripCovers` and `homeBases`.

## Destination page (`/destination`, `screens/destination.tsx`)

Params `city`, `country`, and `group` (the trip it was opened from).

- A destination (D1): the photo under the status bar, "Your trips to", the
  flag, country and "N trips since <month>"; totals (trips, days there from
  the stays, flights, first visit); Change photo, See on World (focuses the
  newest flight); every trip to the city under "Trips to <city>" (the same heading on
  every page), newest first, each drawn as on Flights (tap = the flight).
- A home city (D6): the city is today's home or has a home period.
  "home since <month>" (or "your home until"), trips from here, countries,
  time living here; the move into it ("Moved from Helsinki"); trips from the
  city; trips to it from before it was home.
- Nothing renders below the photo until the journal has loaded.
- Logic: `destinationOf(trips, place)` in `services/destination.ts`, tested in
  `home-base.test.ts`.

## Change photo sheet (`/trip-photo`, D5)

Scope switch "All Paris trips" / "Only 18–20 Aug" when opened from a trip.
All = the city's choice; Only = that trip's. Rows: your photos from those
trips (the journal), + adds one from the library into the newest trip's
journal, the city's Wikipedia photo (or "Same as all Paris trips" for one
trip), No photo.
