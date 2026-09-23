# Free and Pro

Implemented 23 September 2026 from `design/free-and-pro/README.md`, with the user's later refinement: acquisition cards are **only for future flights**. No card appears for an empty journal, a past-only journal, a flight already departing/in progress, or past trip details. The next future departure supplies the single home card. Explicitly opening a paid feature can still explain Pro.

## Access

| Free | Pro while entitlement is active |
| --- | --- |
| Add/import past and future flights, saved seats/passes/notes, private journal photos, World/history | Monitor the traveller's own flights: gate, terminal, delay, belt, inbound aircraft and live position where available |
| Unlimited following, subject to existing privacy, approval, block and abuse rules | Own live activities and travel alerts |
| Read, react and reply to permitted postcards; receive a Pro traveller's shared updates | Publish text/photo postcards |
| Manually check a past delay; keep existing claim records and letters | Prepare new claims/letters and receive automated deadline follow-ups |

Family access depends on the **traveller's** entitlement, not the viewer's. Saved schedules remain readable after monitoring ends; the UI no longer labels them live. Previously saved facts/history remain. A cancelled renewal retains Pro until its verified expiry; there is no automatic post-trip cancellation or additional grace period. Seat storage remains free; automatic seat-change alerts are not promised.

`convex/provider.ts` authorizes monitoring before cache reads, and the hosting flight-status route whitelists free schedule/final historical data. Current flight paths also check entitlement or an approved follower's access to the Pro owner's matching trip. Historical paths retain the existing licence/retention constraints. Paid-owner polling, pushes and follower activities stop on expiry. Claim document preparation is local and gated at preview, save and delivery; existing records remain readable.

Postcards keep the existing window: departure day through a day after landing. Private/out-of-window trips explain the restriction before checkout. The server rechecks ownership, window, audience and Pro at publication. Publishing checks entitlement before upload, separately from free private journal uploads. Caption/photo drafts are account/trip scoped and survive paywall cancellation and app-container moves. Purchase never publishes automatically.

## Prompts and reminders

- The large introduction is shown once per account, on actual exposure beside a future flight.
- One compact home card covers all future flights. Its × saves a permanent account preference; reconnect, another trip, Pro expiry and due reminders cannot restore it.
- Each future trip retains its own compact card, without ×, replacing the inbound-aircraft teaser. It disappears at departure time. Past trip details have no acquisition card.
- The offer is three benefits, **See plans**, **Remind me 2 days before this trip**, and **Continue free**, with 24 points of separation before Continue free. The reminder action is outlined; Continue free is bold action-blue text with a 52-point tap area on both the offer and plans. Under 48 hours there is no reminder action.
- A separate confirmation shows the exact reminder date/time at the origin. It requires **Set reminder** consent. This release provides one **in-app reminder**, not a scheduled push and not a deferred purchase.
- Reminder consent belongs to a stable journey key. Changes retime it; deletion/departure or Pro activation cancels it. Dismissal is shared across devices. A hidden home card stays hidden; the reminder remains in future trip details.
- Monthly is first in the native acquisition screen; package prices and periods come from RevenueCat. Annual/lifetime, restore, subscription management, renewal/cancellation terms and legal links remain available. No fixed trial eligibility is promised.

Suppression and reminders are separate Convex tables (`proPreferences`, `proReminders`). Local suppression is monotonic and account scoped; unresolved preferences suppress the home card until hydrated. The server entitlement mirror supports platforms without native billing. Galaxy builds do not bypass entitlement checks or offer an unsupported checkout.

## Guests

Guests can save flights locally, dismiss the home card, continue free and browse actual Pro prices without signing in. A free account is still needed for following people and accessing their permitted posts; that is not a Pro requirement. Account sync claims the guest's local flights after sign-in.

Buying or restoring Pro asks for sign-in before any store transaction and carries the journey, selected plan and original destination back to the plans screen. The user must tap the purchase action again; signing in never purchases automatically. A reminder also asks for sign-in, then returns to the selected trip's separate confirmation. Set reminder stays unavailable until that guest flight has synced to the account. Cancelling sign-in returns to the offer/plans as a guest without purchasing or saving a reminder.

## Visual treatment

The overview, reminder and plan chooser now share a Pro wordmark, circular close control, navy travel card and native SF/Material symbols. The overview card shows the saved flight route/date, followed by three compact benefit rows. The reminder makes the origin-local date/time prominent and explains the in-app reminder and separate purchase decision as two steps. The plans use explicit selection circles, full store prices and short descriptions for monthly, yearly and lifetime packages.

The offer uses a 90%-height initial sheet, with a full-height detent available; both routes retain the root ScrollView needed for reliable initial sizing on iOS. Content is limited to 520 points on wide screens and remains scrollable at larger text sizes. The reminder action remains outlined. Continue free remains bold blue with the approved separation and 52-point tap area. No pricing, entitlement, reminder-consent or trip-group behavior changed with the visual redesign.

Redesign checks: the 16 offer/plans tests, TypeScript and targeted lint passed. The iOS cold-launch regression passed repeated real-button opens and continuing free from both offer and plans. Android showed the offer, an existing saved reminder and the actual configured plans in light and dark appearances; the reminder was preserved, no purchase was made, and light appearance was restored. Native captures are saved in `design/free-and-pro/previews/redesigned/`. The separate trip-header options in `design/trip-header-leads/` remain canvas-only.

## Validation and deployment

The full Jest suite passed: 100 suites / 1,180 tests. The offline backend/security runner passed 32 checks; app and Convex TypeScript checks passed; lint has only the pre-existing `time-dialog.tsx` import warning. The web export succeeded, and the development backend contract check confirmed all 71 client functions are deployed.

Automated coverage includes empty/past/in-progress journals, disappearance at departure on both card surfaces, home dismissal versus detail access, separate reminder consent, DST/48-hour timing, rescheduling/expiry, free cached-response redaction, paid-owner/free-follower access and privacy, text-only publishing, monthly package ordering, saved details after expiry and durable account-scoped drafts. Mocked checkout tests cover billing-account mismatch, cancellation, pending entitlement and confirmed purchase return.

Native development checks on the existing iOS simulator and Android emulator covered the short offer and returning free. iOS also rendered configured RevenueCat monthly/yearly/lifetime prices; Android covered both reminder screens for an existing future trip, leaving without setting it. Android trip-detail checks confirmed no acquisition card on a past trip and the compact card on a future trip, scrolling to its position. No purchase was made or customer entitlement changed by these UI checks. These are development-client checks, not physical-phone or store-billing verification.

Follow-up fixes: the offer and acquisition plans use a root ScrollView so the iOS form sheet sizes their content on first presentation. `.maestro/pro-offer.yaml` passed from a cold launch, opening the real home button three times, continuing free each time, and then opening and leaving plans. The final blue Continue free / outlined reminder layout was inspected on both platforms; Android also opened and left reminder confirmation without setting it. The 16 offer/plans component tests passed, including guest price browsing, sign-in handoff with trip context, cancellation without side effects and waiting for a guest flight to sync before explicit reminder consent. TypeScript and targeted lint passed. Native guest authentication and real billing were not exercised by these follow-up checks.

The development Convex functions are deployed. Production backend/hosting, store products, review submissions and installed release binaries are not changed by this implementation. Before shipping, use the normal release workflow: production backend and hosting must include these gates and root-mounted queries before the new binaries run. Verify real-store purchase, cancelled/pending purchase, restore, refund and paid-through expiry on release candidates; the development offerings are not evidence of a real store transaction. Communicate the changed live-monitoring/publishing boundary in the release notes and keep store/remote checkout descriptions consistent. The acquisition screen uses app-owned copy; the existing subscriber change-plan offering and web checkout configuration remain managed in RevenueCat.

## 23 September — first-flight signup and spacing follow-up

Verified on the iOS 27 simulator starting signed out with zero visible flights, then adding HEL–LHR on 29 September through the real manual-add form. The empty journal had no Pro card; the first future flight exposed the large introduction. Inspected the empty journal, add-flight screen, date picker, flight summary, introduction, offer, plans, native account form, email verification and post-signup screens.

The unwanted gap above the home summary came from SectionList preserving its scroll anchor while the large Pro introduction shrank. The list now preserves flight-row position only after scrolling past the dynamic header, scoped to the current viewer. The introduction collapses to the compact card without leaving blank space above the summary.

Native signup returned to Pro plans but originally reset Yearly to Monthly. The selected package now survives the account handoff, with an available-plan fallback if the offering changes. Actual new-account signup returned with Yearly selected, required a separate purchase action, and retained the new flight. Its session survived a cold restart. No store transaction was initiated.

Reusable native flows: `.maestro/pro-guest-upgrade.yaml` covers an empty guest journal, adding a future flight, browsing/continuing free, signup or sign-in, selected-plan return and session persistence. `.maestro/pro-offer.yaml` checks repeated sheet opens without the old scroll workaround. The summary's accessibility label is `Open your travel stats`; the initial demo assertions used its visible caption and were corrected after screenshot inspection.

Release preflight for 1.1.3 passed TypeScript, all 100 Jest suites / 1,190 tests, the five backend-contract regressions and the live production inventory. The isolated security suite passed all 32 checks. Both production and development now carry all 71 referenced public functions. Physical-device checks are skipped for this release at the user's explicit request; candidate and native simulator/emulator results are recorded in `docs/release-state.md`.

Existing-account sign-in was then verified from another empty guest journal after adding HEL–CPH on 28 September. It returned to Pro plans with Yearly selected and retained both that flight and the account's earlier HEL–LHR trip. All captured home/offer/plan/account screens were inspected; no unwanted gap remained above the summary. Maestro needed a screenshot-verified tap for Clerk's Continue button on the second run because the SwiftUI accessibility bounds shifted with the keyboard; the native sign-in and return completed successfully. No authentication implementation change was needed.

A second uninterrupted native run captured all 16 steps from an empty guest journal through adding HEL–CDG, browsing plans, new-account signup, returning to Yearly, continuing free and opening the separate reminder confirmation. All assertions passed and all screenshots were inspected. Gallery: `~/Downloads/FlyRight-pro-flow-2026-09-23/index.html` (full-resolution PNGs and a ZIP alongside it). Neither a purchase nor reminder was submitted. Repeated offer/plans opens and the future trip-detail card also passed without the old scroll workaround.
