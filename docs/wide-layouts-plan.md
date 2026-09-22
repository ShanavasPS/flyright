# Wide layouts: iPad, Android large screens and iPhone Duo

Written 2026-09-22. Status: plan only, no code has changed. The designs are on
the "Wide-screen tab layouts" canvas (claude.ai/artifact/YHVZajnwxZXLXNbJrAVYZz).
Scope, as decided on 2026-09-22: every tab, including the Duo. Two items are
dropped from this release: "Why €400" and "Recent flights / Nothing to claim".
The EU261 copy is corrected (§6.4).

Deadline: store submission by **2026-09-28** (App Review takes about 24–48 h;
the hard date is 2026-09-30). The Duo ships on 2026-10-23.

## 1. Facts from the code

| Fact | Where | Consequence |
|---|---|---|
| Flights splits at ≥ 840 pt (`TwoPaneMinWidth`); nothing else looks at width | `src/screens/journeys/index.tsx:222`, `src/constants/theme.ts:99` | New splits use the same gate; below 840 nothing changes |
| iPhone is portrait-only (`UISupportedInterfaceOrientations`); iPad rotates | `app.json` | On iOS, a **phone-idiom window ≥ 840 pt wide can only be the Duo's inner display** (it ignores the lock; the idiom is `phone`) |
| Android unlocks rotation when the display's shortest side is ≥ 600 dp | `src/hooks/use-orientation-policy.ts` | Pixel Fold landscape (841 dp) and tablets reach the split; Samsung Fold landscape (~832 dp) does not |
| Folding doesn't recreate the activity (`smallestScreenSize` is in `configChanges`) | generated AndroidManifest | Selection survives a fold if the React tree is stable |
| Crossing 840 moves `listPane` to another parent → it remounts | `journeys/index.tsx:370-381` | The scroll position resets and entrance animations replay; this must be fixed for fold continuity |
| Embedded `JourneyDetail` still calls `router.back()` after Remove | `src/screens/journey-detail.tsx:938` | A stray GO_BACK in the Flights split today |
| `Person` calls `router.back()` (Leave / Remove / Block) and sets the stack title | `src/screens/person.tsx:123,157,181,327` | Needs an embedded mode before it can sit in a pane |
| `JourneyDetail` starts a live flight lookup on mount | `journey-detail.tsx:165` | Never auto-mount it outside Flights: that spends the daily lookup quota and provider units |
| A claim row has `sentAt`, `responseDeadline`, `status` and `sentSnapshot` only | `src/db/schema.ts:143` | The timeline shows dates only for "Sent" and "Reply due" |
| `Verdict` = `{eligible, regulation, compensation, reason}`; delays are cached only when observed | `src/rules/types.ts`, `src/services/disruptions.ts` | This is why "Why €400" and "Recent flights" are out of scope |
| Web stubs claims and journeys; Friends is live on web | `src/services/*.web.ts` | New splits are off on web (the Flights web split is untouched) |
| No OTA updates | no `expo-updates` | Late switch-offs use server switches (§3.4) or a rebuild |
| The `/api/app-version` answer is cached and readable synchronously at launch | `src/hooks/use-app-version.ts`, `src/services/app-version-cache` | It can carry the remote layout switches |
| The EU261 engine pays €600 for any flight > 3,500 km, including intra-EU ones (the law caps intra-EU at €400) | `src/rules/eu261.ts:23-27` | An existing money-accuracy bug, **reported separately, not part of this work** — decide whether to fix it |

## 2. Invariants (every change is reviewed against these)

1. **Below 840 pt the rendered output is pixel-identical to `main`.** That covers every phone, both Flip screens, the Fold cover and portrait inner display, iPad Split View halves and the Duo cover. The only structural change allowed is one full-size wrapper `View` that keeps the list mounted (§3.2), proven by the Pass 2 screenshot comparison.
2. **No native code, dependency, plugin or `app.json` change.** Duo support is JavaScript-only (§3.3), so no 27.1 SDK is needed.
3. **Off on web** for every new split.
4. **Auto-selection never starts a network lookup** (Claims uses local data; Friends and Updates reuse existing Convex subscriptions).
5. **No `router.back()` inside a pane.** Panes get `onGone`, which clears the selection.
6. **Every surface has a switch**, local and remote (§3.4). The Duo reversed order ships **off** and is turned on from the server after a real-device check on 2026-10-23.

## 3. Foundation (new files)

### 3.1 `src/hooks/use-split-layout.ts`
Returns `{ split, order, listWidth, seam }`:
- `split` = `width ≥ TwoPaneMinWidth && Platform.OS !== 'web' && !tabletop && switchOn(surface)`.
- `duoOpen` = `Platform.OS === 'ios' && !Platform.isPad && width ≥ TwoPaneMinWidth`. This can only be the Duo's inner display (see §1). `order` is `'twin-right'` when `duoOpen && switchOn('duoMirror')`, otherwise `'list-left'`.
- Seam:
  - Android book hinge: `fold.hingeBounds.left` (as Flights does now).
  - Duo: `Dimensions.get('screen').width / 2`. That is the physical hinge, and it's correct whether the window is full width (27.1) or excludes the bar strip (27.0).
  - Otherwise, 400 pt (Claims, Friends) or 600 pt (Updates feed).
- The formula is the Flights one, copied exactly. Flights then moves onto this hook in step D2, alone in its own commit.

### 3.2 `src/components/split-panes.tsx`
- It always renders the same wrapper (`flex: 1, flexDirection: 'row'`).
- The primary child (list or cover twin) is a **keyed** `View` that never changes position in the tree. The secondary pane and the hairline are rendered or not.
- React keeps the keyed child's identity when a sibling is added before it. That handles the Duo order (secondary on the left) and the resize, so the list keeps its scroll and state across fold and unfold.
- When compact, the wrapper holds only the primary child at full size.
- Styles are copied from `journeys/index.tsx` (`panes`, `paneDivider`, `detailPane`).

### 3.3 Duo behaviour, with no native code
- **Cover (466 pt):** compact → today's screens.
- **Open flat (951 pt):** `duoOpen`.
  - With the switch **off**, it gets the same list-left split as iPad. That's safe and already tested.
  - With the switch **on**, it gets the reversed order: the cover's screen stays in the right half and the new pane is on the left, meeting at the seam.
- **Held upright (669 pt):** compact → the cover layout scales, as designed.
- **Half-folded:** no posture signal without the 27.1 API, so it's treated as flat. The iOS side of `modules/flyright-fold` (`UIHingeInteraction`, the display's hinge region) is a follow-up once Xcode 27.1 is released.
- **Both SDKs:** with the 27.0 SDK (what we ship) the bars are horizontal; with 27.1 they move to a side strip, which arrives as a right-edge safe-area inset. Panes pad per edge from `useSafeAreaInsets()`, never as `width − 2 × inset`.

### 3.4 Switches: `src/constants/wide-layouts.ts` and the server
- **Local defaults:** `{ flights: true, claims: true, friends: true, updates: true, world: true, duoMirror: false }`.
- **Server override:** an optional `layouts?: Partial<Record<Key, boolean>>` on `AppVersionResponse`.
  - Read synchronously from `cachedAppVersion()` at launch, and live after each fetch.
  - Served by `src/app/api/app-version+api.ts` from an env var (for example `WIDE_LAYOUTS=duoMirror:on,world:off`).
  - Older binaries ignore the field.
  - Any switch can go off without a new build, and `duoMirror` goes on after the device check. This needs the usual hosting deploy.
- **Tests:** a missing, malformed or offline answer falls back to the local defaults (Jest).

### 3.5 `src/services/default-pick.ts` (pure, Jest-tested)
- `pickClaim(rows, now)`: overdue → newest open → newest closed.
- `pickPerson(circle, flying, now)`: in the air → next to depart → first following → first follower. Request rows are never picked.
- `keepOrFallback(selectedId, ids, pick)`: the selection survives while its id exists; otherwise it falls back through the rule.

### 3.6 `src/components/pane-placeholders.tsx`
Static outlines for the trip detail, the Person page and the Friends-travelling panel, plus the dashed "No active claims" and "Nothing in progress" rows. No hooks.

## 4. Flights
1. Move onto `useSplitLayout` + `SplitPanes`, which fixes the remount. This is its own commit, Pass 2 comparison first.
2. `confirmRemove(journeyId, router, embedded)`: skip `router.back()` when embedded.
3. Wide empty states: JournalHero (signed out / signed in) on the left, the trip-detail outline on the right.
4. Duo reversed order: tab root → the list stays right, the detail opens left. A pushed trip (`/journey/[id]`) unfolds into the full-screen route, as today. **The mocked "trip open on the cover → list appears on the left" is left out**: it needs the pushed route replaced by the split's selection mid-resize, which is risky navigation-state work.

## 5. Friends
- `Person` gets `embedded` and `onGone` props: skip `<Stack.Screen options>`; `onGone ?? router.back` in the three places; `SafeAreaView` edges `['top','right']` when embedded. Pushes to `/person/[id]/world`, `/preview` and `/report` stay as they are.
- `people.tsx`: following and follower rows call `onSelect` when split and push when compact. Request rows keep inline Accept/Decline.
- The "in the air" pick needs `api.live.following`, the same subscription Updates makes, but only when split.
- Empty states when split: CircleHero on the left, the Person outline on the right.
- Must still behave exactly as today: marking a side as seen, the "New" marks, picking the default tab, the Friends badge.
- To verify: what `Person` shows for a follower you don't follow back.

## 6. Claims
### 6.1 Claim pane (`src/screens/claim-pane.tsx`), built from local data only
- Header: carrier, number, route and date (the joined journey row).
- Amount + regulation, `StatusChip`, `statusGuidance`.
- Timeline: Sent (`sentAt`) → Reply due (`responseDeadline`) → current status, undated.
- Actions: `showOutcomeMenu(claim)`, "See what we sent" (`/claim-letter`), "Open trip" (`/journey/[id]`, as the card does today).
- "What we sent": plain-text excerpt of `parseSentSnapshot().letterHtml` (tags stripped, about 180 characters), only when a snapshot exists.

### 6.2 List pane
Summary card (wide only; mixed currencies fall back to counts, as `claimsEyebrow` does) → "In progress" → "Closed". Cards select instead of pushing when split.

### 6.3 States
- No active claims: the dashed "Nothing in progress" row (wide only).
- No claims: the hero on the left; "No active claims" → "How a claim works" → the EU261 table on the right.
- Error: the error card and a faded list on the left, the claim outline on the right.
- Loading: the existing `LoadingState`.

### 6.4 Corrected EU261 copy
| Distance | Pays |
|---|---|
| Up to 1,500 km | €250 |
| 1,500–3,500 km, and flights within the EU over 1,500 km | €400 |
| Over 3,500 km | €600 |

Footnote: "For arrivals 3 h+ late, or cancellations with under 14 days' notice. On flights over 3,500 km, airlines may pay half when the arrival is 3–4 h late. UK261 pays £220, £350 and £520."

## 7. Updates (feed + side panel)
- Wide: the feed on the side of the list (right on the Duo when reversed, left otherwise). The panel shows:
  - `FollowingSection` data as follower status cards ("Friends travelling"); or
  - "Coming up" (the `FriendsStrip` data) on quiet days; or
  - the outline for signed-out, `follow`, `asked` and `followers` states, with the captions from the canvas.
- When the panel is on screen, `FollowingSection` and `FriendsStrip` leave the feed. `PendingFollow` stays first in the feed.
- The same `feed`, `entries` and `circle` queries; no new reads.
- The loading skeleton (`HomeSkeleton`) keeps its current behaviour.

## 8. World (globe + side panel)
- Tab screen only: `WorldView` gets `allowSplit`, which is false for `person/[id]/world`. `world.web.tsx` is untouched.
- Split: the globe gets `width − panel` and a 360 pt panel holds, in order:
  - the period pills, then
  - one of the stats card, `RouteCard` (when a route is selected) or the empty / period-empty cards, then
  - the route list (`data.routes`; a tap selects `selectedKey`).
- The footer overlay and `PeriodCard` sheet are not rendered when split.
- Watch: `GlobeView` re-fits on `canvasSize` changes (the `holdFit` / `moved` state), and the Android black-canvas-until-textures issue on resize.

## 9. Tests (five passes)
- **Day-1 baselines:** screenshots of every tab × every canvas state on an iPhone simulator, the Pixel 9a, `Galaxy_Flip_Test`, `Galaxy_Fold_Test` (portrait) and web.
- **Also on Day 1:** does the existing Flights split clear the iPadOS top tab bar?

| Pass | What | Criteria |
|---|---|---|
| 1 Static | Diff vs §2; `npm run typecheck`, `npm run lint`, `npx jest --runInBand` (87 + new picker, switch and excerpt tests) | Green; compact branches unchanged |
| 2 Compact | Retake the baselines and compare; Maestro `release-core`, `people-tab`, `person-profile`, `claim-outcomes`, `follow-back`, `invite-follow`, `layout-bottom-edges`, `travel-day-flex-mode` | Pixel-identical below 840; all flows pass |
| 3 Wide | iPad Pro 13, iPad mini landscape, Pixel Fold landscape, Duo simulator open (both switch states): every state; default picks; select; Leave/Remove/Block, record outcome, claim closes, Remove trip, sign out inside panes; dark mode; largest text size; VoiceOver selected state | No unexpected navigation; vanished selections fall back; if the largest text size breaks a 400 pt pane, add `fontScale > 1.5 → no split` |
| 4 Transitions | iPad rotation with a selection; Split View ½ and ⅓; Stage Manager resizing across 840; Pixel Fold fold/unfold mid-selection; Duo cover ↔ open (Device Hub) mid-selection and mid-scroll; deep link / push while split; Android back | No crash, no blank pane; the list keeps its scroll; the selection is kept or falls back |
| 5 Release | The AGENTS.md release flow (backend preflight, iPhone 15 Pro + Pixel 9a physical checks), plus a release build on the iPad simulator and the Duo simulator | As the release guide requires; no new crash or ANR records |

**Go/no-go:** any difference below 840 in Pass 2 blocks the release. A wide-only problem turns that surface's switch off (server side if already shipped).

## 10. Schedule

| Day | Date | Work |
|---|---|---|
| D1 | 23 Sep | Baselines; `use-split-layout`, `split-panes`, `default-pick`, switches (local + server field) with tests |
| D2 | 24 Sep | Flights onto `SplitPanes` (own commit, compare), `confirmRemove`, wide empty states; Claims wide |
| D3 | 25 Sep | Friends wide + `Person` embedded; Updates panel |
| D4 | 26 Sep | World panel; Duo reversed order on every tab; code freeze at the end of the day |
| D5 | 27 Sep | Passes 1–4; fixes only |
| D6 | 28 Sep | Pass 5; submit to both stores (the full release flow) |
| D7–8 | 29–30 Sep | Review buffer; a switch-off or one rebuild if needed |
| — | 23 Oct | Duo on real hardware → turn `duoMirror` on from the server |

This is dense. If a day slips, the order to drop is World → Updates → Duo reversed order (the switch stays off). Nothing reaches phones either way.

## 11. Day-1 findings (2026-09-22)

- **Done:** `use-split-layout` (+ tests for every device class), `split-panes`,
  `default-pick` (+ tests), `pane-placeholders`, switches (local defaults +
  `WIDE_LAYOUTS` on `/api/app-version`, + tests). No screen uses them yet.
- **Baselines:** iPhone simulator, FlyRight_Dev (Android phone, 411 dp),
  Galaxy_Flip_Test (360 dp), Galaxy_Fold_Test folded and unfolded (with seed
  data), iPad Pro 13 landscape (with seed data). Copies in
  `~/Downloads/wide-layouts-baseline-2026-09-22/`, with the seed SQL
  (`seed-wide.sql`: 5 anonymous trips, 3 claims — overdue, sent, paid).
  Re-shoot with `.maestro/wide/tabs-snapshot.yaml`. Live data (a friend in the
  air) changes between runs, so the comparison is visual, not byte-exact.
- **Fixed:** `jest --runInBand` never exited (an unmocked `@clerk/expo` in
  `import-status.test.ts` left a MessagePort open), which means
  `release:preflight` hung after passing. Now 91 suites / 1050 tests exit in ~20 s.
- **iPad:** the floating tab bar is centred at the top and the safe area does
  **not** include it. The existing Flights split is fine (the trip map runs
  under the glass), but a second pane that starts with text (Claims, Friends)
  needs its own top offset when split on iPad, or its heading sits under the bar.
- **Web:** `Journeys` never renders on the web (`/` is the landing page), so
  there is no Flights split to preserve there; `allowWeb` stays unused.
  **Separate live bug:** `getflyright.com/flights` crashes (React #185, max
  update depth). The old `/flights` route `<Redirect>`s to `/` from inside the
  tabs layout, which swaps its whole tree for `/` on the web, so the redirect
  repeats forever. Reported, not fixed here.
- **Emulators:** the Fold and Flip AVDs had 1.0.x debug builds and are now on
  the 1.1.1 debug APK (`install -r`, data kept). Pixel_9a holds a 1.0.38
  release build (not usable with Metro); FlyRight_Dev is the Android phone
  test device. Folding the Pixel Fold emulator locks the screen, so tests
  must wake and swipe it after `adb emu fold`.
- **Dev-only noise:** after a JS reload the Android dev build shows a LogBox
  error from expo app-metrics ("Session.addMetric … shared object already
  released"). It comes from the previous runtime's session, not from app code;
  dismiss and continue.

## 12. Days 2–4 (2026-09-22) — built, and what testing found

**Built:** every tab. Flights on the shared split (list no longer remounts),
Claims (claim pane from local data, summary, "Nothing in progress", no-claims
explainers with the corrected EU261 table), Friends (Person embedded,
selection context), Updates (feed + panel: faces rail, a live pass per
friend in the air, the friends card), World (globe pane + side panel with
the route list), the Duo reversed order (switch off). Code freeze here.

**Checked so far:**
- Phone width is pixel-identical to `main` for Flights, Updates, Friends,
  Claims and a pushed person page: signed-in iPhone (dev build), the Flip,
  the Fold cover. The only differences are the live card's running border
  and "LIVE" dot, which animate. Tooling: `scripts/wide-layouts/ab.sh`,
  `pixdiff.cjs`, `.maestro/wide/phone-ab.yaml`.
- Wide on iPad Pro 13 (portrait and landscape) and the Pixel Fold (open):
  default picks, selection, empty states, the panels, the iPad tab-bar
  clearance.
- The Duo reversed order, rendered on the iPad with a temporary override:
  detail/panel left, list/globe right, meeting at the middle.

**Found and fixed:**
- *Fold from a split Updates or World left the cover cut off at the right.*
  Unsplit, SplitPanes laid out a row; content sized from its last layout
  (the globe canvas, feed photos) held the pane at its split width. Unsplit
  is now a column (commit e39d697). Flights/Claims/Friends were not affected because their
  split widths were narrower than the cover.
- The Updates panel showed the quiet-day card's "Nobody is flying right now"
  under a live pass. The card now drops that line while someone flies.
- iPad panes: a scroll view added the top safe area on top of its
  SafeAreaView; now `contentInsetAdjustmentBehavior="never"` in panes and
  the iPad tab-bar clearance is 24 pt.

**Known, not fixed (not regressions):**
- Android: unfolding scrolls the Flights list back to the top. The
  selection and screen state survive (no remount); folding keeps the scroll.
- Dev only: fast refresh sometimes misses newly added files — force-reload
  before trusting a check. Maestro cannot find elements in iPad landscape
  (test iPad in portrait; the 13" still splits) and on iOS it can attach to
  the wrong booted simulator — keep one iOS simulator booted per run.
- The Duo simulator's inner display cannot be opened from scripts (Device
  Hub only), so the Duo is covered by the unit tests, the iPad override
  check and, on 2026-10-23, the device itself before `duoMirror` goes on.

## 13. Day 5 (2026-09-22) — test passes 1–4

**Pass 1 (static):** no native/config files, no debug leftovers; the only
`router.back()` left are the pushed-page paths (`!embedded`, `onGone ??`).
tsc, lint and 91 suites / 1059 tests green, exiting on their own.

**Pass 2 (phone width, main vs branch):**
- iPhone (signed in): Flights (live-card border only), Updates, Friends,
  Claims, person page — identical.
- Fold cover and Galaxy Flip (Android, `scripts/wide-layouts/ab-android.sh`):
  Flights, Updates, Friends, Claims identical; World differs only by the
  globe's live sun/animation.
- Web (desktop width): Claims, Friends, Updates identical once the page has
  finished loading.

**Pass 3 (wide behaviour)** — found and fixed:
- *The pane followed the default pick after an action* (Fold): recording a
  response on the overdue claim made the pane jump to another claim. The
  shown item is now pinned; only a vanished item falls back. Same in Friends.
- *Accessibility text sizes* (iPad, AX-XXXL): a 400 pt column broke
  "Friends" over two lines and crushed the live pass. Above 1.5× text scale
  the window stays one column.
- Passed: Remove trip from the Flights pane (no back navigation, pane falls
  back to the next trip); record outcome in the Claims pane; mute/unmute in
  the embedded person page (sheet opens over the pane, stays in place);
  dark mode.

**Pass 4 (transitions):** Fold fold/unfold with a claim selected (selection
kept); iPad portrait→landscape with Clara selected (kept); deep link to a
person while split (pushes the full page, back returns to the split with the
default pick); Duo simulator cover (single column, no crash).

**Dev-only noise seen, not app bugs:** a LogBox "state update on a component
that hasn't mounted yet" from expo-router's `useLinking` when the dev client
opens via URL (present on main too), and Maestro's iOS driver losing the
iPad after rotations (reboot the simulator).

## 14. Regression run after the merge (2026-09-22) — phones only

`main` at 4327c6f vs 8f6c42f (before any wide-layout work), dev builds on an
iPhone 17 Pro simulator (iOS 27, signed in as the dev store profile) and the
FlyRight_Dev Android phone emulator (signed out, seeded with seed-wide.sql),
run with `scripts/wide-layouts/regression.sh`:

- iPhone: release-core (signed in, two cold starts), circle-preview,
  journey-detail-map, trip-share, travel-stats, world-globe, world-period,
  world-share, layout-bottom-edges — all pass.
- Android: release-core (signed out), people-tab, travel-stats, world-globe,
  world-period, world-share, layout-bottom-edges — all pass.
- Six flows failed on the first pass (circle-preview, travel-stats and
  world-period on iPhone; release-core, world-globe and world-period on
  Android) and passed on both the old and the new code when re-run on the
  same devices: first-cold-start timing, not regressions.
- Not run: flows that write to the store profile (trip-notes, trip-journal,
  claim-outcomes) and clear-state flows. Physical phones still carry store
  builds (Pixel 9a: Play 1.0.39) and get the new code only with the next
  release build.

## 15. Follow-ups done on 2026-09-22 (branch wide-extras, merged)

- **Outcome dates:** `claims.status_history` (migration 0015, one nullable
  `ADD COLUMN`), written by `recordOutcome`; the claim pane dates each
  recorded outcome. Earlier outcomes stay undated. Verified: the migration on
  an upgraded Android install (app opens, 7 claims intact, column present),
  and an outcome recorded through the UI stored its date.
- **"Why €…" card** (claim pane) and **"Recent flights"** (wide Claims list
  with nothing in progress; the no-claims pane), from
  `services/claim-explain` — only facts the app holds; an unrecorded delay
  reads "Delay not recorded" / "Not checked".
- **Split from 740 pt** (`TwoPaneMinWidth`, was 840): every iPad in
  portrait and Galaxy Folds in landscape. Panes never go below 375 pt
  (`MinPaneWidth`, `paneWidth`, `paneShare`): the first iPad mini run showed
  Flights' 312 pt list crushing the stats card.
- **Checked:** iPad mini portrait (744) — all tabs; phone width pixel-
  identical to main on the signed-in iPhone and the Android phone emulator
  (a first Android run was spoiled by the dev-only expo-router LogBox and a
  loading frame, clean on re-run). 94 suites / 1095 tests.
