# App Review reply — Guideline 2.1 Information Needed (v1.0.5)

ASC reply fields are capped at 4,000 characters — use the CONDENSED
version at the bottom of this file (3,693 chars) for the actual reply and
the Notes field. The long version below is the reference copy. Items
marked [EDIT] need your real-world details before sending.

---

Thank you for the review. Responses to each point:

**1. Screen recording**

A screen recording captured on a physical iPhone is attached. It shows: app launch → adding a flight → receiving an EU261 compensation verdict → the subscription paywall and purchase flow → generating a claim letter → the push-notification permission prompt → signing in → deleting the account in-app.

Notes on the flows listed in your request:
- Account registration/login: FlyRight is fully usable without an account. Signing in (Sign in with Apple, Google, or email one-time passcode) is optional and only keeps purchases and trips in sync across devices. Account deletion is available in-app under Settings → Account → Delete account, and also on the web at https://flyright.expo.app/delete-account.
- Paid content: the "Owed Pro" upgrade is offered via auto-renewable subscriptions (flyright_pro_monthly — 1 month; flyright_pro_yearly — 1 year) and a one-time lifetime unlock (flyright_pro_lifetime). The paywall displays the title, duration, and price of each option together with links to the Terms of Use (EULA) and Privacy Policy, and purchases are processed exclusively through Apple In-App Purchase.
- User-generated content: the app has no social or shared user-generated content. Trips a user adds are private to that user, so no reporting/blocking mechanisms apply.
- Sensitive-data prompts: the only permission the app requests is push notifications, prompted when the user enables the "Push notifications" toggle in Settings (used for flight-status and claim-deadline alerts). The app does not request location, contacts, camera, or tracking (no ATT prompt; we do not track users across apps). The binary declares a camera purpose string for a planned boarding-pass scanning feature that is not active in this build, and a location purpose string only because a bundled notification SDK (OneSignal) references location APIs — neither permission is ever requested at runtime.

**2. Devices and operating systems tested**

[EDIT — replace with the actual hardware you tested on, e.g.:]
- iPhone 15 Pro, iOS 18.6 (physical device, via TestFlight)
- iPhone 12, iOS 18.6 (physical device)
- iPhone 16 / iPhone SE (3rd gen) simulators
- iPad Pro 12.9" simulator (iPadOS 18)

**3. App functions and target audience**

FlyRight is a travel companion for air passengers, focused on EU/UK air passenger rights. Travelers add their flights; FlyRight tracks flight status and, when a flight is delayed 3+ hours, cancelled, or the passenger is denied boarding, it applies Regulation (EC) 261/2004 (and the equivalent UK261 rules) to tell the user whether they are owed compensation and exactly how much (up to €600 per passenger). It then generates a ready-to-send claim letter the user emails to the airline themselves, and reminds them before claim deadlines expire.

Problem solved: most passengers never claim compensation they are legally owed because they don't know their rights or find the process opaque. Target audience: adult leisure and business travelers, particularly those flying to, from, or within the EU and UK.

**4. Setup and access instructions**

No login, credentials, or sample files are required — the app is fully functional anonymously.

- Launch the app. To see the full verdict → claim flow instantly, tap "See a demo verdict" on the Claims tab: it opens a built-in example (Lufthansa LH873, HEL→FRA, 195-minute delay) showing the compensation verdict and the complete claim-letter wizard.
- To test with a real trip: Journeys tab → Add flight → enter an airline, flight number, and date. Live status comes from our flight-data service.
- Subscription flow: Settings → FlyRight Pro (or any Pro-gated action) opens the paywall.
- Optional sign-in: Settings → Account → Sign in. No feature requires an account, but a demo account is provided for your convenience: choose "Continue with email", enter reviewer+clerk_test@getflyright.com, then enter 424242 as the verification code (this is a test address — no email is sent; the code is always 424242). Sign in with Apple also works with any Apple ID.
- Account deletion: Settings → Account → Delete account.

**5. External services, tools, and platforms**

- AeroDataBox — flight schedule and status data (accessed via our own server-side proxy; no key ships in the app)
- Clerk — optional authentication (Sign in with Apple, Google, email OTP)
- Convex — backend database for optional cross-device sync of trips
- RevenueCat — in-app purchase/subscription management on top of Apple In-App Purchase
- OneSignal — push notifications (flight-status and claim-deadline alerts)
- Expo EAS Hosting — hosts our API routes and the privacy/support pages
- No AI services are used.

**6. Regional differences**

The app functions identically in all regions: same features, same content, same pricing structure. Compensation verdicts are determined by the flight's route and operating carrier (EU261 applies to flights departing the EU or on EU carriers arriving in the EU; UK261 to the UK equivalents), not by the user's region or locale. Flights outside these rules simply receive a "not eligible" verdict.

**7. Regulated industry / protected material**

FlyRight is an informational self-help tool. It does not provide legal representation, does not act as a claims agent or intermediary, and does not handle compensation payouts — users send the generated claim letter to the airline themselves and are paid directly by the airline. EU261 and UK261 are public regulations; presenting their criteria requires no license or authorization. The app contains no protected third-party material.

---

## Screen recording script (record on a physical iPhone, latest iOS)

Use the TestFlight build — purchases automatically run in Apple's sandbox and
are never charged. Fresh install (delete the app first) so all first-run
states and the notification prompt appear. Full step-by-step script in the
"recording script" section the assistant provided; condensed order:

1. Cold launch from the home screen (icon tap on camera).
2. Claims tab → "See a demo verdict →" → verdict screen (LH873 demo).
3. "Generate my claim →" → paywall appears (not yet Pro): scroll to show
   plan titles, durations, prices, Terms of Use + Privacy Policy links →
   purchase monthly in sandbox → App Store sheet → confirm → Pro unlocked.
4. "Generate my claim →" again → claim wizard → "Edit my details →" →
   "Preview my claim →" → show the letter → "Share my claim letter →".
5. Add flights (all verified against live data): LH873 today (live
   tracking), then past trips AY99 2026-07-20 and LH400 2026-08-05.
6. Open My travels stats → scroll records/places/airlines.
7. Settings → toggle "Push notifications" ON → **iOS notification
   permission prompt** → Allow.
8. Settings → "Sign in or create account" → Continue with email →
   reviewer+clerk_test@getflyright.com → code 424242 → show signed-in
   account state (same credentials given to the reviewer).
9. Settings → "Restore purchases" (brief).
10. Settings → Account → Delete account → confirm → show completion.

---

## CONDENSED reply — paste this one (3,693 chars, limit 4,000)

```
Thank you for the review. Responses to each point:

1. SCREEN RECORDING
Attached, captured on a physical iPhone: launch > adding flights > EU261 compensation verdict > subscription paywall and sandbox purchase > claim letter generation > push-notification permission prompt > sign-in > in-app account deletion.
- Accounts: the app is fully usable without an account. Sign-in (Apple, Google, or email one-time code) is optional and only syncs purchases/trips across devices. Account deletion is in-app (Settings > Account > Delete account) and at flyright.expo.app/delete-account.
- Paid content: "FlyRight Pro" is offered as auto-renewable subscriptions (flyright_pro_monthly, 1 month; flyright_pro_yearly, 1 year) and a one-time lifetime unlock (flyright_pro_lifetime), all via Apple In-App Purchase. The paywall shows each plan's title, duration, and price plus Terms of Use (EULA) and Privacy Policy links.
- No user-generated content is shared between users (trips are private), so no reporting/blocking applies.
- Permission prompts: only push notifications (Settings toggle; flight-status and claim-deadline alerts). No location, contacts, camera, or ATT prompts; we do not track users. The binary declares a camera purpose string for a planned boarding-pass scan feature not active in this build, and a location string only because a bundled notification SDK (OneSignal) references location APIs; neither is ever requested at runtime.

2. TESTED ON
[EDIT: e.g. iPhone 15 Pro, iOS 18.6 (physical, TestFlight); iPhone 12, iOS 18.6; iPhone 16 and iPad Pro 12.9 simulators]

3. FUNCTIONS AND AUDIENCE
FlyRight tracks a traveler's flights and, when a flight is delayed 3+ hours, cancelled, or boarding is denied, applies EU Regulation 261/2004 (and the UK equivalent) to tell the user if the airline owes them compensation and how much (up to EUR 600 per passenger). It then generates a ready-to-send claim letter and reminds the user before claim deadlines expire. Problem solved: most passengers never claim compensation they are legally owed. Audience: adult travelers flying to, from, or within the EU/UK.

4. SETUP AND ACCESS
No login or sample files required. Tap "See a demo verdict" on the Claims tab to see the full verdict-to-claim-letter flow with a built-in example (LH873, 195-min delay). Add real flights via My travels > Add Flight (airline, flight number, date). Paywall: Settings > Get FlyRight Pro, or any Pro-gated action. Optional sign-in demo account: Settings > Sign in > Continue with email > reviewer+clerk_test@getflyright.com, verification code 424242 (test address; no email is sent, the code is fixed). Sign in with Apple also works with any Apple ID. Deletion: Settings > Account > Delete account.

5. EXTERNAL SERVICES
AeroDataBox (flight schedule/status data via our own server-side proxy; no key in the app), Clerk (optional authentication), Convex (optional cross-device trip sync), RevenueCat (subscription management over Apple In-App Purchase), OneSignal (push notifications), Expo EAS Hosting (our API and privacy/support pages). No AI services.

6. REGIONAL DIFFERENCES
None. Features, content, and pricing structure are identical in all regions. Verdicts depend on the flight's route and carrier (EU261/UK261 scope), not the user's region; out-of-scope flights get a "not eligible" verdict.

7. REGULATED INDUSTRY / PROTECTED MATERIAL
FlyRight is an informational self-help tool. It is not a claims agency and provides no legal representation; users send the generated letter to the airline themselves and are paid directly by the airline. EU261/UK261 are public regulations; no license is required. The app contains no protected third-party material.
```
