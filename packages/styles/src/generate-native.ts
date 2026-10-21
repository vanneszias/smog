import { GENERATED_HEADER, kebab } from "./generate-web";
import { tokens } from "./tokens";

function px(value: number): string {
  return `${value}px`;
}

function mapValues<T>(
  record: Record<string, T>,
  map: (value: T) => unknown
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, map(value)])
  );
}

/**
 * Every role reads its CSS variable, so one class (`bg-surface`) follows the
 * theme: the app applies `themeVars.light` or `themeVars.dark` from
 * `@smog/styles/native` at its root. The channel form keeps opacity
 * modifiers (`bg-primary/10`) working.
 */
function colours(): Record<string, string> {
  return Object.fromEntries(
    Object.keys(tokens.color.light).map((role) => [
      kebab(role),
      `rgb(var(--color-${kebab(role)}) / <alpha-value>)`,
    ])
  );
}

/** The weights Figtree is embedded in (`fontFamily.native`); each is a file. */
const WEIGHTS = {
  bold: 700,
  medium: 500,
  regular: 400,
  semibold: 600,
} as const;

function weightUtilities(): Record<string, Record<string, string>> {
  return Object.fromEntries(
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((name) => [
      `.font-${name}`,
      {
        fontFamily: tokens.fontFamily.native[name],
        fontWeight: String(WEIGHTS[name]),
      },
    ])
  );
}

/**
 * The NativeWind (Tailwind 3) preset for the mobile app and
 * `@smog/ui-native`. Its scales replace Tailwind's defaults, so only token
 * values exist. `darkMode: "class"` lets the app override the system scheme
 * (`colorScheme.set`); colours switch through variables, not `dark:`
 * classes. Use it after `nativewind/preset`:
 * `presets: [require("nativewind/preset"), require("@smog/styles/tailwind-preset")]`.
 */
export function renderNativeTailwindConfig(): string {
  const { breakpoint, fontSize, motion, radius, spacing } = tokens;
  const preset = {
    // Tailwind 3 routes colours through `--tw-*-opacity` variables
    // (`bg-primary` sets `--tw-bg-opacity: 1`). css-interop remounts a view
    // that starts setting a variable after its first render (a view that
    // gains `bg-primary` on press), so they are off; opacity modifiers
    // (`bg-primary/40`) still work through `<alpha-value>`.
    corePlugins: {
      backgroundOpacity: false,
      borderOpacity: false,
      divideOpacity: false,
      placeholderOpacity: false,
      ringOpacity: false,
      textOpacity: false,
      // Replaced by the plugin below: a weight also picks the Figtree file.
      fontWeight: false,
    },
    darkMode: "class",
    theme: {
      colors: {
        current: "currentColor",
        transparent: "transparent",
        white: tokens.color.brand.white,
        ...colours(),
      },
      // Phase 10a (ruling 2, mobile side): Tailwind's default scales stay
      // (they are rem; the app sets NativeWind's `inlineRem` to 16, as the
      // web's root size), and the token scales extend them, overriding the
      // names both define (`rounded-lg`, `text-body`, `p-4`).
      extend: {
        borderRadius: mapValues(radius, px),
        fontSize: mapValues(fontSize, (step) => [
          px(step.size),
          { lineHeight: px(step.lineHeight) },
        ]),
        fontFamily: { sans: [tokens.fontFamily.native.regular] },
        lineHeight: mapValues(fontSize, (step) => px(step.lineHeight)),
        // Tailwind 3 emits screens in object order, so they must ascend.
        screens: Object.fromEntries(
          Object.entries(breakpoint)
            .sort(([, a], [, b]) => a - b)
            .map(([key, value]) => [key, px(value)])
        ),
        spacing: mapValues(spacing, px),
        transitionDuration: mapValues(motion.duration, (ms) => `${ms}ms`),
        transitionTimingFunction: {
          standard: `cubic-bezier(${motion.easing.standard.join(", ")})`,
        },
      },
    },
  };
  const header = GENERATED_HEADER("tokens.ts via src/generate-native.ts")
    .split("\n")
    .map((line) => ` * ${line}`);
  return [
    "/**",
    ...header,
    " */",
    `const preset = ${JSON.stringify(preset, null, 2)};`,
    "",
    "// `font-medium` and the other weights set the Figtree file of that weight",
    "// and `fontWeight` (a custom font ignores `fontWeight` on Android). A bare",
    "// function is a Tailwind plugin, so this file needs no `require`.",
    `const weights = ${JSON.stringify(weightUtilities(), null, 2)};`,
    "",
    "module.exports = {",
    "  ...preset,",
    "  plugins: [",
    "    ({ addUtilities }) => {",
    "      addUtilities(weights);",
    "    },",
    "  ],",
    "};",
    "",
  ].join("\n");
}
