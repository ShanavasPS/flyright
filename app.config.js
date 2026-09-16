// Dynamic config: lets a build point its API routes somewhere other than
// app.json's origin. (The Android Google Maps key that used to be injected
// here went with react-native-maps — the World tab draws its own globe.)

/** Where a native build sends its /api/* fetches (the expo-router `origin`).
 * Production stays on getflyright.com; a local demo/recording build can point
 * at the dev server instead (`FLYRIGHT_ROUTER_ORIGIN=http://localhost:8081`),
 * so live lookups work from a Release build without the dev client — see
 * scripts/demo-video.mjs. Unset = whatever app.json says. */

module.exports = ({ config }) => {
  const routerOrigin = process.env.FLYRIGHT_ROUTER_ORIGIN;
  if (routerOrigin) console.warn(`ℹ️  FLYRIGHT_ROUTER_ORIGIN=${routerOrigin} — API routes resolve there in this build`);

  return {
    ...config,
    plugins: config.plugins.map((plugin) => {
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
