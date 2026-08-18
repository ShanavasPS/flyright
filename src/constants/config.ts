// Public client keys — set in .env as EXPO_PUBLIC_* (safe to embed in the app binary).
// Server-only secrets (flight data API keys, webhook auth) live in EAS Hosting env vars
// and are read in src/app/api/* via process.env — never here.

export const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '';
export const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '';
// RevenueCat Test Store key — dev fallback when no platform key is set. Must not ship.
export const RC_API_KEY_TEST = process.env.EXPO_PUBLIC_RC_TEST_KEY ?? '';
export const ONESIGNAL_APP_ID = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? '';
// Convex deployment URL. Empty → cloud sync is disabled and the app runs local-only.
export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';

// Shown on the privacy/support pages and in store listings.
export const SUPPORT_EMAIL = 'shanavascruise@gmail.com';
