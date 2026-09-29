/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  preset: "jest-expo",
  // The kit's mocks for native modules (reanimated, gesture handler, the
  // bottom sheet, haptics, safe area), shared so they are written once.
  setupFiles: [require.resolve("@smog/ui-native/jest-setup")],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  // oRPC and lucide ship ES modules only (`.mjs`), which jest-expo's
  // `\.[jt]sx?$` transform does not cover. Merged with the preset's transforms.
  transform: {
    "\\.mjs$": "babel-jest",
  },
  // RN, Expo, NativeWind, oRPC and the kit's libraries ship untranspiled
  // code. `.bun/` also covers Bun's isolated linker layout, should the repo
  // ever leave the hoisted linker.
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.bun/|react-native|@react-native|@react-native-community|expo|@expo|react-navigation|@react-navigation|nativewind|react-native-css-interop|@orpc|@gorhom|lucide-react-native))",
  ],
};
