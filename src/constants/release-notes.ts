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
