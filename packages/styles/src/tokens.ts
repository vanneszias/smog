/**
 * SMOG design tokens: the only place a colour, spacing step, radius, type
 * size, shadow, duration or breakpoint is written (spec §16).
 *
 * Numbers are unitless px/pt. The web theme (`generate-web.ts`) renders them
 * to Tailwind v4 CSS (rem for lengths), the native preset
 * (`generate-native.ts`) to a NativeWind Tailwind 3 config (px). Both outputs
 * are committed under `generated/` and drift-tested.
 */

/** The brand palette. Fixed by the brand guidelines. */
const brand = {
  green: "#00805F",
  orange: "#EE971C",
  white: "#FFFFFF",
} as const;

/**
 * Colour roles, light and dark, as spec §16 lists them. Two amendments are
 * recorded in docs/DECISIONS.md:
 *
 * - The light `focusRing` is a darker shade of the brand orange, because
 *   `#EE971C` measures 2.19:1 on `background` and a focus indicator needs
 *   3:1 (WCAG 1.4.11).
 * - Text roles for the status hues. `*Subtle` is a tinted background
 *   (badges, banners), `*Strong` is the shade of the hue that passes as body
 *   text on its subtle tint and on every page background, and
 *   `accentForeground` is text on an `accent` fill (like
 *   `primaryForeground` on `primary`). The base `success`/`warning`/`danger`
 *   stay the §16 hues, for icons and fills.
 */
const light = {
  accent: brand.orange,
  accentForeground: "#17211A",
  background: "#F7F9F7",
  border: "#D2DAD3",
  borderSubtle: "#E4EAE4",
  danger: "#C62828",
  dangerStrong: "#A61F1F",
  dangerSubtle: "#FBE9E9",
  focusRing: "#C3780F",
  foreground: "#17211A",
  foregroundMuted: "#55635A",
  primary: brand.green,
  primaryForeground: "#FFFFFF",
  primaryStrong: "#00694E",
  primarySubtle: "#E3F2EC",
  success: "#1F8A4C",
  successStrong: "#166B3A",
  successSubtle: "#E3F3EA",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#EEF3EE",
  warning: "#B7791F",
  warningStrong: "#7A4D06",
  warningSubtle: "#FBF0DA",
} as const;

export type ColorRole = keyof typeof light;

const dark: { readonly [Role in ColorRole]: string } = {
  accent: "#F5AB45",
  accentForeground: "#04140E",
  background: "#0F1210",
  border: "#343B36",
  borderSubtle: "#262C28",
  danger: "#F16B6B",
  dangerStrong: "#F16B6B",
  dangerSubtle: "#3A1717",
  focusRing: "#F5AB45",
  foreground: "#EEF3EF",
  foregroundMuted: "#A5B2A9",
  primary: "#2BB38A",
  primaryForeground: "#04140E",
  primaryStrong: "#2BB38A",
  primarySubtle: "#0F2A21",
  success: "#4CC27E",
  successStrong: "#4CC27E",
  successSubtle: "#123021",
  surface: "#171B18",
  surfaceRaised: "#1E2320",
  surfaceSunken: "#0B0D0C",
  warning: "#E9B24A",
  warningStrong: "#E9B24A",
  warningSubtle: "#33260B",
};

interface TypeStep {
  lineHeight: number;
  /** Web only: the size from the `md` breakpoint up. */
  md?: { size: number; lineHeight: number };
  size: number;
}

const fontSize = {
  body: { lineHeight: 24, size: 16 },
  "body-sm": { lineHeight: 20, size: 14 },
  caption: { lineHeight: 16, size: 12 },
  display: { lineHeight: 48, md: { lineHeight: 64, size: 56 }, size: 40 },
  "title-1": { lineHeight: 34, size: 28 },
  "title-2": { lineHeight: 28, size: 22 },
  "title-3": { lineHeight: 24, size: 18 },
} as const satisfies Record<string, TypeStep>;

const fontWeight = {
  medium: 500,
  regular: 400,
  semibold: 600,
} as const;

const fontFamily = {
  /** Inter on web (Google Fonts), the system font elsewhere. */
  web: [
    "Inter",
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    '"Segoe UI"',
    "Roboto",
    "sans-serif",
  ],
} as const;

/**
 * The 4 pt spacing scale. Keys follow Tailwind's convention (key × 4 = pt),
 * so `p-4` is 16 on both platforms. `touch` is the minimum tap target.
 */
const touchTarget = 44;

const spacing = {
  "0": 0,
  "0.5": 2,
  "1": 4,
  "2": 8,
  "3": 12,
  "4": 16,
  "5": 20,
  "6": 24,
  "8": 32,
  "10": 40,
  "12": 48,
  "16": 64,
  touch: touchTarget,
} as const;

const radius = {
  full: 9999,
  lg: 14,
  md: 10,
  sm: 6,
  xl: 20,
} as const;

/** Screen layout: gutters per breakpoint and the maximum widths. */
const layout = {
  contentMaxWidth: 1200,
  gutter: { desktop: 32, mobile: 16, tablet: 24 },
  /** Maximum reading line length, in `ch`. */
  readingMaxWidthCh: 72,
} as const;

const breakpoint = {
  lg: 1024,
  md: 768,
  sm: 640,
  xl: 1280,
} as const;

/** One shadow layer; the native params and the web box-shadow share it. */
interface ShadowLayer {
  blur: number;
  offsetY: number;
  opacity: number;
}

interface ElevationStep {
  /** Android `elevation`. */
  androidElevation: number;
  /**
   * Dark-theme shadow layers. Level 1 has none: in dark mode a raised card
   * is drawn with a border and `surfaceRaised` instead (spec §16).
   */
  dark: readonly ShadowLayer[];
  /** Light-theme shadow layers (web draws all, native the first). */
  light: readonly ShadowLayer[];
}

/** The shadow colour; its alpha comes from each layer. */
const SHADOW_RGB = {
  dark: "0 0 0",
  light: "23 33 26",
} as const;

const elevation = {
  "0": { androidElevation: 0, dark: [], light: [] },
  "1": {
    androidElevation: 2,
    dark: [],
    light: [
      { blur: 2, offsetY: 1, opacity: 0.06 },
      { blur: 6, offsetY: 2, opacity: 0.08 },
    ],
  },
  "2": {
    androidElevation: 8,
    dark: [{ blur: 32, offsetY: 12, opacity: 0.56 }],
    light: [
      { blur: 6, offsetY: 2, opacity: 0.08 },
      { blur: 32, offsetY: 12, opacity: 0.16 },
    ],
  },
  "3": {
    androidElevation: 12,
    dark: [{ blur: 40, offsetY: 16, opacity: 0.64 }],
    light: [
      { blur: 12, offsetY: 4, opacity: 0.1 },
      { blur: 40, offsetY: 16, opacity: 0.2 },
    ],
  },
} as const satisfies Record<string, ElevationStep>;

export type ElevationLevel = keyof typeof elevation;

/** React Native shadow style props for one elevation level and theme. */
export interface NativeShadow {
  elevation: number;
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
}

/**
 * The native rendering of an elevation step: the strongest layer (RN draws
 * one shadow), with the Android elevation.
 */
export function nativeShadow(
  level: ElevationLevel,
  theme: "light" | "dark"
): NativeShadow {
  const step: ElevationStep = elevation[level];
  const layers = step[theme];
  const layer = layers.at(-1) ?? { blur: 0, offsetY: 0, opacity: 0 };
  return {
    elevation: layers.length > 0 ? step.androidElevation : 0,
    shadowColor: theme === "light" ? light.foreground : "#000000",
    shadowOffset: { height: layer.offsetY, width: 0 },
    shadowOpacity: layer.opacity,
    shadowRadius: layer.blur / 2,
  };
}

/** The web rendering of an elevation step, as a CSS `box-shadow` value. */
export function boxShadow(
  level: ElevationLevel,
  theme: "light" | "dark"
): string {
  const step: ElevationStep = elevation[level];
  const layers = step[theme];
  if (layers.length === 0) {
    return "none";
  }
  return layers
    .map(
      (layer) =>
        `0 ${layer.offsetY}px ${layer.blur}px rgb(${SHADOW_RGB[theme]} / ${layer.opacity})`
    )
    .join(", ");
}

const motion = {
  duration: { fast: 120, normal: 200, slow: 320 },
  easing: { standard: [0.2, 0, 0, 1] },
  /** The favorite heart's pop peaks at this scale (web keyframes, native Reanimated). */
  popScale: 1.25,
} as const;

export const tokens = {
  breakpoint,
  color: { brand, dark, light },
  elevation,
  fontFamily,
  fontSize,
  fontWeight,
  layout,
  motion,
  radius,
  spacing,
  touchTarget,
} as const;

export type Tokens = typeof tokens;
export type ThemeName = "light" | "dark";
