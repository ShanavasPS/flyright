# getflyright.com — the website

The web build (`npx expo export -p web`, EAS Hosting) serves the app's router tree, but
only a few routes are the *website*: the front page, the flight checker and the Pro
checkout, wrapped in `SiteChrome`. Everything else (`/world`, `/people`, …) is the app
rendered on the web and is not linked from the site.

## Pages

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `src/screens/landing.web.tsx` via `src/app/(tabs)/(journeys)/index.tsx` (web branch) | Front page: hero, six features, the EU261 band with a mini checker, screenshots, Pro. |
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

- Screenshots: `assets/images/landing/*.png` (640 px wide, palette PNG) from the release
  build on the "FlyRight Shots" simulator, seeded with
  `node scripts/seed-demo-data.mjs --ios --sim <udid> --travel-day`, status bar
  `xcrun simctl status_bar <udid> override --time 9:41 …`, deep links `flyright:///`,
  `/journey/demo-upcoming`, `/world`, `/stats`, `/add-flight`, `/journey/demo-mad`, `/people`,
  `xcrun simctl io <udid> screenshot`. Downsize with sharp (`resize({ width: 640 })`,
  `png({ palette: true })`). Reshoot after visible UI changes; the store panels in
  `store-assets/raw` are a separate set.
- `public/og-image.png` (1200×630) and `public/apple-touch-icon.png`: `node
  scripts/generate-og-image.mjs`.
- Store badges: `assets/images/badge-app-store.png`, `badge-google-play.png`.

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
