# Memberships (frequent flyer cards)

Profile → Memberships keeps the traveller's frequent flyer cards: a stack of
cards (design canvas "Trip details & Memberships alternatives", the original
"Memberships" artboard with stacking), each with the programme, tier, member
number, balance, status progress and expiring miles.

## Where things live

| Piece | File |
| --- | --- |
| Local table `memberships` (migration 0017) | `src/db/schema.ts`, `drizzle/0017_memberships.sql` |
| Store, Face ID lock | `src/services/memberships.ts` (+ `.web.ts`: none on web) |
| Programme catalogue, alliances, wording, earning and the smart tip | `src/services/loyalty-programmes.ts` (+ test) |
| Stack screen | `src/screens/memberships.tsx`, route `(journeys)/memberships` |
| Add / edit form (card modal) | `src/screens/membership-edit.tsx`, route `/membership?id=` |
| Profile summary card | `src/screens/profile.tsx` |
| "Earns … " line | trip page ticket card (`EarningLine` in `journey-detail.tsx`) and upcoming rows on Flights (`TripRow` `earning`) |
| Lock setting | Settings → Privacy → "Face ID for memberships" |

## Rules

- **Device only.** Rows are never synced to Convex; a membership number
  never leaves the phone. Rows carry the Clerk id that added them (null when
  anonymous) and are listed for that account plus anonymous rows, like
  journeys. Deleting is a tombstone (`deleted_at`).
- **Numbers are masked** ("•••• 4821") until the phone's own lock passes
  (`expo-local-authentication`; Face ID needs `NSFaceIDUsageDescription`,
  set by the plugin in `app.json`). Copy also asks. A phone with no lock set
  shows the number without asking. The lock can be turned off in Settings.
- **Nothing is fetched from airlines.** Balances, tiers and progress are what
  the traveller types ("Copy these from your airline's app"). FlyRight never
  asks for an airline password. See the study in the 2026-10-03 conversation:
  airline programmes have no third-party member APIs; AwardWallet's business
  APIs and Where to Credit's data are the only aggregators, both by
  partnership.
- **Tier thresholds** are in the catalogue only where the programme publishes
  one simple number per tier; elsewhere `threshold: null` and the progress bar
  needs the traveller's own target. A typed target always wins.
- **Earning hints** say "Earns <status unit> · <programme> <tier>" on the
  programme's own airlines and "Can earn …" on alliance partners
  (`ALLIANCES`, as of 2026). They never promise an amount.
- **Smart tip:** upcoming flights on an alliance partner the traveller has no
  card for, credited to a programme they hold; its action copies that
  programme's number (behind the lock) for the airline's booking page.

## Not built

Apple/Google Wallet passes (they need a signed pass from a server with an
Apple Pass Type ID), sync across devices, boarding-pass/e-ticket frequent
flyer numbers feeding the stack (the BCBP conditional fields are not parsed
yet), and earning amounts.
