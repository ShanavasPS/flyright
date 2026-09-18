module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Lets `drizzle/migrations.js` import the generated .sql files as strings.
      ['inline-import', { extensions: ['.sql'] }],
      // Compiles the `'use gpu'` functions in services/route-heat.ts to WGSL.
      // Scoped to that file: run over everything it rewrites `jest.mock()`
      // factories so they reference out-of-scope variables and the suite
      // fails to load.
      ['unplugin-typegpu/babel', { include: [/src\/services\/route-heat\.ts$/] }],
    ],
  };
};
