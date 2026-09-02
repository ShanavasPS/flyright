// Public client keys — set in .env as EXPO_PUBLIC_* (safe to embed in the app binary).
// Server-only secrets (flight data API keys, webhook auth) live in EAS Hosting env vars
// and are read in src/app/api/* via process.env — never here.

/** Which store this binary is built for — set per build profile in eas.json.
 * 'galaxy' (Samsung Galaxy Store) ships without billing: RevenueCat has no
 * Samsung IAP integration, so Pro is not sold there. */
export const IS_GALAXY_BUILD = process.env.EXPO_PUBLIC_STORE_VARIANT === 'galaxy';

export const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '';
export const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '';
// RevenueCat Test Store key — dev fallback when no platform key is set. Must not ship.
export const RC_API_KEY_TEST = process.env.EXPO_PUBLIC_RC_TEST_KEY ?? '';
export const ONESIGNAL_APP_ID = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? '';
// Convex deployment URL. Empty → cloud sync is disabled and the app runs local-only.
export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';
// RevenueCat Web Purchase Link base (https://pay.rev.cat/<token>) — the web
// funnel appends /<clerkUserId>. Empty → web checkout hides and the funnel
// points at the store listings instead.
export const WEB_PURCHASE_LINK = process.env.EXPO_PUBLIC_WEB_PURCHASE_LINK ?? '';

/** Cheapest plan, for the web funnel's chrome and pre-checkout copy — so /go-pro
 * isn't a blind click into Stripe. Hand-kept: the authoritative prices live in the
 * RevenueCat default offering ($rc_monthly €1.99/mo intro ×3 then €4.99 /
 * $rc_annual €19.99 first year then €29.99 / $rc_lifetime €49.51 as of
 * 2026-09-02) and the checkout page shows all three in the visitor's own
 * currency. Re-check this string when those change. */
export const PRO_PRICE_FROM = 'from €1.99/month';

// Layers (growth analytics / install attribution) app id — see
// src/services/analytics.ts. Empty → the SDK never initializes and every
// trackEvent call is a no-op.
export const LAYERS_APP_ID = process.env.EXPO_PUBLIC_LAYERS_APP_ID ?? '';

// Shown on the privacy/support pages and in store listings.
export const SUPPORT_EMAIL = 'shanavascruise@gmail.com';
