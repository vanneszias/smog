/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  // RN, Expo and NativeWind ship untranspiled code. `.bun/` also covers Bun's
  // isolated linker layout, should the repo ever leave the hoisted linker.
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.bun/|react-native|@react-native|@react-native-community|expo|@expo|react-navigation|@react-navigation|nativewind|react-native-css-interop))",
  ],
};
