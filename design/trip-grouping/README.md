# Simple trip grouping · revised canvas

Open **[canvas.html](canvas.html)**. This replaces the earlier options with one small change to the existing flight list. This is a canvas only, not an app implementation.

The proposed additions are a country flag beside a small destination header such as **US trip**, the trip dates aligned at the far right of the same row, and a line showing **22 days in the US**. Keep the existing flight cards and navigation; give connections and stays different visual treatments. No nested trips, parent trip cards, side-trip labels, segment tabs or management flows.

## Three examples of the same design

1. **Direct return:** HEL → JFK on 1 June, then JFK → HEL on 23–24 June. One US trip header, with 22 days between arrival and departure.
2. **Connecting return:** HEL → LHR → JFK and JFK → LHR → HEL. Keep both London connections. Put the stay count after the last outbound leg, before the first return leg.
3. **Selected direction — US → Canada → US continued:** three flat groups: US trip (1–10 June), Canada trip (10–14 June), US trip continued (14–24 June). Canada includes both LGA → YYZ and YYZ → BOS, with 4 days in Canada between them. The continued US group uses the US flag and shows its header first, then the 9-day US stay, then BOS → HEL. Its dates include the resumed stay and arrival home.

In the third example, HEL → JFK belongs to the US group, New York → Toronto and Toronto → Boston belong to Canada, and Boston → Helsinki belongs to US trip continued. Each flight appears once. The 9-day stay appears below the continued US header and above the flight home. The user selected this visual direction; the canvas does not implement a grouping algorithm.

## Connection and stay styling

- **Connection:** a compact, indented clock label (“2h connection in London”) alongside a dotted vertical line joining the flight legs.
- **Stay:** a centred label with short 16px lines on either side, a bed symbol, explicit “Stay” label and bold duration (“Stay · **22 days** in the US”). It marks a break in flying, including the resumed US stay immediately below the US trip continued header.
- **Trip boundary:** a full-width hairline only between independent trips, such as the US return and the later Portugal trip. No separator between US, Canada and US continued: they belong to the same overall trip. Keep the short stay accents unchanged.
- Shape, spacing, labels and weight distinguish them in both themes without relying on colour. The bed symbol means time at the destination, not a hotel booking.

The marker icons are embedded renditions of SF Symbols (`clock` and `bed.double`), matching the native icon family.

## Rules shown

- Pair an outward and return journey only when they are together, with no intervening destination trip.
- Preserve each connecting journey's legs and connection markers.
- Count local calendar days from the final arrival in one direction to the next departure from that place. Flight time does not increase the stay count.
- Give intervening destinations separate groups at the same level.
- If the next departure is missing, omit the stay duration.

The phones show list excerpts below the existing travel-day area. All sample dates, flight numbers and schedules are fictional. Airline chips use the app's plane fallback. The palette and spacing come from the previously reviewed FlyRight design-system snapshot, 20 September 2026, main@02c3dbd. These are static renditions of the existing cards, not native app captures.

## Share

Send **[FlyRight-trip-design-review.zip](FlyRight-trip-design-review.zip)**. The reviewer extracts it and opens canvas.html. Icons are embedded, so no app or account is required. The ZIP includes exact light/dark screenshots and a feedback template. Nothing is submitted automatically.

[trip-grouping.canvas](trip-grouping.canvas) is the matching editable JSON Canvas board, with repository-relative file paths. [overview.png](overview.png) is the static overview.

The editable artifact source is canvas.template.html. render.mjs embeds existing icons and captures the design through an isolated Chrome on port 9441. All outputs stay in this design directory.
