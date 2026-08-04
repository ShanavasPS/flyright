module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Lets `drizzle/migrations.js` import the generated .sql files as strings.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
