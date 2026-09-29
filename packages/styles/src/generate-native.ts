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

function colours(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [role, value] of Object.entries(tokens.color.light)) {
    result[kebab(role)] = value;
  }
  // NativeWind needs a real class per dark colour: `dark:bg-surface-dark`.
  for (const [role, value] of Object.entries(tokens.color.dark)) {
    result[`${kebab(role)}-dark`] = value;
  }
  return result;
}

/**
 * The NativeWind (Tailwind 3) preset for the mobile app and
 * `@smog/ui-native`. Its scales replace Tailwind's defaults, so only token
 * values exist. Use it after `nativewind/preset`:
 * `presets: [require("nativewind/preset"), require("@smog/styles/tailwind-preset")]`.
 */
export function renderNativeTailwindConfig(): string {
  const { breakpoint, fontSize, fontWeight, motion, radius, spacing } = tokens;
  const preset = {
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
