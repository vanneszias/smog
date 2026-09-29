import { kebab } from "./generate-web";
import { type ColorRole, type ThemeName, tokens } from "./tokens";

export type ColorVariable = `--color-${string}`;

/** `#00805F` → `0 128 95`, the form `rgb(var(--x) / <alpha-value>)` needs. */
function channels(hex: string): string {
  return [1, 3, 5]
    .map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
    .join(" ");
}

function variables(theme: ThemeName): Record<ColorVariable, string> {
  const colours: Record<ColorRole, string> = tokens.color[theme];
  return Object.fromEntries(
    Object.entries(colours).map(([role, hex]) => [
      `--color-${kebab(role)}`,
      channels(hex),
    ])
  );
}

/**
 * The colour variables the NativeWind preset reads, per theme. Plain data;
 * `@smog/styles/native` wraps them in NativeWind's `vars()`.
 */
export const nativeThemeVariables: Readonly<
  Record<ThemeName, Record<ColorVariable, string>>
> = {
  dark: variables("dark"),
  light: variables("light"),
};
