"use strict";
const path = require("node:path");

/**
 * The kit's own Tailwind config, for its tests only. The app compiles the
 * kit's classes through `apps/mobile/tailwind.config.js`, which lists these
 * sources too.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [path.join(__dirname, "src/**/*.{ts,tsx}")],
  plugins: [],
  presets: [
    require("nativewind/preset"),
    require("@smog/styles/tailwind-preset"),
  ],
};
