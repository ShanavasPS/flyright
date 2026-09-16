# Flight paths on the trip globe

The inset globe on a trip (journey detail, and a follower's view of someone
else's trip) draws the line the flight actually flew — or, before it leaves,
the route it filed — when the flight-path lookup has one. Until then it draws
the great circle it always drew, captioned **Overview**; a real line is
captioned **Flown path**, **Live path** (still in the air: solid so far, the
rest dashed, plane at the last position) or **Filed route**. The World tab's
overview stays on great circles.

## Provider: FlightAware AeroAPI

Chosen 2026-09-15 (Codex recommendation, Claude implementation): AeroDataBox
keeps the status lookups; AeroAPI supplies geometry only.

| Need | Endpoint | List price (per result set of 15 records) |
| --- | --- | --- |
| Which of the provider's flights is this journey | `GET /flights/{ident}?ident_type=designator&start&end` | $0.005 |
| Recorded track (after take-off) | `GET /flights/{fa_flight_id}/track` | $0.012 |
| Filed route (before departure) | `GET /flights/{fa_flight_id}/route` | $0.010 |
| Same, for flights older than 10 days | `/history/flights/…` | $0.020 / $0.060 — Standard tier only |

A 600-position long-haul track is 40 result sets: roughly $0.50 live, $2.40
through history. Every answer is cached server-side (`flightPaths` table) so
each flight is bought once per retention window, and "asked, nothing there"
is cached too.

### Licence (AeroAPI Standard License, Nov 2022 — read 2026-09-15)

Read the PDF at flightaware.com/commercial/aeroapi/AeroAPI_Standard_License.pdf
before changing any of this:

- **Personal tier is "personal or academic purposes only"** — a store app
  needs **Standard** ($100/month minimum, per-query fees) — Licensee May §7
  explicitly covers "a flight tracking application sold on an application
  store".
- **May Not §9: raw data stored at most 30 days** from first receipt →
  `PATH_CACHE_MAX_AGE_MS`, `flightPaths.prune` cron every 6 h.
- **May Not §10: no use "in conjunction with or as a backfill to" another
  real-time flight-data provider without FlightAware's written permission.**
  FlyRight's status data is AeroDataBox. Ask FlightAware for that permission
  in writing before enabling the key in production, or move status lookups
  to AeroAPI too.
- **May Not §12: no use for passenger-rights claims (EU261).** The path is a
  polyline for the map; nothing in the claims/disruption code reads it, and
  it must stay that way.
- Attribution "substantially similar to: Contains AeroAPI data © FlightAware
  LLC [year]" — carried in the privacy policy (Settings → Legal).
- History endpoints need Standard; alerts are not used.

### Caveats measured from the spec

- `/route` "only has access to navaids within [continental US] airspace":
  a European filed route usually returns fixes without coordinates.
  `normalizeRoute` refuses anything with fewer than three placed fixes, so
  the map keeps the great circle rather than drawing a worse line.
- The live ident lookup accepts `start` ≤10 days back and `end` ≤2 days
  ahead, so filed routes are only asked for inside ~2 days of departure
  (`lookupWindow`); the client does not even ask further out
  (`pathWorthAsking`).
- FlightAware recommends ICAO idents; the app stores IATA numbers and passes
  them with `ident_type=designator`. `pickFlight` then insists on matching
  origin/destination IATA codes and the nearest `scheduled_out` to the
  journey's own departure, so an ambiguous prefix resolves to "no data",
  never to the wrong flight.

## Configuration

Server-side only (Convex production + EAS Hosting production env; also
`.env.local` for the dev server). All optional — with no key the route
answers `{ path: null, reason: 'not_configured' }` and the map is unchanged.

| Variable | Meaning |
| --- | --- |
| `FLIGHTAWARE_API_KEY` | AeroAPI key (`x-apikey`) |
| `FLIGHTAWARE_BASE_URL` | default `https://aeroapi.flightaware.com/aeroapi` |
| `FLIGHTAWARE_MONTHLY_CENTS` | monthly cap counted in list-price cents; default 10000 |
| `FLIGHTAWARE_HISTORY` | `1` to fetch flights older than 10 days via history endpoints |

Both the hosting route and Convex need the key: the route asks Convex to
make the provider call (`flightPaths.fetchPath`, same reason as
`provider.fetchPath`). Hosting needs it only for the `flightAwareConfigured()`
check.

Without a key in development the route serves a deterministic mock (a bowed,
wobbly line between the mock airports HEL/FRA/LHR/ARN/CPH/JFK/DXB/LAX/SIN;
past date = flown, today = half flown, future = filed).

## Pieces

- `convex/flightPathShared.ts` — pure rules: `pickFlight`, `normalizeTrack`
  (time-ordered, projected positions dropped, Douglas–Peucker to ≤400
  points), `normalizeRoute`, `pathExpiry`, windows, prices, limits.
- `convex/flightPathFetch.ts` — HTTP to AeroAPI; env.
- `convex/flightPaths.ts` — `begin` / `fetchPath` / `record` (secret-gated
  with `LOOKUP_QUOTA_SECRET`), `prune`. Tables `flightPaths`,
  `flightPathBudget`; the daily per-caller meter shares `lookupQuota` under
  a `path:` prefix (150/day accounts, 30/day guests) so it never eats the
  five guest status lookups.
- `src/server/path-gate.ts`, `src/app/api/flight-path+api.ts` — the route.
  Query: `flight, date (origin-local day), from, to, departure (ISO)`.
  Answers `{ path, reason }` with 200 for every non-outage case.
- `src/services/flight-path.ts` — `useFlightPath(source, now)`: React Query,
  polls every 2 min while a track is growing, 5 min while airborne with
  nothing yet, never for a finished track.
- `src/services/geo.ts` — `buildWorldRoutes(rows, now, paths)`: a journey's
  path replaces its great circle; `GeoRoute.path` / `remaining`;
  `routePlane` puts an airborne plane at the track's end; `pathCaption`.
- `src/components/route-map(.web).tsx`, `route-atlas.tsx`, `world-map.tsx`,
  `path-caption.tsx` — rendering, dashed remainder, caption pill.

## Rollout checklist

1. Sign up for AeroAPI **Standard** (flightaware.com/aeroapi/signup) and get
   FlightAware's written OK for use alongside AeroDataBox (May Not §10).
2. `npx convex env set FLIGHTAWARE_API_KEY … --prod` and
   `eas env:create --environment production --name FLIGHTAWARE_API_KEY …`
   (sensitive visibility); optionally `FLIGHTAWARE_HISTORY=1`.
3. Redeploy hosting (release guide) — the route ships with the next hosting
   deploy; the app side ships with the next store build (RouteMap props).
4. Watch `flightPathBudget` for the month; the cap refuses spend with
   `reason: 'budget'` and the map falls back silently.

Tests: `src/services/flight-path-shared.test.ts`, `flight-path-api.test.ts`,
`flight-path.test.ts`, and the "real flight paths" block in `geo.test.ts`.
