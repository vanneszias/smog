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
    ...scale("spacing", numericStepsOnly(tokens.spacing), px),
    ...scale("radius", tokens.radius, px),
    ...scale("font-size", tokens.fontSize, px),
    ...scale("line-height", tokens.lineHeight, px),
    ...scale("duration", tokens.duration, ms),
    ...scale("shadow", tokens.shadow, identity),
  ].join("\n");
}

/**
 * Drops the `xs`/`sm`/`md`/`lg`/`xl`/`xxl` aliases before anything reaches CSS.
 *
 * They exist in the token object for the native app, which still writes
 * `SPACING.md`, and they must stay there until Stage 8. They must **not**
 * become `--spacing-*` custom properties, because Tailwind v4 resolves a
 * t-shirt-named width or height from the spacing namespace **before** the
 * container namespace. With `--spacing-lg` declared, `max-w-lg` compiles to
 * `max-width: var(--spacing-lg)` — 24px, not 32rem — and `max-w-sm` to 8px.
 *
 * That is not a theory. Before this filter existed, the kitchen-sink route
 * rendered `DialogContent` (`max-w-lg`) 50 pixels wide and `SheetContent`
 * (`max-w-sm`) 49, and every unit test passed, because the class name is
 * spelled correctly and jsdom computes no layout. `css.test.ts` pins the
 * absence of these names for exactly that reason.
 */
function numericStepsOnly<Value>(
  spacing: Readonly<Record<string, Value>>
): Readonly<Record<string, Value>> {
  return Object.fromEntries(
    Object.entries(spacing).filter(([key]) => /^\d+(\.\d+)?$/.test(key))
  );
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
