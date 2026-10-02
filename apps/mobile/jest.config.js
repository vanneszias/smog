/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  // Two jest packages and the Workers pools share the cores under turbo.
  maxWorkers: "50%",
  preset: "jest-expo",
  // The kit's mocks for native modules (reanimated, gesture handler, the
  // bottom sheet, haptics, safe area), shared so they are written once.
  setupFiles: [
    require.resolve("@smog/ui-native/jest-setup"),
    "<rootDir>/jest.setup.ts",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup-after-env.ts"],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  // The route modules' cold require is paid in the harness's `beforeAll`.
  // A test then renders and waits with `findBy*` (up to 5 s each, see
  // jest.setup-after-env.ts); under the whole turbo test run on 4 cores one
  // render can take seconds, so 10 s was passed by a test with two waits.
  testTimeout: 30_000,
  // oRPC and lucide ship ES modules only (`.mjs`), which jest-expo's
  // `\.[jt]sx?$` transform does not cover. Merged with the preset's transforms.
  transform: {
    "\\.mjs$": "babel-jest",
  },
  // RN, Expo (and expo-router's standard-navigation), NativeWind, oRPC and
  // the kit's libraries ship untranspiled code. `.bun/` also covers Bun's
  // isolated linker layout, should the repo ever leave the hoisted linker.
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.bun/|react-native|@react-native|@react-native-community|expo|@expo|react-navigation|@react-navigation|nativewind|react-native-css-interop|@orpc|@gorhom|lucide-react-native|standard-navigation))",
  ],
};
