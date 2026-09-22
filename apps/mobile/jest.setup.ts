import fs from "node:fs";
import path from "node:path";
import "@testing-library/react-native";
import { jest } from "@jest/globals";
import postcss from "postcss";
import { registerCSS, setupAllComponents } from "react-native-css-interop/test";
import tailwindcss from "tailwindcss";
/**
 * Imported (not `require`d) so knip can see this file is used — and named
 * with a `mock` prefix so the reference is still allowed inside the
 * `jest.mock()` factory below: babel-plugin-jest-hoist's sandbox forbids a
 * factory from closing over an outer-scope variable, with one documented
 * exception for names starting with `mock` (case-insensitive). Mirrors
 * `packages/ui-native/jest.setup.ts`, whose own comment explains this in
 * full.
 */
import * as mockExpoVideo from "./src/test/expoVideoMock";

/**
 * This app renders `@smog/ui-native` components directly (the kitchen-sink
 * route, and every screen after it), so it needs the same NativeWind jest
 * wiring that package's own `jest.setup.ts` sets up for itself: nothing
 * compiles `global.css` through Tailwind under Jest, and
 * `react-native-css-interop` skips its automatic component wrapping outside
 * of `setupAllComponents()`.
 */
setupAllComponents();

/**
 * Order matters: `react-native-reanimated`'s own jest mock still imports
 * real, non-type-only symbols from `react-native-worklets`, so the worklets
 * mock has to be registered first or reanimated's mock throws trying to
 * construct the real native worklets module. See
 * `packages/ui-native/jest.setup.ts` for the full explanation.
 */
jest.mock("react-native-worklets", () =>
  require("react-native-worklets/lib/module/mock")
);
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock")
);

/**
 * `@shopify/flash-list`'s own shipped `jestSetup.js` is broken against the
 * installed `2.0.2`: it imports a `RecyclerView` export `dist/index.js`
 * does not have. `packages/ui-native/jest.setup.ts` reproduces the half of
 * that upstream file that actually matters for a test under the test
 * renderer — measuring the list's container and each item — directly
 * against the real `FlashList`; the same reproduction is needed here for
 * `GestureGrid`.
 */
jest.mock("@shopify/flash-list/dist/recyclerview/utils/measureLayout", () => {
  const actual = jest.requireActual(
    "@shopify/flash-list/dist/recyclerview/utils/measureLayout"
  );

  return {
    ...actual,
    measureFirstChildLayout: jest.fn(() => ({
      height: 900,
      width: 400,
      x: 0,
      y: 0,
    })),
    measureItemLayout: jest.fn(() => ({
      height: 100,
      width: 100,
      x: 0,
      y: 0,
    })),
    measureParentSize: jest.fn(() => ({
      height: 900,
      width: 400,
      x: 0,
      y: 0,
    })),
  };
});

/**
 * `expo-video` reaches for a native module that does not exist under the
 * test renderer and throws at import time. See
 * `packages/ui-native/jest.setup.ts` for how this was confirmed.
 */
jest.mock("expo-video", () => ({
  useVideoPlayer: mockExpoVideo.useVideoPlayer,
  VideoView: mockExpoVideo.VideoView,
}));

/**
 * `@react-native-async-storage/async-storage` reaches for its native module
 * at import time too — `[@RNC/AsyncStorage]: NativeModule: AsyncStorage is
 * null.`, confirmed against a bare import under this same test renderer —
 * so every test that reaches `src/lib/session.ts`, including `api.test.ts`
 * (through `payloadFetch`'s import of `./session`), needs this registered
 * globally rather than per file. The package ships its own jest mock for
 * exactly this reason; this reproduces the one line its own docs recommend
 * rather than hand-rolling an equivalent.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const globalCss = fs.readFileSync(path.join(__dirname, "global.css"), "utf8");
const tailwindConfig = require(path.join(__dirname, "tailwind.config.js"));

beforeAll(async () => {
  const { css } = await postcss([tailwindcss(tailwindConfig)]).process(
    globalCss,
    { from: undefined }
  );

  registerCSS(css);
});
