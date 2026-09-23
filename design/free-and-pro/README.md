# Free to remember. Pro when you travel.

Product proposal · 23 September 2026 · app reviewed at `1f4efa9`.

Open [canvas.html](canvas.html), especially **Revised prompts** and **Before take-off**. [revised-prompts.canvas](revised-prompts.canvas) is the connected Canvas board, now including the home dismissal branch. The HTML works offline. All people, flights and prices are illustrative.

This folder is a design review only. No application, backend, billing configuration, customer data or release has been changed.

## Latest refinement: dismiss on home, keep access in trip details

The home surface in these previews is the **Flights** list. One compact **“Live updates off · See Pro · ×”** card covers all upcoming flights. Tapping × hides that card from home permanently, with no confirmation or paywall. Trips remain in place. Opening another trip, returning to the screen, expiry, a new trip, reinstall or another device must not reset that choice. In the future implementation, store an account-level home-dismissal flag separately from the first-introduction exposure and reminder choices; an unresolved flag must not briefly flash the card.

Inside each owned upcoming trip, use the same **“Live updates off · See Pro”** card, with **“For this trip”** as its subtitle and no home-dismissal button. This replaces the existing **“Where’s your plane?”** acquisition row; it is not an additional card. Home dismissal never removes access here. The app itself still has the aircraft row until a future implementation. With active Pro, show real flight data or an honest unavailable/not-yet-known state instead of acquisition.

The large first introduction remains once per account. Its existing “Not now” consumes the introduction; the compact home card has its own explicit close. Closing the compact card also consumes the introduction, so no larger promotion can return in its place. User-requested paid actions remain accessible. Free family viewing and past-flight logging stay free of travel acquisition.

## A shorter Pro offer

Both home and trip-detail Pro buttons open the same short explanation, retaining the correct trip:

- **What Pro adds**
- Live gate, terminal, delay & belt updates
- Postcards for your people
- Delay claim preparation
- “Updates where available. Family follows free.”
- **See plans**
- A single **“Remind me 2 days before this trip”** button
- **Continue free**

The initial reminder choice is one button with no heading, subtitle or chevron. There is a 24px gap before **Continue free** to reduce accidental taps. No calendar, exact time, delivery explanation or repeated subscription disclaimer appears at this step. Tapping the whole row opens the detailed next step. The pricing step also drops the duplicated benefit list while retaining monthly/yearly prices, account-wide access, renewal terms, cancellation, restore and legal links. Prices shown are not verified store offers.

From home, default to the active owned trip, otherwise the nearest upcoming departure. From Paris details, keep Paris. Pro covers the traveller's account while active; the reminder belongs to the selected departure, not all trips or every return/connection. The canvas's trip selector previews London, Paris and Tokyo.

## Reminder details stay on the next screen

The confirmation shows the selected trip, departure, exact reminder date and local time (48 hours before), delivery and **Set reminder**. It clearly says that no subscription or payment starts automatically. Close without confirming and nothing is scheduled. A small reminder label appears on that trip after confirmation; others are not opted in.

A requested reminder stays available inside the selected trip. It can reuse the home status position only if the home card has not been hidden. **Home dismissal always wins**, including when a reminder becomes due or is requested later from trip details. It must never restore the closed home promotion. Reminder consent is separate: closing home does not cancel an existing reminder or change an optional push opt-in; the detailed step explains where it will appear. Push delivery would require a separate opt-in and notification permission. Deduplicate due reminders across devices, and consume them after dismissal.

Within 48 hours, the first offer simply says **“You’re flying soon. Choose Pro when you’re ready.”** No impossible reminder action or technical scheduling explanation. A trip change reschedules an opted-in reminder with its new date visible; deletion/completion cancels it. Do not retarget another journey or use a recomputed visual destination-group index. Pro activation cancels pending acquisition reminders; expiry never revives them or a dismissed home card. Access for later trips depends on Pro still being active then.

## Try the canvas

Tap × on the middle phone in **Revised prompts**. The home card disappears; open Paris and the trip-details card remains. Tap its Pro button to see the shorter modal and the compact reminder option, then open the detailed confirmation. **Restore home card · preview only** resets the design example. The timing controls preview a due reminder, near-departure and active-Pro states.

`home-card-dismissed.png` shows the dismissal; `previews/short-pro-modal.png` shows the shorter offer. `multiple-trips-timing.png` compares the compact first step with detailed reminder confirmation. The earlier A/B/C and `flow.html` studies are retained as historical context and link to this latest refinement.

Canvas state is local demonstration state and resets on reload. Permanent, cross-device account persistence is a proposed app requirement, not an implemented account change. No real reminder, billing or notification is created. The parallel phones show stages for review, not multiple screens appearing simultaneously in the app.

## Claims boundary retained

Claim preparation/processing remains Pro, alongside live monitoring and postcard publishing. Automatic possible-claim alerts are included in Pro monitoring. Manual eligibility remains a separate decision: the recommended explicit check is free without background monitoring; the Claims selector also previews all new checks behind Pro. The user has not selected between those eligibility alternatives. Nothing in this refinement changes that boundary or implies that a purchase guarantees eligibility or payment.

### Claim continuity and coverage

Keep existing claim documents, previously known eligibility results, submitted letters, recorded deadlines and manual outcome recording available after expiry. New paid preparation/regeneration and automatic follow-up require active Pro; label stopped automation without deleting completed work or pretending a stored deadline went away. Do not treat an unperformed check as “not eligible”. Paying cannot guarantee eligibility or a payout. The claim tool assists the traveller through the airline's supported sending channel; it is not an automatic filing service.

An expired user can subscribe after travel to prepare a claim even if they were not Pro during the flight. Reconstruct the check from available admissible flight/delay details; do not promise historical provider coverage. Never use the FlightAware route feed for claims. Old trip logging itself stays free and has no automatic upsell.

The current real-claim guard is at `VerdictCard.startClaim`. The inspected `ClaimWizard` does not itself check Pro. A future implementation must cover direct/deep-link entry, resumed drafts and paid generation/delivery actions as well as the visible button; verify entitlements at any server-backed paid action. Existing-letter viewing/export must remain distinct from new generation. No implementation has been performed.

### Durable prompt policy

Record a versioned, account-scoped introduction exposure only when actually visible, plus the separate permanent home-card dismissal and explicit reminder settings. Resolve that state before showing a large card; a loading or sync failure must not restore a possibly dismissed home card. Trip details retain the compact entry. Sync it across devices and carry the existing introduction state through upgrades. Do not reset on app restart, itinerary edits, new legs, Pro expiry or reinstall. Treat anonymous local exposure conservatively and merge it on sign-in. User-initiated feature entry is always available. Reminder delivery is opt-in, deduplicated, cancelled/rescheduled on trip changes, and suppressed when Pro becomes active.

## Clarification: when does “trip readiness” appear?

Open **[the flow canvas](flow.html)**. The app does **not** have a screen called “Trip readiness.” That was an unclear design label for option B. Existing trip details and the existing travel-day checklist are different features.

The clarified proposal presents B as a new sheet called **“What Pro adds to this trip”**. It opens only after a free traveller taps **“See Pro for this trip”** on the one-time introduction or a quiet “See Pro” row. The latest design replaces the aircraft acquisition entry with the same live-updates card in trip details. Both entries open the shorter explanation, with plans now or the compact take-off reminder; the latest timing panel demonstrates it. It can be opened after saving or weeks later. Saving, opening Flights or approaching departure does not automatically open it.

1. **Existing:** add/import a flight → brief saved confirmation → Flights. Free confirmation copy needs to describe saving, not promise automatic monitoring.
2. **Existing Flights + first introduction/compact entry:** the flight is already saved. The large card is shown only for the first introduction; subsequent visits and trips stay compact unless the home card was closed, in which case it stays hidden.
3. **New sheet (earlier B):** “What Pro adds to this trip” compares saved/free details with paid monitoring, publishing and claim tools. “See plans” advances; “Not now” or close returns to the same saved trip and consumes the account-level introduction. Only an explicitly requested reminder can follow.
4. **Existing paywall + proposed content:** choose monthly or yearly, then confirm in the store. Closing returns to the saved trip. Cancelling store confirmation returns to the plans; failure leaves the account free.
5. **After confirmed purchase:** return to the same trip with Pro active. A distant flight says when monitoring will begin rather than pretending to be live now.

No automatic acquisition flow for past-flight logging, reading someone else's trip or an active subscriber. A user-initiated paid claim action on a past trip can still open its contextual offer. The sheet is optional in the design: its comparison could instead sit above pricing in the existing paywall to remove a step. The flow canvas makes the separate-sheet version explicit; neither version is implemented.

`flow-overview.png` shows the entry, sheet and plans together. `pro-flow.canvas` is the corresponding board with connected steps and free-return branches. The original comparison now links to this clarification, and A's action opens the explanation before plans.

## Recommendation

Make keeping flights and keeping up with people free. Sell Pro to the person who wants automatic monitoring, postcard publishing or claim preparation. Their approved followers receive the resulting updates and postcards for free. A follower's subscription must never be required to view a traveller's shared content.

Use **A once as an introduction**, then compact entries, **B when someone asks what Pro adds**, and **C as an optional reminder**. The first canvas compared these treatments side by side; the clarified flow assigns them distinct roles: entry, explanation, and optional reminder. Do not stack three promotional cards on one trip.

Pro belongs to the traveller's account and covers their flights while active. It is not a charge per trip, per person following, or per flight someone books for somebody else. Booking a flight does not establish permission to share another person's travel.

## Feature boundary · revised

| Capability | Free | Pro |
| --- | --- | --- |
| Add past or upcoming flights, including manual entry and imports | Yes; no subscription-based flight count cap | Same |
| Saved itinerary, original schedule, boarding pass, seat, notes and private journal photos | Yes | Same |
| World, history, statistics and existing static share/export features | Yes | Same |
| Follow people, invite family, approve followers and choose an audience | Yes; remove the three-follower monetization cap | Same |
| Read, react to and reply to permitted postcards | Yes | Same |
| Receive another traveller's live updates, notifications and supported lock-screen activity | Yes, when that traveller has active Pro and enables sharing | Same |
| Automatic monitoring of your own flights, schedule changes, terminal/gate/delay/belt updates, inbound-aircraft warnings and supported live activity | No; retain clearly labelled saved facts | Yes, where data is available |
| Publish a new postcard, with a photo or text only | Draft locally; subscribe to publish | Yes, within the agreed posting window |
| Open existing photos/postcards, manage their audience, delete your content or export your records | Yes after expiry too | Same |
| Automatic possible-claim detection and alerts | No | Yes, within monitoring |
| User-initiated eligibility check | Recommended free; canvas also previews the all-Pro alternative | Included either way |
| New claim preparation, letters and automated follow-up | No | Yes |
| Existing claim letters, known results, recorded dates and manual outcome recording | Yes after expiry too | Same |

Free logging does not mean unlimited paid-provider requests. Keep reasonable abuse limits and a working manual/import fallback. Do not send a person to Pro because an old flight is outside provider coverage or a provider is down.

**Seats are different.** Current flight data includes gate, terminal, check-in desk and baggage belt. The seat comes from the traveller's saved information; the current provider model does not expose passenger seat changes. Keep saving/viewing an imported or typed seat free. “Automatic seat changes” must not appear in Pro marketing without a real source. A previously saved gate remains a saved fact, with its source/date; fresh monitoring is Pro. Never obscure the user's boarding pass.

## Three prompt directions

### A · First introduction — once per account

On the first relevant upcoming-trip visit, show the saved itinerary first. The one-time card says: **“Keep this trip up to date.”** Explain the specific additions: gate/terminal and delay alerts, arrival belt when available, postcard publishing and claim preparation. Include **“Your family can follow for free.”**

Actions: **“See Pro for this trip”** and **“Not now.”** The first opens B's proposed explanation sheet, then “See plans” opens subscription choices; the second collapses the promotion to a quiet “Live updates off · See Pro” row. Saving never opens a paywall automatically. Label the plan sheet as account-wide access so “for this trip” cannot be mistaken for a one-time trip purchase.

After this initial exposure, later visits and new trips use the compact “Live updates off · See Pro · ×” entry until closed; the entry then remains only in trip details. Ignoring the initial card is not permission to show it on every visit.

### B · What Pro adds to this trip — proposed explanation sheet

The original canvas showed this comparison as a full trip-detail layout, making its placement unclear. The clarified flow uses a **new sheet above the saved trip**, reached by tapping A's Pro entry. Separate **“Saved with your flight”** from **“Add with Pro.”** Saved itinerary, boarding pass and seat remain visible. Pro rows name what is missing: automatic gate/terminal and delay changes, arrival details, postcards, live sharing to family and claim preparation. This is a feature comparison, never a claim that a free itinerary is unsafe or incomplete.

Action: **“See plans.”** Secondary: **“Not now.”** The close control also returns to the saved trip. No blurred real flight values, fabricated gate examples presented as actual data, countdown pressure or red “unprotected” states.

Best for: answering “what am I missing on this trip?” Tradeoff: adds a step before pricing; combine the explanation with the existing paywall if a shorter flow is preferred.

### C · Closer to departure — most sympathetic to occasional flyers

Only when the person chooses the reminder option, say **“Subscribe closer to take-off.”** Keep a short benefit explanation and offer **“Remind me 2 days before.”** The person explicitly opts in. At the chosen time, show **“Flying soon? Add live updates.”** The app can show the reminder in-app; push requires the appropriate consent and enabled permissions.

This is a reminder, not a deferred subscription purchase. Access and billing start only when the user completes a purchase. Do not promise activation on the travel date or automatic cancellation after landing.

Best for: people booking months ahead. Tradeoff: requires reminder state, schedule-change handling and reliable delivery; no notification permission means an in-app reminder only.

## Prompt timing and suppression

| Moment | Proposed behaviour |
| --- | --- |
| Onboarding | “Save your flights. Follow your people. Start free.” An optional intent choice can prioritise Flights or Updates, without creating permanent account roles. No mandatory trial or paywall. |
| Add a past flight | Save and celebrate the record. No Pro interruption. |
| First relevant upcoming trip | One inline A introduction. Mark actual exposure, not every render. |
| Later visits, new trips or Pro expiry | Compact on home until closed, then hidden permanently. Trip details retain the entry. Never reset the introduction. |
| Far from departure | Quiet entry; optional C reminder. Never imply Pro should be bought now to save the flight. |
| Within 48 hours | Never restore a hidden home entry. A requested reminder remains with its trip; no unsolicited escalation. |
| Open a paid function | A contextual explanation and the plan sheet. Return to the same trip/draft after closing or subscribing. |
| Browse Friends, Updates or another person's trip | No viewer paywall and no Pro interruption. Paid traveller live coverage does not depend on viewer entitlement. |
| No upcoming flights | No automatic travel upsell. An unobtrusive Pro entry in Settings remains available. |
| Already Pro / active trial / cancelled but paid-through | Show the active benefit and access end date where relevant; suppress acquisition prompts. |
| Expired | Preserve history and relationships. Resume monitoring only after a new entitlement is confirmed; show a quiet “Live updates off” state with the last update time. |

Cap: one large introduction per account, no automatic repeat card, and no unsolicited near-departure nudge. User-initiated requests for paid features can always open the relevant explanation. Persist separate introduction, home-dismissal and reminder state across devices; reschedule or cancel reminders when trips change, disappear, finish, or the traveller subscribes. Do not use gate-change-style notifications for marketing.

## Family, postcards and expiry

- An approved free parent sees the traveller's shared itinerary, existing postcards, replies and live updates funded by the traveller's active Pro. Include a clear “Following is free” explanation on invitations and onboarding, rather than repeating it on every feed item.
- If that parent later flies, Pro prompts depend on their own upcoming trip or publishing action. Following remains free.
- If the traveller is free or expired, keep the shared saved itinerary and existing permitted postcards readable. Show “Last updated … · Live updates unavailable”; do not ask the follower to pay or disclose the traveller's billing status.
- Check active author Pro at publication on the server. Check before starting an expensive publish upload too, and re-check at publication. A text-only postcard is still a postcard.
- Keep typed text and selected images through paywall dismissal, purchase errors, app restarts and entitlement sync. Purchase success returns to the draft; the traveller explicitly taps Publish. Nothing is sent automatically after payment.
- Private journal photos are separate from publishing. Do not gate their ordinary saving/sync through a shared upload endpoint. Shared-photo lifetime and ownership must stay intact when a postcard or journal copy is deleted.
- Postcard reading, reactions, replies, audience changes and deletion remain free after expiry. The current 48-hour recent-feed window is independent of subscription. Recommend an easy “Earlier postcards” route to permitted trip archives so a grandparent does not miss a message by opening late; do not silently change deletion or retention policy.
- The composer currently allows posting on the flight day through one day after landing. Keep that rule for the smallest first release, but explain it before purchase. A broader holiday/whole-trip postcard window is a separate product decision; an otherwise ineligible old trip must never send someone to checkout.
- Cancelling renewal keeps paid access until the verified expiry. Show the date and an easy store-management link. After expiry, monitoring, new publishing and new paid claim work stop; completed records, letters and connections stay. A mid-flight extension would require an explicit grace policy, not accidental indefinite access. Recommend assessing a bounded completion grace for already active flights before rollout; not assumed by this proposal.

## Plans and purchase flow

Lead with monthly for occasional flyers; make yearly easy to compare for frequent flyers. Use actual localised store offers, billing periods and eligibility at runtime. The canvas uses **€4.99 monthly and €29.99 yearly only as examples**, taken from the repository's historical web price ladder; they are not current verified native prices. No price or product change is required to start this redesign.

State the full yearly charge, not just a monthly equivalent. For a trial, show its eligible duration, subsequent charge and renewal terms; never assume every user receives the existing advertised 14 days. State: **“Starts today. Renews until cancelled. Manage anytime in Settings.”** Never market a renewing month as a one-off trip pass. If paid access ends before a return flight, show the actual date and remaining coverage; do not say the whole trip is covered.

Retain existing annual/lifetime purchases and restore support. A non-renewing trip pass is a possible later product, but requires pricing, multi-leg rules and store setup; it is not needed for the requested subscribe-near-travel/cancel-after model.

## What needs to change in the app

| Area | Current evidence | Proposed work |
| --- | --- | --- |
| Capability rules | `src/services/purchases.ts` has one broad Pro lock; it documents claims, inbound prediction and circle size. `convex/entitlements.ts` mirrors RevenueCat. | Introduce explicit capability decisions for owner monitoring, author publishing, claim processing and authorised follower reading. Separate subscription loading/error/expired states; an unknown entitlement must not break free reading. |
| Following | `convex/circleShared.ts` caps free accounts at 3; `liveHelpers.circleFull`, circle mutations and invitation screens enforce/pitch it. | Remove the monetization cap, rejection and “family needs Pro” copy. Keep approval/privacy/blocking and independent abuse limits. Review invite/create/accept/share-back/reconnect paths and `circleInternal.ts` notices. |
| Flight data | `flight-watch.ts`, foreground lookup, API proxy and server live poll chains can fetch travel facts today; inbound warnings alone are selectively Pro. | Keep one basic schedule/import path free. Enforce paid monitoring server-side across fresh and cached data, refresh endpoints, polling, pushes and live activities. An authorised follower reads a Pro owner's shared session without owning Pro. Deduplicate provider work per flight, rather than fetching once per follower. |
| Surfaces | Flights/trip detail, `live-pass`, travel-day store, follower screens and World consume the same facts. | Render saved schedule vs live monitoring explicitly. No stale paid value labelled live after expiry. Gate own real-time position/track with live monitoring while preserving the free World/history view and timetable overview. Respect existing provider licensing and claims separation; consult `docs/flight-paths.md` before that work. |
| Notifications | Local flight watch and server live sessions both issue updates; follower activities have their own path. | Gate traveller monitoring at the source, keep follower delivery free, stop or resume jobs on verified entitlement changes, and separate reminder consent from operational notifications. Purchase reconciliation must activate monitoring without duplicate sessions or pushes. |
| Postcard authoring | `TripUpdateComposer` and `convex/updates.ts:post` have no Pro check; journal uploads are shared with postcards. | Add contextual publish gating and a resumable draft. Enforce author entitlement and valid audience/window server-side, while all authorised read/reaction/comment paths stay free. |
| Paywall and account | Native paywall is remotely configured in RevenueCat; Settings and Manage subscription already support restore and expiry. | Lead with the requested feature (inbound aircraft, travel, postcard or claim), retain claim Pro benefits and remove circle-size selling; monthly prominent, yearly comparison, clear billing and cancellation. Preserve deep-link return context. Remote paywall changes are required in addition to app code. |
| Claims | `journey-detail.tsx` gates real claim filing and surfaces inbound warnings as Pro. | Keep claim preparation Pro. Distinguish manual eligibility from automatic detection. Audit direct wizard/deep-link/resume paths and paid generation, preserving existing letters and recorded claim history after expiry. |
| Onboarding and marketing | Onboarding/notification primer and `/go-pro` remain strongly claim-led; the website advertises trials. | Explain free logging/following, optional Pro travel, family reading and posting distinction consistently in onboarding, invite landing, website, store text/screenshots, support, legal descriptions and remote offerings. |
| Availability exceptions | `billingAvailable` currently exempts the Galaxy build because it cannot sell Pro. | Resolve a supported entitlement policy for that distribution before enforcing new server gates. No paywall without a working purchase/restore path, and no insecure client-controlled bypass. Existing subscribers still get their entitlements. |
| Transition | Today ordinary live facts and postcard creation are not the proposed paid features. | Announce the changed boundary honestly. Preserve historical content and existing purchases; decide how existing free travellers and flights already in progress transition before activation. Deploy server support before app gates; version policy so old clients fail gracefully. |

Read-only source review only; no dashboards, live offerings or provider entitlements were changed or fully audited.

## Delivery sequence and acceptance

1. Keep live monitoring, postcard publishing and claim processing in Pro. Decide manual-eligibility treatment, postcard window and migration/grace policy. Select A/B/C or the recommended combination. No pricing experiment is necessary for this decision.
2. Centralise capabilities and server enforcement; remove circle monetization. Separate free schedule lookup from paid monitoring and fix all direct/cached/anonymous access paths without breaking permitted follower access.
3. Add the contextual screens, durable drafts, subscriber/expired states and opt-in reminders. Update remote paywall and marketing together.
4. Validate free flight logging/imports with provider unavailability; more than three followers; free parent receiving a Pro traveller's updates; free parent following a free traveller; privacy/revocation/blocking; an expired author's old postcards; trial/cancel/expiry/refund/restore/account switch; paywall-dismissed drafts and upload retries; reminders after itinerary/time-zone changes; old app compatibility; supported distribution exceptions.
5. Roll out with metrics for upgrade entry/conversion, nudge dismissal, provider cost per monitored flight, publishing success, follower retention and refund/cancellation. Measure the first introduction and explicit feature entries separately; never put receiving behind an experiment. Keep card exposures out of notification engagement metrics.

## Design source and preview verification

Read the cached export of [FlyRight's design system](https://claude.ai/artifact/5V5zGwdsNjkjsk7C9Jmg7v): `project/README.md` and `project/tokens.json`, synced 20 September 2026 from `main@02c3dbd`. The public artifact could not be opened by the web tool. Neither cached export contains component READMEs, so existing Card and PrimaryButton source supplied those details. Current app navigation supersedes the snapshot's older tab list: Flights, Updates, World, Friends, Claims; Settings is reached from the avatar.

White bordered cards, navy dark surfaces, cobalt actions, the established type/spacing/radius ladder and existing tab assets are used. No new icon library or decorative gold/green. Screens are reconstructed proposals, not native captures. Canvas-only interaction/layout checks are recorded in `review.json`; they are not app or device tests.

Build the offline HTML with `node design/free-and-pro/build.mjs`. Capture/check it with isolated Chrome on port 9444 and `node design/free-and-pro/render.mjs`. These scripts write only this design folder.
