import { jest } from "@jest/globals";

// `expo-router/testing-library` mocks Reanimated again when it is first
// imported (and loads that mock at once), without the kit's
// `useReducedMotion`, so a Skeleton or a heart would throw under
// `renderRouter`. It is loaded here (it needs `expect`) and the hook is put
// back on the mock every later import gets.
require("expo-router/testing-library");
const reanimated = require("react-native-reanimated") as Record<
  string,
  unknown
>;
reanimated.useReducedMotion ??= jest.fn(() => false);
