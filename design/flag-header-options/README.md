# Compact flag headers · Interactive design canvas

Open **[canvas.html](canvas.html)** in a browser. Revision 03 keeps the existing flight cards under compact, non-collapsible destination headers. Four options vary only the faded flag background. No server, installation or account is needed. Design exploration only, 23 September 2026; no app implementation changes.

| Direction | Design | Tradeoff |
| --- | --- | --- |
| 01 · Right fade — recommended | A flag fades in at the right of the title band. | Most of the title has a plain background. |
| 02 · Soft wash | A faint flag spans the small title band. | More of the country pattern is visible. |
| 03 · Corner fade | An angled flag crop sits at the right edge. | The smallest flag area. |
| 04 · Lower fade | The flag fades upward from the lower edge. | A softer band behind the text. |

All four use a 48-pixel header for ordinary titles, with 16-pixel destination text on the left and 12-pixel dates on the right. Long content and larger text wrap when needed. There are no overlines, flight counts, leading flag icons or large destination titles. Flags start at 30% presence; the slider adjusts this. Airline identifiers remain in flight rows. Every flight remains a complete visible card in the scrollable list, including a single-flight trip.

## Interactions

- Compare all four or focus one direction with its compact header sample and design rationale. Keys 1–4 focus a direction; Escape returns to comparison.
- Switch light/dark phone appearance, adjust flag presence, and enlarge header text.
- Scroll inside each phone to follow longer trips. Headers are static; there are no collapse controls or hidden flight bodies.
- Tap a flight to open its matching detail preview; close it with the close button, Escape or the backdrop.
- The initial example shows a return trip and a full single-flight card together. Also try a single flight alone, connections, US → Canada → US, or long names and missing country data.
- Save a preferred direction locally in the browser. Reset restores the initial canvas and keeps that preference.
- Click a destination in the grouping diagram to load and scroll to it in the phone previews.

## Grouping

An outward flight, stay and return remain one destination group. Connections stay with the final destination, with separate connection markers. The multi-country example preserves US trip → Canada trip → US trip continued. Canada contains both LGA → YYZ and YYZ → BOS; the continued US stay comes before BOS → HEL. Each flight appears once. No unknown stay lengths or countries are invented. Examples are fictional and do not modify the app's grouping algorithm.

## Verification and files

The browser review checks 48-pixel headers, identical flight-card dimensions across variants, fully displayed single-flight cards, absence of collapse behavior, flight details, all focus views, the fade control, itinerary ownership, and overflow at 1600, 1000, 750, 390 and 320 pixels in both themes with large header text. See the dated result in `review-interactive.json`. These are browser prototype checks, not native app certification.

- [overview-interactive.png](overview-interactive.png) and [overview-interactive-light.png](overview-interactive-light.png): current comparison captures.
- [previews/](previews/): focused, grouping and mobile captures.
- [review-interactive.json](review-interactive.json): browser check evidence.
- `canvas.template.html`, `canvas.css`, `canvas.js`: design-only source. Run `node design/flag-header-options/build.mjs` to produce the self-contained HTML, embedding the app's existing icon assets.
- `review.mjs`: verifies the file in an isolated Chrome instance on debugging port 9464 and refreshes the captures.
- `comparison.png` and `prompt.txt`: earlier static image exploration, retained as reference; the current deliverable is the interactive HTML.

## Sources

Read the cached `project/README.md` and `project/tokens.json` from [FlyRight's design system](https://claude.ai/artifact/5V5zGwdsNjkjsk7C9Jmg7v), synced 20 September 2026, `main@02c3dbd`. The public URL was unavailable; the export contained no component READMEs. Current `src/components/card.tsx`, `src/components/trip-group-mark.tsx` and `docs/trip-grouping.md` supplied component and grouping details. Native icons are embedded from the app and the established canvas's SF Symbols marker renditions. Country artwork is decorative vector art. Expo v57 documentation was read before creating the prototype files.
