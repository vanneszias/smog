/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  plugins: [],
  // Token scales, `*-dark` colours and class-based dark mode come from the
  // generated preset; it must come after NativeWind's own preset.
  presets: [
    require("nativewind/preset"),
    require("@smog/styles/tailwind-preset"),
  ],
};
