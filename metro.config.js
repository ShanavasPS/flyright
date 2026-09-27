const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are imported as inline .sql files (see babel.config.js).
config.resolver.sourceExts.push('sql');

// Lazy module loading on native (scripts/perf/README.md has the measurements).
// Babel converts import/export there with lazyImports (babel.config.js), so
// package and `@/` imports load on first use; inlineRequires does the same for
// the plain require() calls of CommonJS packages. Import support stays on for
// what Babel leaves to Metro (typegpu, see babel.config.js) and for web, whose
// bundles are tree-shaken ESM and keep Expo's defaults.
config.transformer.getTransformOptions = async (_entryPoints, { platform }) => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: platform !== 'web',
  },
});

module.exports = config;
