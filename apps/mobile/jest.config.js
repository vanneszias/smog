/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  // oRPC ships ES modules only (`.mjs`), which jest-expo's `\.[jt]sx?$`
  // transform does not cover. Merged with the preset's transforms.
  transform: {
    "\\.mjs$": "babel-jest",
  },
  // RN, Expo, NativeWind and oRPC ship untranspiled code. `.bun/` also covers
  // Bun's isolated linker layout, should the repo ever leave the hoisted linker.
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.bun/|react-native|@react-native|@react-native-community|expo|@expo|react-navigation|@react-navigation|nativewind|react-native-css-interop|@orpc))",
  ],
};
