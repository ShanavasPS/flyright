# getflyright.com — the website

The web build (`npx expo export -p web`, EAS Hosting) serves the app's router tree, but
only a few routes are the *website*: the front page, the flight checker and the Pro
checkout, wrapped in `SiteChrome`. Everything else (`/world`, `/people`, …) is the app
rendered on the web and is not linked from the site.

## Pages

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `src/screens/landing.web.tsx` via `src/app/(tabs)/(journeys)/index.tsx` (web branch) | Front page: hero, six image + text feature rows (each claim beside the screen that makes it — no icon tiles), the EU261 band with a mini checker, Pro. |
| `/check` | `src/screens/check.tsx` | The flight checker. Takes `?flight=AY1331&date=YYYY-MM-DD` (runs the lookup on arrival) and `?demo=1` (the example verdict); the front page's band hands off with those. |
| `/go-pro`, `/welcome`, `/sign-in` | `src/screens/go-pro.web.tsx`, `welcome.tsx`, `sign-in.web.tsx` | Checkout funnel (RevenueCat Web Billing + Clerk). |
| `/privacy`, `/terms`, `/support` | `src/screens/legal/*` | Plain pages, no SiteChrome. |
| `/i/[token]`, `/t/[token]` | `join-circle.tsx`, `follow-trip.tsx` → `AppHandoff` | Invite / trip links; untouched by the site design. |

`(tabs)/_layout.tsx` returns a bare `<Slot />` on web at `/`: the web `NativeTabs` view has
no `hidden` prop and force-mounts every tab's content, so the front page would otherwise
carry the app's tab bar and mount World/People/Claims behind it.

## Chrome, theme, fonts, head

- `src/components/site-chrome.web.tsx`: header (brand → `/`, Check a flight / Pro / Support
  above 720 px, theme toggle `testID="theme-toggle"`, Sign in / Clerk `UserButton`, "Get the
  app" → the visitor's store by user agent), footer (badges, links, disclaimer).
  `<SiteChrome bare>` drops the 800 px body cap for a page with full-bleed sections.
- Theme: `src/services/theme.web.ts` keeps the preference in `localStorage`
  (`theme-preference`), **light by default**, `'system'` follows `prefers-color-scheme`;
  `src/hooks/use-color-scheme.web.ts` subscribes with `useSyncExternalStore` (server
  snapshot light, so hydration matches). Native `theme.ts` exposes the same
  `resolvedScheme`/`subscribeTheme` for typing.
- Fonts: Inter from Google Fonts, linked in `src/app/+html.tsx`; `ThemedText` sets
  `Fonts.sans` (`--font-display`, `src/global.css`) on web only.
- Head: `+html.tsx` carries the defaults (title, description, theme-color, Open Graph and
  Twitter card → `/og-image.png`, icons). Pages override title/description with `<Head>`
  from `expo-router/head`.

## Assets

- Screenshots: `assets/images/landing/*.png` (light) and `assets/images/landing/dark/*.png` (dark, `xcrun simctl ui <udid> appearance dark` before capturing; the page picks the set by theme), 640 px wide palette PNG, from the release
  build on the "FlyRight Shots" simulator, seeded with
  `node scripts/seed-demo-data.mjs --ios --sim <udid> --travel-day`, status bar
  `xcrun simctl status_bar <udid> override --time 9:41 …`, deep links `flyright:///`,
  `/journey/demo-upcoming`, `/world`, `/stats`, `/add-flight`, `/journey/demo-mad`, `/people`,
  `xcrun simctl io <udid> screenshot`. Downsize with sharp (`resize({ width: 640 })`,
  `png({ palette: true })`). Reshoot after visible UI changes; the store panels in
  `store-assets/raw` are a separate set.
- The People capture is the **dev** deployment with synthetic people, never production
  accounts: `devTools:seedDemoCircle` (internal; `npx convex run devTools:seedDemoCircle
  '<json>'` against dev) upserts profile rows (name + Unsplash portrait — `images.unsplash.com`
  is on the avatar allow-list in `convex/profileShared.ts` for exactly this), circle rows,
  journeys and live sessions at a stage. The 2026-09-18 set, around Eve
  (`eve+clerk_test@example.com`, OTP 424242, dev client on the iPhone 17 Pro sim): Noah Berg
  in the air (`departed`, −1.4 h), Clara Nyström landed (`landed`, belt 7, close circle,
  mutual), Sofia Marin departing in 2 days, Dee Okafor in 9 days, Leo Andersson as a
  follower ("Follow back"). Args saved in that session's scratchpad `seed-args.json`.
  Finding the viewer's Clerk id: the client only writes its `profiles` row when the Clerk
  user has a first name; `peopleSeen` (newest row) is the fallback. Dismiss the dev
  client's "Open debugger to view warnings" toast (tap ≈92 %, 93 %) before capturing.
- `public/og-image.png` (1200×630) and `public/apple-touch-icon.png`: `node
  scripts/generate-og-image.mjs`.
- Store badges: `assets/images/badge-app-store.png`, `badge-google-play.png`.

## Motion

Two moves only, in `src/components/reveal.web.tsx` (native twin is a plain View):
`Reveal` fades a block and settles it into place the first time it enters the viewport
(IntersectionObserver, `from: 'up' | 'left' | 'right'`, `delay`, staggered in the hero and
the claims band); `Float` drifts the hero phones (±7 px, ~6 s, offset periods). Both are
inert under `prefers-reduced-motion`. Hover feedback (chips, buttons, the theme toggle,
`PrimaryButton`) and the theme crossfade use CSS transitions through style objects cast to
`ViewStyle` — react-native-web renders `transitionProperty/Duration`, the RN types don't
list them, and native must never receive them (`PrimaryButton` gates on `Platform.OS`).
The header takes a shadow once the page has scrolled (`SiteChrome` `onScroll`). Pressables
with a hover *function* style must not be children of `Link asChild` — use `useRouter`.

## Video in the phones

`src/components/phone-video.web.tsx` lays a muted, looping `<video>` (raw element via
`unstable_createElement`, typed in `src/types/react-native-web.d.ts`) over the still, attached
only once the frame nears the viewport, never under reduced motion; the still stays if
autoplay is refused. Both hero phones play loops from `public/video/` (560 px wide, H.264
CRF 27), one per theme:

- `world-{light,dark}.mp4` (~20–23 s, 0.8–1.5 MB): the globe spun, zoomed and recentred, cut
  from the user's own iPhone screen recordings of the World tab (2026-09-18, 8:36 dark /
  8:37 light), slowed to 0.625× real time (the 1.25× first cut "looked too fast"), the
  recording's status bar replaced by the 9:41 strip from the matching still.
- `journeys-{light,dark}.mp4` (~10 s, 0.12 MB): My travels with the live card's running
  border, `xcrun simctl io <udid> recordVideo` on the seeded Shots simulator.

Every loop's tail is dissolved into its head (`xfade` 0.6 s against the clip's own first
0.6 s at `offset = duration − 0.6`, then `trim=start=0.6`) so it restarts without a jump.
Recipe: 2026-09-18 scratchpad `globe-video/` (`stitch.mjs` does the dissolve; do the
arithmetic in node — `bc` is not on this Mac). Pipeline per clip: `-ss/-to` cut →
`setpts=PTS/<speed>,fps=30` → `overlay` status strip → `scale=560:-2` → stitch.

Values only the browser knows (viewport width, locale, user agent) go through
`hooks/use-client-value.web.ts` (`useSyncExternalStore` with a server snapshot); reading
them directly in render made the server and client disagree and React threw hydration
error #418 on desktop.

## Layout gotchas (react-native-web)

- A child of `Link asChild` must get a flattened style object, never an array
  (`StyleSheet.flatten`), or expo-router's Slot throws and the page shows the error boundary.
- In a stacked (column) layout, `flex: 1` — and `flex: 0`, which react-native-web emits as
  `0 1 0%` — collapses a block to zero height and its neighbour lands on top. Use
  `flexGrow/flexShrink/flexBasis: 'auto'` for stacked children (`styles.stackChild`).
- `SiteChrome`'s ScrollView owns the page scroll: `body` is `overflow: hidden`, so a
  full-page screenshot needs a tall viewport (the CDP script in the 2026-09-18 session set
  1440×3400 / 390×4400), not `captureBeyondViewport`.

## Deploy

The hosting recipe in [release-workflow.md](release-workflow.md) (pull the production env
with `--path .env.production.local`, `npx expo export -p web --clear`, `eas deploy --prod
--environment production`, verify, delete the pulled env file). Local preview:
`npx expo serve --port 8082` over `dist/`.
