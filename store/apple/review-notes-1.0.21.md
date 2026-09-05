# App Review notes — 1.0.21 (build 32)

What went into App Store Connect → App Review Information → Notes for
build 32, submitted 2026-09-05: `review-notes-1.0.21.txt` beside this
file, sent through the ASC API. The draft below was written first and
kept for its longer explanations; the sent version differs in one
important way — the reviewer's demo account is appreview@getflyright.com
with the password already stored in ASC ("Use another method → Sign in
with your password"), not the email-code account, which is only mentioned
as the second party in the invitation test.

---

```
WHAT CHANGED IN THIS BUILD

1. People — following a traveller's trips. Someone can invite friends or family to follow their flights: they get a heads-up the day before each flight and push updates on travel day (at the airport, through security, on board, landed). Two ways to invite, both ending in the same place:
   - By link: People tab > Invite someone > Share an invite link. The link opens a web page (getflyright.com/i/<token>) with the invitation and store buttons.
   - Inside the app (new): People tab > Invite someone > search a person's exact first name or the email address they signed in with. The invitation arrives as a push and as a row in that person's People tab, where they tap Follow or Ignore.
   Search matches whole names and whole addresses only, never prefixes, and returns a name and photo — never anyone's email address. Nobody appears in anyone's app without accepting an invitation, and either side can remove the other at any time (long-press a row).

2. Adding flights from a ticket. My travels > + > "Upload a ticket PDF or screenshot", or share a PDF to FlyRight from Files/Mail. This build reads the boarding-pass barcode (PDF417/QR/Aztec) in the document and refuses documents that carry no barcode, so a hotel booking or a random PDF is declined with an explanation rather than guessed at.

3. Live flight lookups now require a free account (a daily quota per account); everything else — the travel journal, the EU261 verdicts, the claim letters — still works signed out.

HOW TO TEST

- Demo verdict and claim letter, no account needed: Claims tab > "See a demo verdict" > "Generate my claim". Built-in example (LH873 HEL-FRA, 195-minute delay).
- Demo account (for People, sync and live lookups): Settings > the account row > Continue with email > reviewer+clerk_test@getflyright.com > verification code 424242. This is a test address: no email is sent and the code is always 424242. Sign in with Apple and Google also work with any account.
- People, both ends, with one device: sign in as the demo account, People tab > Invite someone > type "App" (the first name of the second test account, appreview@getflyright.com) > Invite. Signing out and back in as appreview@getflyright.com (same email code flow, code 424242) shows the invitation under "Invitations" with Follow / Ignore.
- Ticket import: any airline e-ticket PDF or boarding-pass screenshot with a barcode. A PDF without one is refused by design.
- Push notifications: Settings > Push notifications toggle > the iOS prompt appears. Used for flight status, claim deadlines, and the trip updates above.
- Account deletion: Settings > the account row > Delete account, and on the web at getflyright.com/delete-account.

PERMISSIONS AND TRACKING

- Camera: scanning a boarding pass (My travels > + > Scan).
- Photo library: choosing a saved ticket or pass to import, and attaching photos to a trip.
- Push notifications: flight status, claim deadlines, trip updates.
- App Tracking Transparency: the prompt appears once after onboarding. It gates install attribution only (which ad or link brought a traveller in). Flights, claims and personal data are never shared or sold, and the app works identically whichever answer is given.
- Location is never requested at runtime; the purpose string exists only because the bundled notification SDK references location APIs.

WHAT THE APP IS

FlyRight is a travel companion for air passengers. It keeps a traveller's flight journal, follows their trips on travel day, and when a flight is delayed 3+ hours, cancelled, or boarding is denied, applies EU Regulation 261/2004 (and the UK equivalent) to say whether the airline owes compensation and how much, then generates a claim letter the traveller sends themselves. It is not a claims agency, takes no commission, and handles no payouts.

EXTERNAL SERVICES

AeroDataBox (flight data, via our server-side proxy), Clerk (optional accounts), Convex (sync and the trip-following backend), RevenueCat (subscriptions over Apple In-App Purchase), OneSignal (push), Layers (install attribution, ATT-gated), Expo EAS Hosting (our API and web pages). No AI services.
```
