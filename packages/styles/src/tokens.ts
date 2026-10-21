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
 * Colour roles, light and dark. Phase 10a (docs/DECISIONS.md, "phase 10a
 * task 1") opens the vocabulary to shadcn's semantic names (`card`,
 * `popover`, `secondary`, `muted`, `accent`, `destructive`, `input`, `ring`,
 * `sidebar-*`, `chart-*`) so registry components compile unchanged, and keeps
 * the phase 1 to 9 names as aliases until the phase closes (`ALIASES`
 * below; the unmigrated screens keep compiling).
 *
 * - **Green is a surface.** `primary` with `primaryForeground` (white) is
 *   the filled green: buttons, the hero, the auth screens. `sidebar` with
 *   `sidebarForeground` is the deeper green of the header and the admin
 *   sidebar; its hover, active and ring roles are tuned for text and focus on
 *   green. `primaryStrong` is the deeper green for text on warm neutrals and
 *   for pressed states.
 * - **Orange is the accent**, as `highlight` (+ `highlightForeground`). It is
 *   never text on a light surface. shadcn's own `accent` is a quiet green
 *   tint for hover and selected rows, so registry code looks right.
 * - **Neutrals are warm** with a faint green tint; dark mode is a deep
 *   green-black.
 * - The light `ring` is a darker orange than the brand orange: `#EE971C`
 *   measures 2.19:1 on white and a focus indicator needs 3:1 (WCAG 1.4.11).
 *   On green surfaces the focus ring is `sidebarRing` (white).
 * - Text roles for the status hues: `*Subtle` is a tinted background,
 *   `*Strong` the shade that passes as body text on it and on every page
 *   background. The base `success`/`warning` stay for icons and fills; they
 *   are not fills under white text (4.38 and 3.64:1).
 */
const light = {
  accent: "#E4F1EA",
  accentForeground: "#17211A",
  background: "#FAF9F4",
  border: "#DCD8CB",
  borderSubtle: "#EBE8DE",
  card: "#FFFFFF",
  cardForeground: "#17211A",
  chart1: "#00805F",
  chart2: "#B36B0B",
  chart3: "#2F6DB5",
  chart4: "#8250B5",
  chart5: "#C0392B",
  danger: "#C62828",
  dangerStrong: "#A61F1F",
  dangerSubtle: "#FBE9E9",
  destructive: "#C62828",
  destructiveForeground: "#FFFFFF",
  focusRing: "#B36B0B",
  foreground: "#17211A",
  foregroundMuted: "#56635A",
  highlight: brand.orange,
  highlightForeground: "#17211A",
  input: "#6E7B72",
  muted: "#F2F0E8",
  mutedForeground: "#56635A",
  popover: "#FFFFFF",
  popoverForeground: "#17211A",
  primary: brand.green,
  primaryForeground: "#FFFFFF",
  primaryForegroundMuted: "#F0F9F5",
  primaryRing: "#FFFFFF",
  primaryStrong: "#006B50",
  primarySubtle: "#E4F1EA",
  ring: "#B36B0B",
  secondary: "#EFEDE3",
  secondaryForeground: "#17211A",
  sidebar: "#006B50",
  sidebarAccent: "#00805F",
  sidebarAccentForeground: "#FFFFFF",
  sidebarBorder: "#2F8F77",
  sidebarForeground: "#FFFFFF",
  sidebarForegroundMuted: "#E3F3EC",
  sidebarPrimary: "#F5AB45",
  sidebarPrimaryForeground: "#17211A",
  sidebarRing: "#FFFFFF",
  success: "#1F8A4C",
  successStrong: "#166B3A",
  successSubtle: "#E3F3EA",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#F2F0E8",
  warning: "#B7791F",
  warningStrong: "#7A4D06",
  warningSubtle: "#FBF0DA",
} as const;

export type ColorRole = keyof typeof light;

const dark: { readonly [Role in ColorRole]: string } = {
  accent: "#17352A",
  accentForeground: "#EAF1EC",
  background: "#0C110E",
  border: "#2B352E",
  borderSubtle: "#1F2722",
  card: "#131914",
  cardForeground: "#EAF1EC",
  chart1: "#2BB38A",
  chart2: "#F5AB45",
  chart3: "#6FA8F0",
  chart4: "#B994E8",
  chart5: "#F08A7E",
  danger: "#F16B6B",
  dangerStrong: "#F16B6B",
  dangerSubtle: "#3A1717",
  destructive: "#F16B6B",
  destructiveForeground: "#1C0707",
  focusRing: "#F5AB45",
  foreground: "#EAF1EC",
  foregroundMuted: "#9DB0A4",
  highlight: "#F5AB45",
  highlightForeground: "#04140E",
  input: "#6F8076",
  muted: "#1B231E",
  mutedForeground: "#9DB0A4",
  popover: "#1A211C",
  popoverForeground: "#EAF1EC",
  primary: "#2BB38A",
  primaryForeground: "#04140E",
  primaryForegroundMuted: "#0A3526",
  primaryRing: "#04140E",
  primaryStrong: "#2BB38A",
  primarySubtle: "#0F2A21",
  ring: "#F5AB45",
  secondary: "#1F2823",
  secondaryForeground: "#EAF1EC",
  sidebar: "#0F2A21",
  sidebarAccent: "#17402F",
  sidebarAccentForeground: "#EAF1EC",
  sidebarBorder: "#1F4A39",
  sidebarForeground: "#EAF1EC",
  sidebarForegroundMuted: "#9DB0A4",
  sidebarPrimary: "#F5AB45",
  sidebarPrimaryForeground: "#04140E",
  sidebarRing: "#F5AB45",
  success: "#4CC27E",
  successStrong: "#4CC27E",
  successSubtle: "#123021",
  surface: "#131914",
  surfaceRaised: "#1A211C",
  surfaceSunken: "#080B09",
  warning: "#E9B24A",
  warningStrong: "#E9B24A",
  warningSubtle: "#33260B",
};

/**
 * The phase 1 to 9 role names that now mean a shadcn role. The values are
 * kept equal (a test), so a screen on the old name and a registry component
 * on the new one never disagree. Phase 10a task 9 removes the old names.
 * (`accent` changed meaning: the orange is `highlight` now.)
 */
export const ALIASES = {
  danger: "destructive",
  focusRing: "ring",
  foregroundMuted: "mutedForeground",
  surface: "card",
  surfaceRaised: "popover",
} as const satisfies Partial<Record<ColorRole, ColorRole>>;

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

const SYSTEM_SANS = [
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  '"Segoe UI"',
  "Roboto",
  "sans-serif",
] as const;

const fontFamily = {
  /**
   * Email clients have no web fonts: the system stack, resolved to literals
   * by `@smog/email`.
   */
  email: SYSTEM_SANS,
  /**
   * Figtree on the apps: one embedded font file per weight (a custom font
   * ignores `fontWeight` on Android), named by its PostScript name, which is
   * also the file name in `apps/mobile/assets/fonts` (`expo-font` plugin).
   */
  native: {
    bold: "Figtree-Bold",
    medium: "Figtree-Medium",
    regular: "Figtree-Regular",
    semibold: "Figtree-SemiBold",
  },
  /**
   * Figtree on web, self-hosted (`apps/site/src/styles.css` declares the
   * face and `Figtree Fallback`, a size-adjusted local font that keeps the
   * layout still while it loads), then the system fonts.
   */
  web: ["Figtree", '"Figtree Fallback"', ...SYSTEM_SANS],
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
