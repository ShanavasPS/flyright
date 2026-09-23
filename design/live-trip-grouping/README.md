# Live flights in grouped trips · design review

This preserves the design review before implementation. The app has since
adopted the revised behavior documented in [trip-grouping.md](../../docs/trip-grouping.md);
the comparisons below describe the source and proposals at the time of this review.

Open **[canvas.html](canvas.html)** for the current behavior and two alternatives side by side. Choose one of eight travel moments, switch appearance, and use **Show its place in the trip** to compare the list at the active flight. Each phone also scrolls independently. The proposed shortcuts work inside the canvas.

This is a **design artifact only**. No application implementation, release, account changes or device-data changes are part of this review.

## What happens currently

The flight selection has not changed with destination grouping. `useHeroTrip` selects the eligible flight with the earliest departure in its reminder/live window. The top card represents that flight and its ordinary list row is removed **after** the destination groups are formed. Flights inside each complete trip remain in travel order; completed independent trips are newest first.

The missing row has new consequences in a grouped list:

- On an outbound direct flight, **US trip** can start with the stay marker instead of the flight that begins that stay.
- When one connecting leg becomes the hero, the list can lose the connection marker: it is only rendered when both adjacent flight rows are present.
- During **YYZ → BOS**, the live card does not say **Canada trip**. In the list, Canada ends at its stay marker and the next heading is **US trip continued**, with its US stay.
- During the final **BOS → HEL**, removing the sole future flight before assigning list phases means the rest of the entire trip can be filed under **2027**, while the traveller is still returning home.
- With only one flight saved, its otherwise empty group disappears and the live card represents it alone.

These are observations of the current source, not proposed behavior. `build.mjs` reads the actual pure grouping functions to produce `scenarios.json`, including the current section names, group dates, flight order, stays and omitted connection markers. The visuals are static reconstructions, **not screenshots from a running app**. Gates and status clocks are fictional; only one curated flight is eligible in each live scenario. In the onward-connection example, the first flight’s arrival steps/window have already finished.

## A · Keep a small pointer — recommended

Keep the existing live card at the top. Add its destination-group name and a **View in trip** link. In the flight’s original position, show a compact route/date/flight-number row with **Live card above ↑**. It takes the traveller back to the card.

Both the live card and its compact pointer now share the native border treatment: a **1.5px clockwise highlight**, covering **30% of the perimeter**, with a **3.2-second lap**. They use the same colour and phase, following the existing `RunningBorder` component. The highlight follows each card’s own corner radius, and does not intercept taps. Reduce Motion keeps the borders still. The app itself has not been changed.

There is one countdown and one set of operational details. The route is intentionally repeated as a position marker, while connections and stays retain their meaning. Group flags, right-aligned dates, short stay accents and the approved flat grouping stay as they are. YYZ → BOS remains in Canada. US trip continued still starts with its stay.

Use **Current trip** for the active complete itinerary, deciding its phase before omitting any hero row. It remains current during known stays between saved flights, and until the final flight’s arrival window finishes. Earlier flights stay visible in order; this proposal introduces no new nesting or collapsible group.

Special cases:

- **Only one saved flight:** show the destination heading and date directly above the live card. There is no useful second list position, so omit the redundant pointer. No next departure means no invented stay length.
- **Return added later:** the ordinary group and stay appear from the existing derived grouping. The active flight gains its pointer when the list has other content.
- **Canada added later:** existing grouping yields US, Canada, US continued. The live card and pointer use the active flight’s resulting group; no persistent group ID is proposed.
- **Reminder vs live:** before the four-hour live window, use **Travel card above**, not a live status. Keep the existing 24-hour reminder and travel-day lifecycle.
- **Connection handover:** the old flight returns to its normal card and the next flight gains the pointer. Keep the dotted connection marker in place. Preserve scroll position; do not automatically jump when this happens.
- **Delay, cancellation or missing live support:** preserve the existing card’s status/lifecycle behavior. The compact row does not create an independent countdown. Unsupported flights remain ordinary rows.
- **Arrival:** keep the current arrival steps and grace period. Do not dismiss or refile the trip at scheduled touchdown while the current live window remains open. With no future saved flight, return it to its completed year when that window ends; do not infer an open-ended stay.

This is the smallest practical adjustment to the currently familiar top card. The tradeoff is a deliberate, quiet repetition of the route.

## B · Expand in its group

Replace the active flight row with the full live card **in place**. A small **Go to live flight** shortcut above the stats strip scrolls to it. Keep the same **Current trip** handling as A.

This gives each flight exactly one place. It works particularly well on the first outbound flight. On the return from Canada or the final flight home, however, gate and countdown details are below the initial viewport and require a tap or scroll. The canvas shows that tradeoff without automatically scrolling on entry.

## Review scenarios

| Moment | What to look for |
| --- | --- |
| Outbound | Does the stay still have a clear starting flight? |
| First connection | Is the two-hour London connection visible? |
| Onward connection | Does the first flight still connect to the currently active one? |
| Canada → US | YYZ → BOS stays in Canada; continued US stay comes after its own header. |
| Flight home | Current behavior can file the remaining itinerary as past too early. |
| Between flights | No live card or pointer; the complete trip remains readable. |
| One flight saved | No invented duration or redundant list placeholder. |
| After arriving home | Normal rows return; the completed trip moves to its year. |

The examples use the same fictional June 2027 itinerary as the approved grouping canvas. The 9/4/9-day stays count local calendar days. Flight time home does not add a stay day. There are no full-width separators among the US/Canada/US-continued groups; the approved stronger separator remains reserved for independent trips.

## Design and source references

- [FlyRight design-system artifact](https://claude.ai/artifact/5V5zGwdsNjkjsk7C9Jmg7v): read its cached `project/README.md` and `project/tokens.json`, synced **20 September 2026**, **main@02c3dbd**. The public URL was unavailable to the web reader. The cached export does not contain the component README files; the existing Card and live-card source were used for their component-specific values. Native navigation materials and airline marks are simplified, as in the prior canvas. Country flags follow the user-approved design.
- [Approved grouping canvas](../trip-grouping/canvas.html).
- [Grouping model](../../src/services/trip-groups.ts): `tripListSections` excludes the hero from phase assignment, filters the row after building groups, and only retains a connection if its predecessor remains visible.
- [Existing animated border](../../src/components/running-border.tsx): stroke width, sweep duration and perimeter share are mirrored in the canvas.
- [Live card and selection hook](../../src/components/travel-day-banner.tsx): `HomeHero` and `useHeroTrip`.
- [Travel-day lifecycle](../../src/services/travel-day.ts): `activeJourney` and `travelWindow`. Reminder starts at T−24h, live at T−4h. Real arrival steps/stamps determine the end; it is not simply scheduled landing.
- [Flights screen](../../src/screens/journeys/index.tsx): the hero is the list header and grouped rows follow it.
- [Markers](../../src/components/trip-group-mark.tsx): country flag, dates, short stay accents and dotted connection markers.

## Share and verify

Send **[FlyRight-live-trip-review.zip](FlyRight-live-trip-review.zip)**. Extract it and open `canvas.html`; all preview icons and data are embedded and it works offline. Sending `canvas.html` alone is also enough for the interactive comparison; companion screenshot/README links need the ZIP. No hosting or account is required. Use the feedback box to download a text file recording the selected moment, appearance and comment; nothing is sent automatically.

[live-trip-grouping.canvas](live-trip-grouping.canvas) is an editable JSON Canvas board with file references relative to this repository root. It shows the outbound comparison and the Canada list-position comparison. [overview.png](overview.png) and [overview-dark.png](overview-dark.png) are exact canvas captures.

Editable source: `canvas.template.html`. Run `node design/live-trip-grouping/build.mjs` to embed icons and regenerate fixtures from the current grouping source. With an isolated Chrome on remote-debugging port 9442, run `node design/live-trip-grouping/render.mjs` to capture previews and check them.

**Verification:** 71 canvas checks passed: fixture/row consistency across eight moments, one live card per option, no duplicated countdowns, connection retention, Canada ownership, final-flight classification, working jump controls, and layout at desktop, 390px and 320px. Light/dark screenshots were visually inspected. The matching border was also checked while moving: shared colour, stroke, timing and phase; Reduce Motion stops both highlights; the overlay does not intercept taps. These are design-preview checks, not native app or release certification.
