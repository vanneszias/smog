import { beforeAll } from "@jest/globals";
import postcss from "postcss";
import { registerCSS, setupAllComponents } from "react-native-css-interop/test";
import tailwindcss from "tailwindcss";
import tailwindConfig from "./tailwind.config.cjs";

/**
 * Under Jest there is no Metro, so nothing compiles the kit's classes, and
 * react-native-css-interop skips wrapping the RN primitives when
 * `NODE_ENV === "test"`. Both steps are done here, once per test file:
 * `setupAllComponents()` makes `className` a style again, and the kit's
 * sources go through Tailwind with the same preset the app uses, so a test
 * can assert that `min-h-touch` really is 44 pt.
 */
setupAllComponents();

beforeAll(async () => {
  const { css } = await postcss([tailwindcss(tailwindConfig)]).process(
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;",
    { from: undefined }
  );
  registerCSS(css);
});
