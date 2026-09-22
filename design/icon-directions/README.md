# FlyRight icon directions

## Combined comparison · study 02

Open **[comparison.html](comparison.html)** for the new combined review: **E / Horizon**, unchanged **P2a / Bold**, **P2c / Close-up** and **A / Glass contrail** from [the user's reference canvas](https://claude.ai/artifact/ELZJdh8ydFd5i6bgq93am4), and our original **A–D** below. The reference labels include “Reference” to distinguish its A from our A.

Select any card to inspect it at 60, 40, 24 and 16 CSS pixels. “64 px” shows every card's main image at home-screen scale; “Grayscale” applies a comparison filter, not a platform-specific tinted asset. SVG/PNG downloads preserve the original colour artwork. **[comparison.canvas](comparison.canvas)** is the matching editable JSON Canvas board; **[comparison-overview.png](comparison-overview.png)** is a static overview.

E / Horizon combines the globe composition from P2a and the larger diagonal aircraft from P2c, drawn afresh with the existing FlyRight navy/silver tokens. It removes the reference's rings, destination target, grid and decorative green. It is the recommended globe direction; Original A / Contrail remains the recommended simple graphic mark.

The reference SVGs in `references/` were copied from the exact linked artifact's saved source (`check-11-def.svg`, `check-13-def.svg`, `check-0-def.svg`). The artifact URL was confirmed against its original publish record. No reference script is executed, and the references retain their original colours and effects. They are visual studies, not verified native glass assets.

Rebuild this comparison independently:

```sh
node design/icon-directions/render-comparison.mjs
```

Edit the new mark in `horizon.mjs`, the review in `comparison.template.html`, and the labels/layout metadata in `render-comparison.mjs`. The original study below is preserved. JSON Canvas file paths assume the repository is the vault/workspace root.

## Original comparison · study 01

Open **[canvas.html](canvas.html)** in a browser for the interactive review. It runs offline without installing dependencies. Choose an appearance, mask and direction; the detail panel shows actual CSS-pixel sizes and the current icon for comparison. Vector and PNG downloads use an unmasked square ground.

**[flyright-icons.canvas](flyright-icons.canvas)** is a JSON Canvas 1.0 board. Its image paths are relative to the repository root, so open the repository as the vault/workspace in a JSON Canvas-compatible application. Keep the `assets` folder with it. The visual overview is also available as [overview.png](overview.png) and [overview.svg](overview.svg).

## Directions

- **A / Contrail — recommended.** A continuous check/wing silhouette. Evolves the existing identity.
- **B / Wingform.** A swept F monogram. Explores a new symbol in the existing palette.
- **C / Orbit.** An open orbital flight path. Connects the identity to World and travel history.
- **D / Departure.** A bespoke aircraft silhouette. Direct and readable, with less category distinction.

All four have porcelain, navy and one-colour presentations. The latter is a silhouette study, not a production Android monochrome mask. Masks shown in the review are visual approximations, not platform templates. None of these concepts is wired into the application, Expo configuration, stores or icon-generation script.

## Source and brand decisions

Read before designing: [FlyRight design-system artifact](https://claude.ai/artifact/5V5zGwdsNjkjsk7C9Jmg7v), using its locally cached `project/README.md` and `project/tokens.json`, synced **2026-09-20**, ref **main@02c3dbd**; plus the `project/assets/Icons/README.md` from the full local artifact export. The public artifact could not be read through the web tool. The brand book's contrail-check rule informed A; B–D deliberately propose alternatives in response to the redesign brief.

The exact identity tokens used are ink `#0c1b36`, navy `#16345f`, silver `#a9b8ce`, silverBright `#e6edf8`, porcelain `#edf2f9`. The board uses the documented white background, hairline borders, spacing/radius ladder and system fallback for Inter. Green remains reserved for good outcomes and money; no decorative green or gold was introduced.

The supplied icon asset notes describe silver on porcelain, while the actual current generator uses navy ink on porcelain. The before/after comparison embeds the actual current `assets/images/icon.png`. Concepts use high-contrast ink on porcelain and bright silver on ink. Navy is the recommended default appearance for the new design, subject to review.

## Edit and render

The vector geometry and concept copy live in `concepts.mjs`. The interactive layout is in `canvas.template.html`. With the repository's existing dependencies:

```sh
node design/icon-directions/render.mjs
```

This regenerates only this review folder: twelve 1024px SVG/PNG concept pairs, four board SVG/PNG pairs, the overview, and the self-contained `canvas.html`. It never writes the app's current icon assets. `flyright-icons.canvas` is the editable companion board.

After a direction is selected, refine optical balance against the actual platform masks, prepare platform-specific assets, and review on devices before replacing the installed icon. The current request stops at concept review.
