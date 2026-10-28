"use strict";
/** @type {import('jest').Config} */
const path = require("node:path");
module.exports = {
  clearMocks: true,
  // Two jest packages and the Workers pools share the cores under turbo.
  maxWorkers: "50%",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  preset: "jest-expo",
  rootDir: path.resolve(__dirname, "../../../../ui-native"),
  roots: [
    path.resolve(__dirname, "../../../native"),
    path.resolve(__dirname, "../../../../ui-native"),
  ],
  setupFiles: [path.join(__dirname, "jest.setup-env.ts")],
  setupFilesAfterEnv: [path.join(__dirname, "jest.setup.ts")],
  testMatch: [
    path.resolve(
      __dirname,
      "../../../native/shared/ui-native/**/*.test.{ts,tsx}"
    ),
  ],
  // The first render of a suite (expo-router, NativeWind, transforms) can
  // pass 5 s when turbo runs every package's tests at once on a small box.
  testTimeout: 10_000,
  // lucide-react-native ships ES modules only (`.mjs`), which jest-expo's
  // `\.[jt]sx?$` transform does not cover. Merged with the preset's transforms.
  transform: {
    "\\.[jt]sx?$": [
      "babel-jest",
      { configFile: path.resolve(__dirname, "./babel.config.cjs") },
    ],
    "\\.mjs$": [
      "babel-jest",
      { configFile: path.resolve(__dirname, "./babel.config.cjs") },
    ],
  },
  // RN, Expo, NativeWind and the sheet/icon libraries ship untranspiled code.
  // `.bun/` also covers Bun's isolated linker layout.
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.bun/|react-native|@react-native|@react-native-community|expo|@expo|nativewind|react-native-css-interop|@gorhom|lucide-react-native))",
  ],
};
