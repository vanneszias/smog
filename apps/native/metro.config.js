const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

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

// Configure asset extensions to exclude SVG from standard asset handling
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== "svg"
);

// Add SVG to source extensions so it can be transformed
config.resolver.sourceExts.push("svg");

module.exports = config;
