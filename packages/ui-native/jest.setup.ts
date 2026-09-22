import fs from "node:fs";
import path from "node:path";
import "@testing-library/react-native";
import { jest } from "@jest/globals";
import postcss from "postcss";
import { registerCSS, setupAllComponents } from "react-native-css-interop/test";
import tailwindcss from "tailwindcss";

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

const globalCss = fs.readFileSync(path.join(__dirname, "global.css"), "utf8");
const tailwindConfig = require(path.join(__dirname, "tailwind.config.js"));

beforeAll(async () => {
  const { css } = await postcss([tailwindcss(tailwindConfig)]).process(
    globalCss,
    { from: undefined }
  );

  registerCSS(css);
});
