module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Limit plugins to save memory/resources
    plugins: [
      // Only add essential plugins
    ],
  };
}; 