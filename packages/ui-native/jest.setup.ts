import fs from "node:fs";
import path from "node:path";
import { configure } from "@testing-library/react-native";
import "@testing-library/react-native";
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
 * `@testing-library/react-native` 13's queries exclude anything hidden from
 * assistive technology by default (`accessibilityElementsHidden`,
 * `importantForAccessibility="no-hide-descendants"`, `aria-hidden`) — right
 * for a query meant to find what a screen reader sees, wrong for
 * `contract.test.tsx`, which grabs every component's `testID="root"`
 * unconditionally, including `Skeleton`'s, whose whole job is to carry that
 * hidden state. Restoring the pre-13 default here keeps that one shared test
 * from needing a per-case exception, and per-component tests that care about
 * hiddenness still assert the props directly rather than relying on a query
 * failing to find the element.
 */
configure({ defaultIncludeHiddenElements: true });

const globalCss = fs.readFileSync(path.join(__dirname, "global.css"), "utf8");
const tailwindConfig = require(path.join(__dirname, "tailwind.config.js"));

beforeAll(async () => {
  const { css } = await postcss([tailwindcss(tailwindConfig)]).process(
    globalCss,
    { from: undefined }
  );

  registerCSS(css);
});
