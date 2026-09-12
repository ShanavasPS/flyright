// Dynamic config so the Android Google Maps key lives in the environment instead
// of the repo. The key still ships inside the APK — unavoidable for the Maps SDK —
// and is API-restricted to maps-android-backend, so exposure costs nothing.
// Keeping it out of app.json is what lets this repo be public.
//
// Set it in .env for local prebuilds and in the EAS environment for every build
// profile (production/preview/development all have it). EAS CLI resolves the app
// config BEFORE injecting environment variables, so throwing unconditionally here
// would break every `eas` command that reads the config — hence the split: on the
// build worker a missing key is fatal (it would ship a blank World-tab map with no
// other signal), everywhere else it is a warning.

const MAPS_KEY_VAR = 'GOOGLE_MAPS_ANDROID_API_KEY';
/** Where a native build sends its /api/* fetches (the expo-router `origin`).
 * Production stays on getflyright.com; a local demo/recording build can point
 * at the dev server instead (`FLYRIGHT_ROUTER_ORIGIN=http://localhost:8081`),
 * so live lookups work from a Release build without the dev client — see
 * scripts/demo-video.mjs. Unset = whatever app.json says. */

module.exports = ({ config }) => {
  const androidGoogleMapsApiKey = process.env[MAPS_KEY_VAR];

  if (!androidGoogleMapsApiKey) {
    const message =
      `${MAPS_KEY_VAR} is not set — the Android map would ship blank. Add it to ` +
      `.env for local prebuilds, or to the EAS environment for this build profile.`;
    if (process.env.EAS_BUILD === 'true') throw new Error(message);
    console.warn(`⚠️  ${message}`);
  }

  const routerOrigin = process.env.FLYRIGHT_ROUTER_ORIGIN;
  if (routerOrigin) console.warn(`ℹ️  FLYRIGHT_ROUTER_ORIGIN=${routerOrigin} — API routes resolve there in this build`);

  return {
    ...config,
    plugins: config.plugins.map((plugin) => {
      if (plugin === 'react-native-maps') return ['react-native-maps', { androidGoogleMapsApiKey }];
      if (routerOrigin && Array.isArray(plugin) && plugin[0] === 'expo-router') {
        return ['expo-router', { ...plugin[1], origin: routerOrigin }];
      }
      return plugin;
    }),
    extra: routerOrigin
      ? { ...config.extra, router: { ...config.extra?.router, origin: routerOrigin } }
      : config.extra,
  };
};
