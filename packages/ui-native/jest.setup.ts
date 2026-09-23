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
 * exception for names starting with `mock` (case-insensitive), for exactly
 * this "the mock is required lazily" case.
 */
import * as mockExpoVideo from "./src/test/expoVideoMock";

/**
 * NativeWind has no Metro bundler under Jest, so nothing ever compiles
 * `global.css` through Tailwind, and `react-native-css-interop` skips its
 * automatic `View`/`Text`/etc. wrapping when `NODE_ENV === "test"` (jest's
 * own default) so it never collides with plain react-native snapshot
 * tests elsewhere. Both steps have to be done by hand here, once, for
 * every test file in this package:
 *
 * 1. `setupAllComponents()` registers the React Native primitives with
 *    `cssInterop` so a `className` prop is read at all.
 * 2. Running `global.css` through Tailwind with this package's own
 *    `tailwind.config.js` and registering the result is the same
 *    compilation Metro performs at build time in the app.
 */
setupAllComponents();

/**
 * NativeWind routes `animate-*` classes (used by `Skeleton`) through
 * `react-native-reanimated`, whose own jest mock (`mock.js`) still imports
 * real, non-type-only symbols from its real entry point, which requires
 * `react-native-worklets` — so the worklets mock has to be registered first,
 * or reanimated's mock still constructs the real native worklets module and
 * throws. Order matters for exactly that reason.
 */
jest.mock("react-native-worklets", () =>
  require("react-native-worklets/lib/module/mock")
);
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock")
);

/**
 * `@shopify/flash-list` ships its own jest setup (`flash-list/jestSetup.js`),
 * which this package does **not** use: it swaps `FlashList` for a
 * `RecyclerView` it imports from the package's main entry point, but the
 * installed `@shopify/flash-list@2.0.2` does not re-export `RecyclerView`
 * from there (confirmed against `node_modules/@shopify/flash-list/dist/
 * index.js`, which has no such export) — requiring that upstream file
 * leaves `FlashList` `undefined` and crashes inside
 * `react-native-css-interop`'s JSX wrapper instead of inside `FlashList`
 * itself. What actually matters for a test is the second half of that
 * upstream file: `FlashList`'s recyclerview core measures its container and
 * every item through real native layout, which never happens under the
 * test renderer, so nothing renders without it. That half is reproduced
 * directly here, against the real `FlashList`.
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
 * `expo-video` reaches for a native module (`requireNativeModule`) that does
 * not exist under the test renderer and throws at import time — confirmed
 * directly: importing `VideoView`/`useVideoPlayer` in a plain test file
 * fails before a single test runs, with
 * `TypeError: Cannot read properties of undefined (reading 'prototype')`
 * inside `expo-video/src/VideoPlayer.tsx`. `VideoPlayer.tsx`'s tests need a
 * player object and a view to stand in for both, defined in
 * `src/test/expoVideoMock.tsx` rather than inline here — see that file's own
 * comment for why the mock has to live there instead.
 */
jest.mock("expo-video", () => ({
  useVideoPlayer: mockExpoVideo.useVideoPlayer,
  VideoView: mockExpoVideo.VideoView,
}));

const globalCss = fs.readFileSync(path.join(__dirname, "global.css"), "utf8");
const tailwindConfig = require(path.join(__dirname, "tailwind.config.js"));

beforeAll(async () => {
  const { css } = await postcss([tailwindcss(tailwindConfig)]).process(
    globalCss,
    { from: undefined }
  );

  registerCSS(css);
});
