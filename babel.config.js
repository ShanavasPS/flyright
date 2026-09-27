module.exports = function (api) {
  // Keyed by the calling platform (web vs native) and the profiling switch.
  const web = api.caller((caller) => caller?.platform === 'web');
  api.cache.using(() => process.env.FLYRIGHT_MODULE_TIMING ?? '');
  return {
    presets: [
      [
        'babel-preset-expo',
        web
          ? {}
          : {
              // Native: Babel converts import/export (not Metro, whose
              // `_interopDefault(require(…))` output neither lazyImports nor
              // inlineRequires can defer), and package and `@/` imports load
              // on first use rather than when the importing module loads;
              // relative imports and Expo's side-effect packages stay eager.
              // Without it every screen's dependencies ran at launch — the
              // RevenueCat paywall UI among them, which loads UIManager and
              // with it every view manager's constants (scripts/perf/README.md).
              // A module that must run at launch for its side effect gets a
              // bare `import '…'`, which is never lazy — see flight-watch in
              // src/app/_layout.tsx.
              disableImportExportTransform: false,
              lazyImports: true,
            },
      ],
    ],
    // typegpu exports `* as '~unstable'`, and Babel's CommonJS transform
    // prints that string name as `exports.~unstable` — invalid JS that fails
    // the Hermes compile. Metro's own import transform handles it; typegpu
    // loads only with the share poster, so nothing is lost by it being eager.
    overrides: web
      ? []
      : [{ test: (file) => !!file && /node_modules\/typegpu\//.test(file), presets: [['babel-preset-expo', { disableImportExportTransform: true }]] }],
    plugins: [
      // Lets `drizzle/migrations.js` import the generated .sql files as strings.
      ['inline-import', { extensions: ['.sql'] }],
      // Compiles the `'use gpu'` functions in services/route-heat.ts to WGSL.
      // Scoped to that file: run over everything it rewrites `jest.mock()`
      // factories so they reference out-of-scope variables and the suite
      // fails to load.
      ['unplugin-typegpu/babel', { include: [/src\/services\/route-heat\.ts$/] }],
      // Cold-start profiling builds only (scripts/perf/README.md).
      ...(process.env.FLYRIGHT_MODULE_TIMING === '1' ? [require('./scripts/perf/module-timing-babel')] : []),
    ],
  };
};
