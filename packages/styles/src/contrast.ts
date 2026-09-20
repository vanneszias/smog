import { parseHex } from "./hex";

/**
 * WCAG 2.1 contrast, computed rather than asserted.
 *
 * A hardcoded expected ratio proves nothing about a palette, so this is the
 * published formula: linearize each sRGB channel, weight them into a relative
 * luminance, and compare the lighter against the darker.
 *
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

const MAX_CHANNEL = 255;
const LINEAR_THRESHOLD = 0.039_28;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIVISOR = 1.055;
const GAMMA_EXPONENT = 2.4;

const LUMINANCE_R = 0.2126;
const LUMINANCE_G = 0.7152;
const LUMINANCE_B = 0.0722;

/** The 0.05 term models ambient screen flare; it is part of the WCAG formula. */
const FLARE = 0.05;

function linearize(channel: number): number {
  const value = channel / MAX_CHANNEL;
  return value <= LINEAR_THRESHOLD
    ? value / LINEAR_DIVISOR
    : ((value + GAMMA_OFFSET) / GAMMA_DIVISOR) ** GAMMA_EXPONENT;
}

/** WCAG relative luminance of a hex colour, 0 for black and 1 for white. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (
    LUMINANCE_R * linearize(r) +
    LUMINANCE_G * linearize(g) +
    LUMINANCE_B * linearize(b)
  );
}

/**
 * The contrast ratio between two colours, from 1 (identical) to 21 (black on
 * white). The argument order is documentation only — the ratio is symmetric.
 */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + FLARE) / (darker + FLARE);
}
