/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  plugins: [],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Placeholder until `@smog/styles` generates the brand tokens (phase 2).
        brand: "#00805F",
      },
    },
  },
};
