/** What each store release changed, newest first, in the traveller's words.
 *
 * Read by /api/app-version, which hands a phone every entry newer than the
 * version it runs and no newer than the version the store is actually
 * serving, so Settings can show what an update brings. Add an entry with
 * every version bump (see AGENTS.md, release flow) and redeploy hosting —
 * the notes live on the server so an old app still learns about new ones. */
export interface ReleaseNote {
  /** Marketing version, `app.json` `expo.version`. */
  version: string;
  /** `YYYY-MM-DD` the builds were submitted. */
  date: string;
  notes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.0.32',
    date: '2026-09-12',
    notes: [
      'The app now tells us, anonymously, that it launched and on which version — so we see when an update has actually reached travellers.',
      'No new screens this time: 1.0.32 is 1.0.31 with that one signal added, so a fix can be judged by the phones it reached.',
      'Nothing about you or your trips is in that signal — a random install id, the app version, and the platform.',
    ],
  },
  {
    version: '1.0.31',
    date: '2026-09-11',
    notes: [
      'Share a photo or a line from inside a trip — the people following you see it on your pass, on your page and on the live trip link.',
      'Free accounts now seat three followers, and My travels shows three people’s flights with See all for the rest.',
      'The app icon counts what is waiting for you, and the People tab marks who is new since you last looked.',
      'Airline confirmations from Lufthansa, IndiGo and Goibibo import every leg — even from a screenshot of the email — and a landing on the next day wears a ⁺¹ on its clock.',
      'A connecting flight walks its own travel day: no second check-in, passport control and bags after landing, and the US re-check at the first airport.',
      'Anyone can be blocked or reported from their page, and a followed trip lets go two hours after landing on every screen.',
    ],
  },
  {
    version: '1.0.30',
    date: '2026-09-10',
    notes: [
      'Choose who sees a trip before you save it — your circle, your close circle, or only you — and set the default once in Settings.',
      'Connecting flights read as one journey in My travels, with the layover marked between the legs.',
      'The Live Activity on your Lock Screen now lasts the whole travel day and counts down on its own, even for long-haul flights.',
      'Typing an airport code keeps it offered until you pick it, and the field names the airport it found.',
      'Screens tell “still loading” from “nothing here yet”, and a hiccup shows a retry instead of a blank page.',
      'Android dialogs, switches and the time picker match the app’s colours in light and dark.',
    ],
  },
  {
    version: '1.0.29',
    date: '2026-09-09',
    notes: [
      'Following someone now shows where their flight is: the plane rides the route, and the card counts down to departure, then to landing, then says when they landed.',
      'Connecting flights read as one journey — the layover between legs, and once a leg lands, the next one takes over with a countdown to its departure.',
      'Followers see the clocks the airline now says, the timetable struck through where it moved, and the landing time in their own time zone.',
      'A gold crown marks FlyRight Pro members on their photo.',
      'Flight times you typed in are shown exactly as printed wherever you are — they no longer shift when your phone changes time zone mid-trip.',
      'Importing a receipt no longer drops a leg when the airline data is busy; every leg gets live tracking.',
    ],
  },
  {
    version: '1.0.28',
    date: '2026-09-08',
    notes: [
      'People is two tabs, Following and Followers, with Follow back on anyone who follows you — they get a request, one tap says yes.',
      'A person’s page opens on who they are: their trip totals beside their photo, and Following / In your circle menus for everything about the relationship.',
      'Imported tickets land in the right year — a receipt read months later no longer files a flown trip as upcoming — and every date carries a year you can spin to any year.',
      'Edit any imported leg before saving, pick the airline on a journal entry, and the keyboard no longer hides the save button.',
      'Find people by first name alone when adding someone to your circle.',
    ],
  },
  {
    version: '1.0.27',
    date: '2026-09-07',
    notes: [
      'World map filters: see a year, a month, or any date range of your travels — the stats follow.',
      'Share your world: a poster of your routes and numbers for Instagram and Facebook, in story or square, for a period or a single flight.',
      'Share a trip from its page as the same poster.',
      'Settings tells you when a newer FlyRight is on the store, with everything you are missing.',
      'Travel day: the live flight gets the home hero to itself, with a status border and a light running around it.',
      'Close circle: keep a trip with family only, and preview how your circle sees you.',
    ],
  },
  {
    version: '1.0.25',
    date: '2026-09-06',
    notes: [
      'E-ticket receipts import even without a barcode — Emirates and Etihad receipts now land in your journal, with the airline and ticket number named as they scan.',
      'Multi-leg PDF tickets are read in the order they are printed, so every leg lands on the right day.',
      'A flight the data provider never marked as landed counts as flown once it is a day overdue.',
      'The World stats card no longer wraps six-digit kilometre totals.',
    ],
  },
  {
    version: '1.0.24',
    date: '2026-09-06',
    notes: [
      'Followed people get their own page, with their travels on the same map you have.',
      'A followed trip opens on its own map, zoomed to the leg.',
      'Trip rows look the same wherever a trip is listed, and say when it is once, not twice.',
      'A push about a circle member’s flight opens the right trip.',
    ],
  },
  {
    version: '1.0.23',
    date: '2026-09-06',
    notes: [
      'Every time shows on the clock its own airport keeps.',
      'FlyRight tells you when the airline moves a flight out from under your ticket.',
      'Your circle hears when a person they follow books a trip.',
    ],
  },
  {
    version: '1.0.22',
    date: '2026-09-06',
    notes: [
      'Invites have two doors: search for someone in the app, or share your link.',
      'Searching for a person answers with the invite link instead of hiding it under the keyboard.',
    ],
  },
  {
    version: '1.0.21',
    date: '2026-09-05',
    notes: [
      'Invite people to follow your trips without sending a link — search FlyRight by first name or email, and your invitation lands in their People tab.',
      'Upload a ticket PDF from Files, not just point the camera at one.',
      'Uploaded tickets are read from the boarding-pass barcode, so legs land on the right day and route.',
      'Signing in to follow a trip now follows it.',
    ],
  },
  {
    version: '1.0.20',
    date: '2026-09-04',
    notes: [
      'Every trip has a journal: notes, a rating, seat and booking reference, and photos.',
      'Share a ticket PDF to FlyRight and its flights land in your journal.',
      'Contact support from Settings — replies arrive in the app and by email.',
      'Claims go where the airline actually takes them, with the claim form for 41 airlines.',
      'A redesigned travel-day stepper and live surfaces that say your next step.',
      'Follow someone’s whole circle after following one of their trips.',
      'Travel stats count your time in the air.',
      'Live flight lookups now need an account and have a daily allowance.',
    ],
  },
  {
    version: '1.0.19',
    date: '2026-09-02',
    notes: [
      'Add flight picks the date on an in-app calendar.',
      'Airport search ranks the big hubs first and shows more suggestions.',
      'Appearance uses a native menu on Android too.',
    ],
  },
  {
    version: '1.0.18',
    date: '2026-09-01',
    notes: [
      'Scan your boarding pass — point the camera at any pass and the flight is added instantly.',
      'World tab: every journey you have flown, drawn as routes on a real map.',
      'Earlier delay warnings from your aircraft’s inbound rotation.',
      'Track the outcome of every claim.',
      'Apple Watch Smart Stack support on travel day.',
    ],
  },
];
