const SIX_DIGIT_HEX = /^#?([0-9a-fA-F]{6})$/;
const HEX_RADIX = 16;
const HEX_PAIR = 2;
const OPAQUE = 1;

/**
 * Converts a `#RRGGBB` token into the string NativeWind actually renders.
 *
 * Measured in Task 1: Tailwind v3 routes every colour utility through a
 * `--tw-bg-opacity` custom property (so an opacity modifier like `bg-primary/50`
 * has something to multiply), and NativeWind resolves that at runtime into an
 * `rgba(r, g, b, a)` string rather than preserving the hex — `toHaveStyle`
 * never receives the hex literal a token declares. `resolvedColor("#00805F")`
 * returns `"rgba(0, 128, 95, 1)"`, matching the gate test in `gate.test.tsx`.
 *
 * Every colour assertion in this package calls this on a value read from
 * `tokens`, so a hex literal never has to appear in a test either.
 */
export function resolvedColor(hex: string, alpha = OPAQUE): string {
  const match = SIX_DIGIT_HEX.exec(hex);

  if (!match) {
    throw new Error(`Expected a six-digit hex colour, received "${hex}"`);
  }

  const value = match[1] as string;
  const r = Number.parseInt(value.slice(0, HEX_PAIR), HEX_RADIX);
  const g = Number.parseInt(value.slice(HEX_PAIR, HEX_PAIR * 2), HEX_RADIX);
  const b = Number.parseInt(value.slice(HEX_PAIR * 2, HEX_PAIR * 3), HEX_RADIX);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
