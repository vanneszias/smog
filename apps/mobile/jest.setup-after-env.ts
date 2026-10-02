import { jest } from "@jest/globals";

// `expo-router/testing-library` mocks Reanimated again when it is first
// imported (and loads that mock at once), without the kit's
// `useReducedMotion`, so a Skeleton or a heart would throw under
// `renderRouter`. It is loaded here (it needs `expect`) and the hook is put
// back on the mock every later import gets.
const { configure } =
  require("expo-router/testing-library") as typeof import("expo-router/testing-library");
// RNTL's `findBy*` and `waitFor` give up after 1 s by default. Under the
// whole turbo test run one render can take longer than that, so a screen
// that is merely slow read as missing. A real miss still fails, after 5 s.
configure({ asyncUtilTimeout: 5000 });
const reanimated = require("react-native-reanimated") as Record<
  string,
  unknown
>;
reanimated.useReducedMotion ??= jest.fn(() => false);
