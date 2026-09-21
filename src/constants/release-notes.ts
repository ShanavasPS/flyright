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
    version: '1.1.1',
    date: '2026-09-21',
    notes: [
      'The app opens on Flights again: your own flight comes first, with its live card at the top on the day you fly, and FlyRight welcomes you by name.',
      'Home is now Updates — the friends who are in the air and the postcards they send. A request to follow you shows at the top until you answer it.',
      'Postcards show the flight and where they were in full, with the heart and a reply button under each one. Words-only postcards can be answered too.',
      'The postcards you sent stay under “You” on Updates for as long as your friends can still see them, hearts and all.',
      'Friends shows each live flight on its own, and the tab titles are a little smaller.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-21',
    notes: [
      'The app opens on Home: your travel day, the people you follow who are in the air, and what they have posted — instead of a list of flights you have already taken.',
      'Flights is the journal, and today’s flight stays in it. While you are in the air the row runs a live light, shows where the plane is, and counts down to the landing.',
      'Friends is the circle: whoever is flying gets their full live card again, with their gate, their delays and where they are.',
      'Home greets you by name: your picture opens Settings, and the ＋ for a new flight sits across from it.',
      'A follower can see your travel days without you seeing theirs — Home now says so, and follows them back in a tap.',
      'People who signed in without a name can be found and followed again.',
    ],
  },
  {
    version: '1.0.39',
    date: '2026-09-19',
    notes: [
      'A trip’s page now has one card with everything in its place: a countdown to the second, then terminal, check-in, gate and boarding, your seat and booking, and the baggage belt — kept on the trip after you land.',
      'Tap any box to add what you know. A gate you type reaches your Lock Screen too, and when the airport posts its own, the airport’s wins.',
      'The Lock Screen and the live card show the seconds ticking, and lead with what matters right now: the check-in desk, the gate, your seat, then the belt.',
      'My travels is now Flights, with a cleaner top. The trips you follow sit there as a row of faces — tap one for the flight and the latest photos — and you can see who liked your updates.',
      'Photos from a trip stay with it when the connecting flight takes over, and a flight no longer shows as in the air before it has left.',
    ],
  },
  {
    version: '1.0.38',
    date: '2026-09-18',
    notes: [
      'The globe shows day and night as they are right now — a sun button on the World tab switches it — and a trip’s own map puts the sun where it will be at take-off or landing.',
      'During a flight your plane moves along its route: from its last reported position when there is one, by the timetable when there isn’t. A radar beacon marks the trip of the day, and the World tab centres on it.',
      'Flown routes no longer carry a plane, so the ones still to fly stand out; the trip page shows how far along a flight is, with “In the air” while it is.',
      'Share your world as a poster: story or square, dark or light, with a glow where you fly most and your hours in the air.',
      'A person’s page shows their travel on the same globe, and a trip under way is no longer followed by an empty “Upcoming”.',
      'Overnight flights are looked up on the right day, and a flight the airline moves takes its live card along with it.',
    ],
  },
  {
    version: '1.0.37',
    date: '2026-09-18',
    notes: [
      'Travel stats is redrawn: your longest flight on the globe, your top destination in its country’s colours, your most-flown airline in its own — and each card opens the full list behind it.',
      'New in stats: the aircraft you have flown, by type and maker, with every flight on each one.',
      'Adding a flight is now step by step — go back to any step — with a clearer choice between finding a flight by number and writing a trip in yourself.',
      'Choosing an airline opens a proper search that browses every airline and forgives typos.',
      'Ten Caribbean airlines added, from Caribbean Airlines and Bahamasair to Arajet and Sunrise Airways.',
    ],
  },
  {
    version: '1.0.36',
    date: '2026-09-16',
    notes: [
      'The World tab is a globe now: drag to turn it, pinch to zoom in to country level, double tap to jump closer.',
      'Zoom all the way out to see the whole earth with every trip on it, or in until coastlines and borders sharpen.',
      'Your routes, planes and airports sit on the globe, and the trip page shows each flight on the same earth.',
      'Import cards now say what happened to each flight rather than what to do next.',
    ],
  },
  {
    version: '1.0.35',
    date: '2026-09-14',
    notes: [
      'Try live flight tracking before creating an account, with five guest lookups each day.',
      'When your guest lookups run out, sign in and continue with the flight you already entered.',
      'Import tickets as a guest too. Flights beyond the daily allowance stay in your journal so no leg is lost.',
      'Use Siri and Shortcuts on iPhone to open your next flight, boarding pass or Add flight.',
      'Upcoming trip headers are cleaner and easier to scan.',
    ],
  },
  {
    version: '1.0.34',
    date: '2026-09-14',
    notes: [
      'Your boarding pass now lives on the trip: scan it or import the ticket once, and the barcode is on the trip page — full screen at the gate, brightness up, no signal needed.',
      'The pass follows you to your other devices, and the seat, sequence and booking reference it carries fill themselves in.',
      'Share a screenshot or a photo of a ticket straight to FlyRight — pictures now work everywhere PDFs did — and a pass shared from Apple Wallet lands on the trip you already have instead of making a second one.',
      'Tickets read from a screenshot keep their route when the airline’s layout is damaged, and an import waits for every leg before it saves.',
      'A trip you follow can now run on your Lock Screen, if the traveller turns it on for you.',
      'The World map opens on the whole world again, and trip photos no longer fail to upload after an app update.',
    ],
  },
  {
    version: '1.0.33',
    date: '2026-09-13',
    notes: [
      'The app icon now shows a dot when something waits for you — a People request, a support reply or a newer version — and clears when you have looked.',
      'A push tells you when a new FlyRight is in the store, so you no longer find out by opening Settings.',
      'Invite links no longer add whoever holds them: opening one asks the sender first, and the sender sees “Opened your invite link” on the request.',
      'Typing a booking reference or an e-ticket number into the flight box now says what it is and points you to scan or upload the ticket instead.',
      'Links shared from FlyRight open straight in the installed app instead of the browser.',
      'Account hardening: your searchable email is the one on your account, a photo can only be removed by the person who added it, and the app’s calls are rate-limited against bots.',
    ],
  },
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
