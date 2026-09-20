import type { ThemeName, Tokens } from "./tokens";

/**
 * Renders the token object as CSS custom property declarations for one theme.
 *
 * This is the web half of the guarantee in `tokens.ts`: native reads the object
 * and web reads this output, so neither platform can drift without the other
 * following. Nothing here hardcodes a value — every declaration is walked out
 * of the object it is handed.
 *
 * The return value is a list of declarations with no selector around it, so the
 * caller decides whether they land on `:root`, on `.dark`, or somewhere else.
 */
export function toCssVariables(tokens: Tokens, theme: ThemeName): string {
  return [
    ...scale("color", tokens.semantic[theme], identity),
    ...scale("spacing", tokens.spacing, px),
    ...scale("radius", tokens.radius, px),
    ...scale("font-size", tokens.fontSize, px),
    ...scale("line-height", tokens.lineHeight, px),
    ...scale("duration", tokens.duration, ms),
    ...scale("shadow", tokens.shadow, identity),
  ].join("\n");
}

function scale<Value extends string | number>(
  prefix: string,
  values: Readonly<Record<string, Value>>,
  format: (value: Value) => string
): string[] {
  return Object.entries(values).map(
    ([key, value]) => `--${prefix}-${kebabCase(key)}: ${format(value)};`
  );
}

function identity(value: string | number): string {
  return String(value);
}

function px(value: string | number): string {
  return `${value}px`;
}

function ms(value: string | number): string {
  return `${value}ms`;
}

/** `surfaceRaised` becomes `surface-raised`; `md` and `600` are left alone. */
function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
