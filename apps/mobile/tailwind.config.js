const path = require("node:path");

/** The kit's sources, so Tailwind emits the classes its components use. */
const UI_NATIVE_SOURCES = path.join(
  path.dirname(require.resolve("@smog/ui-native/package.json")),
  "src/**/*.{ts,tsx}"
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}", UI_NATIVE_SOURCES],
  plugins: [],
  // Token scales, the colour variables and class-based dark mode come from
  // the generated preset; it must come after NativeWind's own preset.
  presets: [
    require("nativewind/preset"),
    require("@smog/styles/tailwind-preset"),
  ],
};
