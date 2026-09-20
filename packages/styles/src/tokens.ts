/**
 * The single source of truth for SMOG design tokens.
 *
 * Native consumes this object directly; web renders it to CSS custom
 * properties through `toCssVariables` in `./css`. One object, two renderings —
 * nothing else is allowed to declare a colour, a spacing step or a radius.
 */

import { mixHex, parseHex } from "./hex";

const WHITE = "#FFFFFF";
const BLACK = "#000000";

/**
 * The brand palette, from the brand guidelines. These five values are fixed:
 * everything around them may move, they may not.
 */
const brand = {
  primary: "#00805F",
  secondary: "#97C699",
  accent: "#EE971C",
  warning: "#F0C814",
  error: "#FF3B30",
} as const;

const RAMP_STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

type RampStep = (typeof RAMP_STEPS)[number];

export type ColorRamp = { readonly [Step in RampStep]: string };

/** How far the lightest and darkest ends of a ramp travel from its anchor. */
const TINT_LIMIT = 0.95;
const SHADE_LIMIT = 0.8;

/**
 * Builds a 50–950 ramp around a fixed brand colour. The anchor step returns the
 * brand value byte for byte, so `brandScale.primary[600] === brand.primary`.
 */
function createRamp(base: string, anchor: RampStep): ColorRamp {
  const anchorIndex = RAMP_STEPS.indexOf(anchor);
  const lastIndex = RAMP_STEPS.length - 1;

  const entries = RAMP_STEPS.map((step, index) => {
    if (index === anchorIndex) {
      return [step, base] as const;
    }
    if (index < anchorIndex) {
      const amount = ((anchorIndex - index) / anchorIndex) * TINT_LIMIT;
      return [step, mixHex(base, WHITE, amount)] as const;
    }
    const amount =
      ((index - anchorIndex) / (lastIndex - anchorIndex)) * SHADE_LIMIT;
    return [step, mixHex(base, BLACK, amount)] as const;
  });

  return Object.fromEntries(entries) as ColorRamp;
}

/**
 * Grey ramp, on the conventional shape: small lightness steps at the light end,
 * the widest jumps across 300–500, then an even march to black. No step is
 * tuned for a particular consumer — the semantic roles below pick the step that
 * does the job, rather than the ramp bending to make one step do two.
 */
const neutral = {
  50: "#F7F8F9",
  100: "#EDEFF1",
  200: "#DDE1E4",
  300: "#C3C8CD",
  400: "#9BA2AA",
  500: "#6E757C",
  600: "#565C63",
  700: "#40454B",
  800: "#2B2F34",
  900: "#1A1D21",
  950: "#0E1013",
} as const;

/**
 * Each brand colour expanded to a ramp, anchored at the step its own lightness
 * already occupies.
 */
const brandScale = {
  primary: createRamp(brand.primary, 600),
  secondary: createRamp(brand.secondary, 300),
  accent: createRamp(brand.accent, 500),
  warning: createRamp(brand.warning, 400),
  error: createRamp(brand.error, 500),
} as const;

/**
 * Semantic roles. A component author reads these, never `brand` or a ramp
 * step: `primary` says nothing about whether text is safe on it,
 * `primaryForeground` does.
 *
 * Usage rule behind the pairings: interactive surfaces (`primary`, `danger`)
 * take a ramp step dark enough to carry white text, because a button is read as
 * an action. Status surfaces (`accent`, `warning`, `success`) keep the brand
 * hue and carry near-black text, because a badge is read as a label.
 * Every pair here is asserted against WCAG AA in `contrast.test.ts`.
 *
 * Three border roles, and choosing between them is not a matter of taste:
 *
 * - `borderSubtle` is decoration. A rule between list rows, a card edge whose
 *   absence loses no information. WCAG 1.4.11 does not cover decoration, so
 *   this one is deliberately below 3:1 and must stay visually quiet.
 * - `border` is functional: the edge of an input, anything delimiting an
 *   interactive control, anything carrying state. It meets 3:1 against both
 *   `background` and `surface`, and `contrast.test.ts` holds it there.
 * - `borderStrong` is emphasis on top of that — a selected or focused edge.
 *
 * If a boundary would change what a user understands were it removed, it is a
 * `border`, not a `borderSubtle`. The strength order between the three is also
 * asserted, so the decorative one cannot quietly take the functional one's job.
 */
const semantic = {
  light: {
    background: WHITE,
    surface: neutral[50],
    surfaceRaised: WHITE,
    borderSubtle: neutral[200],
    border: neutral[500],
    borderStrong: neutral[600],
    foreground: neutral[900],
    foregroundMuted: neutral[600],
    primary: brandScale.primary[600],
    primaryForeground: WHITE,
    accent: brandScale.accent[500],
    accentForeground: neutral[950],
    success: brandScale.secondary[300],
    successForeground: neutral[950],
    warning: brandScale.warning[400],
    warningForeground: neutral[950],
    danger: brandScale.error[600],
    dangerForeground: WHITE,
    ring: brandScale.primary[600],
  },
  dark: {
    background: neutral[950],
    surface: neutral[900],
    surfaceRaised: neutral[800],
    borderSubtle: neutral[700],
    border: neutral[500],
    borderStrong: neutral[400],
    foreground: neutral[50],
    foregroundMuted: neutral[400],
    primary: brandScale.primary[400],
    primaryForeground: neutral[950],
    accent: brandScale.accent[400],
    accentForeground: neutral[950],
    success: brandScale.secondary[300],
    successForeground: neutral[950],
    warning: brandScale.warning[400],
    warningForeground: neutral[950],
    danger: brandScale.error[400],
    dangerForeground: neutral[950],
    ring: brandScale.primary[400],
  },
} as const;

/** Unitless, on a 4px base. Native uses them as-is; web gets `px` appended. */
const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

const PILL_RADIUS = 9999;

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: PILL_RADIUS,
} as const;

const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

const lineHeight = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  xxl: 40,
} as const;

const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

const iconSize = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 40,
} as const;

const duration = {
  fast: 150,
  normal: 250,
  slow: 350,
} as const;

/**
 * Raw elevation, cross-platform. Stage 8 maps `level` onto Android elevation;
 * `shadow` below is the web rendering of the same numbers.
 */
const elevation = {
  sm: { offsetY: 1, blur: 2, opacity: 0.08, level: 2 },
  md: { offsetY: 2, blur: 4, opacity: 0.12, level: 3 },
  lg: { offsetY: 4, blur: 8, opacity: 0.2, level: 5 },
} as const;

function toBoxShadow(step: (typeof elevation)[keyof typeof elevation]): string {
  const [r, g, b] = parseHex(brand.primary);
  return `0 ${step.offsetY}px ${step.blur}px 0 rgba(${r}, ${g}, ${b}, ${step.opacity})`;
}

const shadow = {
  sm: toBoxShadow(elevation.sm),
  md: toBoxShadow(elevation.md),
  lg: toBoxShadow(elevation.lg),
} as const;

export const tokens = {
  color: {
    white: WHITE,
    brand,
    neutral,
    brandScale,
  },
  semantic,
  spacing,
  radius,
  fontSize,
  lineHeight,
  fontWeight,
  iconSize,
  duration,
  elevation,
  shadow,
} as const;

export type Tokens = typeof tokens;

/** A semantic theme name. Both themes define exactly the same role names. */
export type ThemeName = keyof Tokens["semantic"];

/** The semantic role names, identical in both themes. */
export type SemanticRole = keyof Tokens["semantic"]["light"];
