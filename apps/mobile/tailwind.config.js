const base = require("@smog/ui-native/tailwind.config");

/**
 * `darkMode: "class"` is added here, on top of the generated base, rather
 * than left at Tailwind's default `"media"`. NativeWind's own
 * `useColorScheme().setColorScheme` (`nativewind/dist/stylesheet.js`) throws
 * — "Unable to manually set color scheme without using darkMode: class" —
 * whenever `StyleSheet.getFlag("darkMode")` reads `"media"`, and that flag
 * is compiled straight from this config's `darkMode`
 * (`nativewind/dist/tailwind/dark-mode.js`). The settings screen's manual
 * light/dark override needs exactly the call that default forbids; "system"
 * still falls back to the OS appearance either way.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  ...base,
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui-native/src/**/*.{ts,tsx}",
  ],
  darkMode: "class",
};
