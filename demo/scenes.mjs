/**
 * The Shipaton demo video, scene by scene. Each scene is one narration
 * paragraph, one visual (a simulator recording driven by a Maestro flow, a
 * still, or a rendered card) and the caption block shown beside the phone.
 *
 * `scripts/demo-video.mjs` reads this: `voice` renders the narration to
 * audio, `record` runs each flow while the simulator records, `assemble`
 * composes everything into demo/out/flyright-demo.mp4. The scene's length
 * is its narration plus `tail` seconds, so the flows only have to finish
 * their taps inside that time — pacing lives in the narration, not the YAML.
 *
 * `trimAt` = which "… is visible" step of the flow opens the scene (default
 * the first); `endAfter` = the Maestro step the footage ends on, plus a hold;
 * `maxSpeed` overrides the global footage speed-up cap for one scene; `[[slnc N]]` is a macOS `say` pause in milliseconds.
 */

/** Narration engine: 'edge' (Microsoft neural voices via edge-tts, free, no
 * key — the default), 'elevenlabs' (needs ELEVENLABS_API_KEY), or 'say'
 * (macOS built-in, robotic but offline). DEMO_VOICE names the voice for the
 * chosen engine; DEMO_VOICE_RATE is a percentage for edge, words/min for say. */
export const TTS = process.env.DEMO_TTS ?? 'edge';
export const VOICE =
  process.env.DEMO_VOICE ??
  { edge: 'en-US-AndrewMultilingualNeural', elevenlabs: 'JBFqnCBsd6RMkjVDRZzb', say: 'Samantha' }[TTS];
export const VOICE_RATE = process.env.DEMO_VOICE_RATE ?? (TTS === 'say' ? '168' : '+5%');

/** Seed state the recording flows expect, in order. `travelDay` reseeds with
 * the upcoming flight an hour out and stamped through security. */
export const SCENES = [
  {
    id: '01-title',
    kind: 'card',
    card: 'title',
    tail: 0.3,
    narration:
      'Flight trackers tell you your flight is late. [[slnc 250]] FlyRight stays with you through the whole travel day, [[slnc 150]] and when a flight goes wrong, it tells you what the airline owes you.',
  },
  {
    id: '02-home',
    kind: 'recording',
    flow: '.maestro/demo/home.yaml',
    tail: 0.8,
    eyebrow: 'My travels',
    title: 'Every flight, remembered',
    bullets: ['Past trips, the one coming up', 'Kilometres, countries, records', 'Works without an account'],
    narration:
      'Your trips live in one journal: [[slnc 120]] past flights, the one coming up, kilometres, countries and records. [[slnc 150]] All of it, without an account.',
  },
  {
    id: '03-add-flight',
    kind: 'recording',
    flow: '.maestro/demo/add-flight.yaml',
    tail: 0.8,
    eyebrow: 'Add a flight',
    title: 'Seconds, not forms',
    bullets: ['Flight number + day', 'Scan a boarding pass', 'Share the airline PDF — every leg imports'],
    narration:
      'Adding a flight takes seconds. [[slnc 120]] Type the number, pick the day, and FlyRight finds the route and the times, and starts watching it. [[slnc 150]] You can also scan a boarding pass, [[slnc 80]] or share the airline’s confirmation PDF and every leg imports.',
  },
  {
    id: '04-travel-day',
    kind: 'recording',
    flow: '.maestro/demo/travel-day.yaml',
    seed: 'travelDay',
    // Close on the Lock Screen (the flow unlocks afterwards for the next scene).
    endAfter: { step: 'Press Lock key', hold: 2.4 },
    maxSpeed: 1.8, // four screens in one breath; Maestro's step latency, not the UI, is what gets compressed
    tail: 0.8,
    eyebrow: 'Travel Day Live',
    title: 'Your day, on a boarding pass',
    bullets: ['Countdown, gate and terminal', 'Check-in → security → boarding', 'Dynamic Island + Lock Screen Live Activity'],
    narration:
      'On the day you fly, the home screen becomes a boarding pass. [[slnc 120]] It counts down to departure, shows the gate the moment the airport posts it, [[slnc 100]] and walks you through check-in, security and boarding. [[slnc 150]] A Live Activity keeps it in the Dynamic Island and on your Lock Screen.',
  },
  {
    id: '05-people',
    kind: 'still',
    still: 'store-assets/shipaton/shipaton-03-people.png',
    tail: 0.6,
    eyebrow: 'People',
    title: 'Follow a travel day, live',
    bullets: ['The plane on the route, delays as they happen', 'Followers see the landing the moment it happens', 'Share a photo from inside the trip'],
    narration:
      'The people who care can follow your travel day live: [[slnc 100]] the plane on the route, delays as they happen, and the moment you land. [[slnc 150]] Nobody has to ask whether you got there.',
  },
  {
    id: '06-verdict-claim',
    kind: 'recording',
    flow: '.maestro/demo/verdict-claim.yaml',
    trimAt: 2, // open on the trip, not the cold-started list
    tail: 1.0,
    eyebrow: 'When it goes wrong',
    title: 'You’re owed 400 EUR',
    bullets: ['Delay detected automatically', 'EU261 and friends, in plain words', 'One tap drafts the claim letter'],
    narration:
      'And when a flight does go wrong, FlyRight already knows. [[slnc 120]] This one landed three hours late. [[slnc 100]] Under EU261, that’s four hundred euros, [[slnc 100]] and one tap drafts the claim letter, ready to send. [[slnc 120]] No legalese, and no middleman taking a cut.',
  },
  {
    id: '07-world',
    kind: 'recording',
    flow: '.maestro/demo/world.yaml',
    trimAt: 2,
    tail: 0.8,
    eyebrow: 'World & stats',
    title: 'Everywhere you’ve been',
    bullets: ['Every route on a map', 'Stats and records', 'A poster to share'],
    narration:
      'Every route you have flown draws itself on a world map. [[slnc 120]] Your stats and records get a page of their own, [[slnc 100]] and any of it becomes a poster you can share.',
  },
  {
    id: '08-pro',
    kind: 'recording',
    flow: '.maestro/demo/pro.yaml',
    trimAt: 2,
    tail: 0.8,
    eyebrow: 'FlyRight Pro',
    title: 'Free buddy, paid advocate',
    bullets: ['RevenueCat paywall in the apps', 'RevenueCat Web Billing on getflyright.com', 'Free EU261 checker → subscriber'],
    narration:
      'FlyRight is free as a travel buddy. [[slnc 120]] FlyRight Pro adds the claims, early delay warnings and a bigger circle, [[slnc 100]] sold through RevenueCat in the apps, [[slnc 80]] and through RevenueCat Web Billing on getflyright.com, [[slnc 80]] where a free compensation check turns a search into a subscriber.',
  },
  {
    id: '09-outro',
    kind: 'card',
    card: 'outro',
    tail: 1.0,
    narration:
      'FlyRight. [[slnc 200]] Trackers tell you it’s late. [[slnc 150]] We tell you what you’re owed. [[slnc 250]] Live now on the App Store and Google Play.',
  },
];
