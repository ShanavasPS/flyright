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

module.exports = ({ config }) => {
  const androidGoogleMapsApiKey = process.env[MAPS_KEY_VAR];

  if (!androidGoogleMapsApiKey) {
    const message =
      `${MAPS_KEY_VAR} is not set — the Android map would ship blank. Add it to ` +
      `.env for local prebuilds, or to the EAS environment for this build profile.`;
    if (process.env.EAS_BUILD === 'true') throw new Error(message);
    console.warn(`⚠️  ${message}`);
  }

  return {
    ...config,
    plugins: config.plugins.map((plugin) =>
      plugin === 'react-native-maps'
        ? ['react-native-maps', { androidGoogleMapsApiKey }]
        : plugin
    ),
  };
};
