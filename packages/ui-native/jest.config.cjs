"use strict";
/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup-env.ts"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  // lucide-react-native ships ES modules only (`.mjs`), which jest-expo's
  // `\.[jt]sx?$` transform does not cover. Merged with the preset's transforms.
  transform: {
    "\\.mjs$": "babel-jest",
  },
  // RN, Expo, NativeWind and the sheet/icon libraries ship untranspiled code.
  // `.bun/` also covers Bun's isolated linker layout.
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.bun/|react-native|@react-native|@react-native-community|expo|@expo|nativewind|react-native-css-interop|@gorhom|lucide-react-native))",
  ],
};
