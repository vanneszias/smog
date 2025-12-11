const path = require("node:path");

// Detect if we're being called by React Native CLI vs Expo CLI
const isReactNativeCLI = process.argv.some((arg) =>
  arg.includes("react-native")
);

let config;

if (isReactNativeCLI) {
  // Use React Native metro config for react-native bundle command
  const { getDefaultConfig } = require("@react-native/metro-config");
  const { mergeConfig } = require("metro-config");

  const defaultConfig = getDefaultConfig(__dirname);

  config = mergeConfig(defaultConfig, {
    transformer: {
      babelTransformerPath: require.resolve("react-native-svg-transformer"),
    },
    resolver: {
      alias: {
        "@": path.resolve(__dirname),
        "@components": path.resolve(__dirname, "components"),
        "@/components": path.resolve(__dirname, "components"),
        "@/context": path.resolve(__dirname, "context"),
        "@/screens": path.resolve(__dirname, "screens"),
        "@/services": path.resolve(__dirname, "services"),
        "@/styles": path.resolve(__dirname, "styles"),
        "@/translations": path.resolve(__dirname, "translations"),
        "@/assets": path.resolve(__dirname, "assets"),
      },
      assetExts: defaultConfig.resolver.assetExts.filter(
        (ext) => ext !== "svg"
      ),
      sourceExts: [...defaultConfig.resolver.sourceExts, "svg"],
    },
  });
} else {
  // Use Expo metro config for expo commands
  const { getDefaultConfig } = require("expo/metro-config");

  config = getDefaultConfig(__dirname);

  // Add path aliases for @ imports
  config.resolver.alias = {
    "@": path.resolve(__dirname),
    "@components": path.resolve(__dirname, "components"),
    "@/components": path.resolve(__dirname, "components"),
    "@/context": path.resolve(__dirname, "context"),
    "@/screens": path.resolve(__dirname, "screens"),
    "@/services": path.resolve(__dirname, "services"),
    "@/styles": path.resolve(__dirname, "styles"),
    "@/translations": path.resolve(__dirname, "translations"),
    "@/assets": path.resolve(__dirname, "assets"),
  };

  // Configure SVG transformer
  config.transformer = {
    ...config.transformer,
    babelTransformerPath: require.resolve("react-native-svg-transformer"),
  };

  config.resolver.assetExts = config.resolver.assetExts.filter(
    (ext) => ext !== "svg"
  );
  config.resolver.sourceExts.push("svg");
}

module.exports = config;
