const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Absolute paths, so the config also loads from the repo root (knip, turbo).
module.exports = withNativeWind(config, {
  configPath: path.join(__dirname, "tailwind.config.js"),
  input: path.join(__dirname, "global.css"),
});
