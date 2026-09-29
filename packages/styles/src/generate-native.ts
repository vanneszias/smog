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

/**
 * The NativeWind (Tailwind 3) preset for the mobile app and
 * `@smog/ui-native`. Its scales replace Tailwind's defaults, so only token
 * values exist. `darkMode: "class"` lets the app override the system scheme
 * (`colorScheme.set`); colours switch through variables, not `dark:`
 * classes. Use it after `nativewind/preset`:
 * `presets: [require("nativewind/preset"), require("@smog/styles/tailwind-preset")]`.
 */
export function renderNativeTailwindConfig(): string {
  const { breakpoint, fontSize, fontWeight, motion, radius, spacing } = tokens;
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
    },
    darkMode: "class",
    theme: {
      borderRadius: mapValues(radius, px),
      colors: {
        current: "currentColor",
        transparent: "transparent",
        ...colours(),
      },
      extend: {
        transitionDuration: mapValues(motion.duration, (ms) => `${ms}ms`),
        transitionTimingFunction: {
          standard: `cubic-bezier(${motion.easing.standard.join(", ")})`,
        },
      },
      fontSize: mapValues(fontSize, (step) => [
        px(step.size),
        { lineHeight: px(step.lineHeight) },
      ]),
      fontWeight: mapValues(fontWeight, String),
      lineHeight: mapValues(fontSize, (step) => px(step.lineHeight)),
      // Tailwind 3 emits screens in object order, so they must ascend.
      screens: Object.fromEntries(
        Object.entries(breakpoint)
          .sort(([, a], [, b]) => a - b)
          .map(([key, value]) => [key, px(value)])
      ),
      spacing: mapValues(spacing, px),
    },
  };
  const header = GENERATED_HEADER("tokens.ts via src/generate-native.ts")
    .split("\n")
    .map((line) => ` * ${line}`);
  return [
    "/**",
    ...header,
    " */",
    `module.exports = ${JSON.stringify(preset, null, 2)};`,
    "",
  ].join("\n");
}
