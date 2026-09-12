# FlyRight — Shipaton 2026 demo video (≤ 2:00)

Judges and pre-screeners watch only the first two minutes and never install
the app, so the cut leads with the pitch, shows the travel-day loop before
the money, and ends on the RevenueCat story. Narration is voiced from
`demo/scenes.mjs` (this file is the readable copy — edit both).

Format: 1920×1080, 30 fps. Phone recording (iPhone 17 Pro simulator, Release
build) framed at the right, eyebrow / title / three bullets on the left,
night-sky ground shared with the Play feature graphic. Voice-over first,
music optional (`--music`). Every scene runs exactly as long as its narration
plus a short tail, so the flows never race the voice.

| # | Time | Visual | Narration |
|---|------|--------|-----------|
| 1 | 0:00–0:09 | Title card: icon, wordmark, tagline | Flight trackers tell you your flight is late. FlyRight stays with you through the whole travel day, and when a flight goes wrong, it tells you what the airline owes you. |
| 2 | 0:09–0:18 | **My travels** with the seeded journal; slow scroll | Your trips live in one journal: past flights, the one coming up, kilometres, countries and records. All of it, without an account. |
| 3 | 0:18–0:33 | **Add a flight**: + → type AY5 → Tomorrow → live route card → Track | Adding a flight takes seconds. Type the number, pick the day, and FlyRight finds the route and the times, and starts watching it. You can also scan a boarding pass, or share the airline’s confirmation PDF and every leg imports. |
| 4 | 0:33–0:49 | **Travel Day Live**: live hero with running light → timeline → next step → Lock Screen Live Activity | On the day you fly, the home screen becomes a boarding pass. It counts down to departure, shows the gate the moment the airport posts it, and walks you through check-in, security and boarding. A Live Activity keeps it on your Lock Screen and in the Dynamic Island. |
| 5 | 0:49–0:59 | **People** panel (still): Eve live HNL→LAX, Following/Followers | The people who care can follow your travel day live: the plane on the route, delays as they happen, and the moment you land. No more “did you land?” texts. |
| 6 | 0:59–1:16 | **Verdict → claim**: HEL→MAD landed 3h15 late → “You’re owed 400 EUR” (+ Generate my claim → name/email → letter once the demo user is Pro, see README) | And when a flight does go wrong, FlyRight already knows. This one landed three hours late. Under EU261, that’s four hundred euros, and one tap drafts the claim letter, ready to send. No legalese, no web forms from 2011. |
| 7 | 1:16–1:23 | **World** map with every route → share poster (Story/Square) → Travel stats | Every route you have flown draws itself on a world map. Your stats and records get a page of their own, and any of it becomes a poster you can share. |
| 8 | 1:23–1:40 | **FlyRight Pro** RevenueCat paywall with intro pricing | FlyRight is free as a travel buddy. FlyRight Pro adds the claims, early delay warnings and a bigger circle, sold through RevenueCat in the apps, and through RevenueCat Web Billing on getflyright.com, where a free compensation check turns a search into a subscriber. |
| 9 | 1:40–1:49 | Outro card: name, tagline, App Store · Google Play · getflyright.com | FlyRight. Trackers tell you it’s late. We tell you what you’re owed. Live now on the App Store and Google Play. |

Running time ≈ 1:59 with the default neural voice (Microsoft "Andrew" via
edge-tts); a human or ElevenLabs read of the same text lands within a few
seconds of that.

## Why this order

- **Hook in the first ten seconds** — the tracker-vs-advocate line is the
  whole positioning (README pitch), stated before any UI.
- **Buddy before claims** — the product vision is travel-buddy-first; the
  money moment lands harder once the judge has seen the app on a travel day.
- **People is a still** — a live follow needs two signed-in accounts on two
  devices; the 2026-09-10 capture already shows the live card, the
  invitation and both tabs, and it matches the Devpost gallery.
- **Pro last, and named RevenueCat twice** — the paywall and Web Billing are
  what the Shipaton judges are scoring (HAMM, Funnel Vision, Grand Prize).

## Re-voicing

`node scripts/demo-video.mjs voice` renders with `DEMO_TTS`:

- `edge` (default) — Microsoft neural voices through `edge-tts`
  (`pip install edge-tts`, free, needs network). `DEMO_VOICE` picks the voice
  (`edge-tts --list-voices`; good narrators: en-US-AndrewMultilingualNeural,
  en-US-AvaMultilingualNeural, en-GB-RyanNeural), `DEMO_VOICE_RATE` is a
  percentage (`+5%`).
- `elevenlabs` — set `ELEVENLABS_API_KEY`; `DEMO_VOICE` is the voice id
  (default George), `ELEVENLABS_MODEL` the model (eleven_multilingual_v2).
  The `[[slnc]]` pauses become `<break>` tags.
- `say` — macOS built-in, offline, robotic; `DEMO_VOICE`/`DEMO_VOICE_RATE` as
  for `say`.

A human read works too: drop the files in `demo/out/voice/<scene-id>.mp3`
(or .wav/.aiff) and re-run `assemble`. Timing follows the audio.
