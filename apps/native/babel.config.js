module.exports = (api) => {
  api.cache(true);
  return {
    plugins: [
      "react-native-reanimated/plugin",
      // react-native-reanimated/plugin has to be listed last
    ],
    presets: ["babel-preset-expo"],
  };
};
