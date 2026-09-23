# Trip-group header leads

Canvas-only design review, 23 September 2026. No implementation changes to trip grouping or `TripGroupHeading`.

Open `canvas.html`: four comparable options, five fictional scenarios, light/dark appearance, larger header text and an individual focus view. The complete offline canvas is self-contained. `trip-header-leads.canvas` provides the same four directions as an image board.

| Option | Direction | Tradeoff |
| --- | --- | --- |
| A · Flag badge | A framed destination flag with the name and dates beside it. Recommended. | Compact and closest to the current app. |
| B · Destination first | Larger trip title, with a large flag on the right. | More character and more header height. |
| C · Passport stamp | A circular country-code stamp using the app's navy. | Quieter than a full-colour flag; the full country name remains in the title. |
| D · Date tile | A calendar day/month leads the trip. | Useful for finding trips by date, with less emphasis on destination. |

The existing selected-colour header band, 16-point outer corners, enclosed flight cards and stays are identical across the options. Only the header changes. Dates never truncate; a long title or date range grows the header. The date tile shows the first day while the adjacent full range handles month/year boundaries. A missing country uses a neutral fallback. A continued trip keeps its existing title and stay-first layout. The flag identifies the destination, never a connection airport or airline.

Read before design: the cached `project/README.md` and `project/tokens.json` from FlyRight's [design system](https://claude.ai/artifact/5V5zGwdsNjkjsk7C9Jmg7v), synced 20 September 2026 at `main@02c3dbd`. Cache: `/private/tmp/claude-501/-Users-sshaji-Documents-Projects-flyRight/284e9bdf-0a80-46f6-b09a-1b4d82084cfa/scratchpad/artifact-files/2450742f-d023-4835-8036-f9a42c7c8ebd/project/`. Component READMEs are absent from that export; current `trip-group-mark.tsx`, Card and PrimaryButton supplied the implementation reference. Flags follow the user's explicit request and the existing app's destination flags.

To refresh previews and browser checks, serve this folder on localhost port 9453 (`python3 -m http.server 9453 --bind 127.0.0.1 --directory design/trip-header-leads`), start isolated Chrome with debugging port 9452, and run `node design/trip-header-leads/render.mjs`. Evidence is saved in `review.json`, `overview.png`, `overview-dark.png` and `previews/`. Checks cover small screens, both appearances, long names/dates, missing country, larger header text and identical flight content. These are reconstructed design previews, not native screenshots.
