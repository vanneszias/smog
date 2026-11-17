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
 * `sidebar-*`, `chart-*`) so registry components compile unchanged. The
 * phase 1 to 9 names that duplicated one (`surface`, `surfaceRaised`,
 * `danger`, `focusRing`, `foregroundMuted`) are gone (task 9). The brand
 * identity pass (DECISIONS, "Brand identity: colour") retuned the values:
 *
 * - **Green says where you are.** The `sidebar` family is the deep green
 *   surface: the header, the home hero, the auth panel, the native stack
 *   headers and the admin rail, in both themes. Its light value is a step
 *   deeper than the studio teal behind every gesture video (`#0B5F55`), so
 *   the interface and the videos read as one place, and deep enough for an
 *   orange mark to reach 3:1 on it. Dark mode keeps it a deep green with
 *   light text (no mint slab). Its hover is `sidebarAccent`, its active mark
 *   `sidebarPrimary` (orange) and its focus ring `sidebarRing` (white).
 * - **`primary` is the brand green `#00805F` for controls**: buttons, links,
 *   switches, checkboxes, the stepper. It is not a large surface any more
 *   (white text on it has little headroom, and in dark it is a light mint
 *   under dark text). `primaryStrong` is the green for text on light
 *   neutrals and for pressed states.
 * - **Orange means "do it"**, as `highlight`: a fill under dark ink
 *   (`highlightForeground`; the play button, the search action, the active
 *   filter, the primary action on deep green) or a mark on the deep green
 *   (`sidebarPrimary`). It is never text on a light surface: orange text or
 *   icons on a light surface use the darker `highlightStrong`.
 * - **Neutrals are a cool paper** with a trace of green (no cream); dark
 *   mode is a deep teal-black. shadcn's own `accent` is a quiet green tint
 *   for hover and selected rows, so registry code looks right.
 * - The light `ring` is a darker orange than the brand orange: `#EE971C`
 *   measures 2.31:1 on white and a focus indicator needs 3:1 (WCAG 1.4.11).
 *   On green surfaces the focus ring is white (`sidebarRing`, `primaryRing`).
 * - Text roles for the status hues: `*Subtle` is a tinted background,
 *   `*Strong` the shade that passes as body text on it and on every page
 *   background. The base `success`/`warning` stay for icons and fills; they
 *   are not fills under white text (4.38 and 3.64:1).
 */
const light = {
  accent: "#E4F1EA",
  accentForeground: "#17211A",
  background: "#F6F8F5",
  border: "#D5DED7",
  borderSubtle: "#E3E9E4",
  card: "#FFFFFF",
  cardForeground: "#17211A",
  chart1: "#00805F",
  chart2: "#B36B0B",
  chart3: "#2F6DB5",
  chart4: "#8250B5",
  chart5: "#C0392B",
  dangerStrong: "#A61F1F",
  dangerSubtle: "#FBE9E9",
  destructive: "#C62828",
  destructiveForeground: "#FFFFFF",
  foreground: "#17211A",
  highlight: brand.orange,
  highlightForeground: "#17211A",
  highlightStrong: "#9A5700",
  input: "#6E7B72",
  muted: "#ECF1EC",
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
  secondary: "#E7EDE8",
  secondaryForeground: "#17211A",
  sidebar: "#09564C",
  sidebarAccent: "#0F6A5E",
  sidebarAccentForeground: "#FFFFFF",
  sidebarBorder: "#2E7A6F",
  sidebarForeground: "#FFFFFF",
  sidebarForegroundMuted: "#D3E9E2",
  sidebarPrimary: brand.orange,
  sidebarPrimaryForeground: "#17211A",
  sidebarRing: "#FFFFFF",
  success: "#1F8A4C",
  successStrong: "#166B3A",
  successSubtle: "#E3F3EA",
  surfaceSunken: "#ECF1EC",
  warning: "#B7791F",
  warningStrong: "#7A4D06",
  warningSubtle: "#FBF0DA",
} as const;

export type ColorRole = keyof typeof light;

const dark: { readonly [Role in ColorRole]: string } = {
  accent: "#163631",
  accentForeground: "#EAF1EC",
  background: "#0C1513",
  border: "#283631",
  borderSubtle: "#1C2723",
  card: "#121D1A",
  cardForeground: "#EAF1EC",
  chart1: "#2BB38A",
  chart2: "#F5AB45",
  chart3: "#6FA8F0",
  chart4: "#B994E8",
  chart5: "#F08A7E",
  dangerStrong: "#F16B6B",
  dangerSubtle: "#3A1717",
  destructive: "#F16B6B",
  destructiveForeground: "#1C0707",
  foreground: "#EAF1EC",
  highlight: "#F5AB45",
  highlightForeground: "#04140E",
  highlightStrong: "#F5AB45",
  input: "#6C817A",
  muted: "#18231F",
  mutedForeground: "#9DB2AA",
  popover: "#18241F",
  popoverForeground: "#EAF1EC",
  primary: "#2BB38A",
  primaryForeground: "#04140E",
  primaryForegroundMuted: "#0A3526",
  primaryRing: "#04140E",
  primaryStrong: "#2BB38A",
  primarySubtle: "#0E2A25",
  ring: "#F5AB45",
  secondary: "#1C2823",
  secondaryForeground: "#EAF1EC",
  sidebar: "#0E2E29",
  sidebarAccent: "#174A41",
  sidebarAccentForeground: "#EAF1EC",
  sidebarBorder: "#1F4A42",
  sidebarForeground: "#EAF1EC",
  sidebarForegroundMuted: "#A9C7BE",
  sidebarPrimary: "#F5AB45",
  sidebarPrimaryForeground: "#04140E",
  sidebarRing: "#EAF1EC",
  success: "#4CC27E",
  successStrong: "#4CC27E",
  successSubtle: "#123021",
  surfaceSunken: "#070D0B",
  warning: "#E9B24A",
  warningStrong: "#E9B24A",
  warningSubtle: "#33260B",
};

/**
 * The colours outside the page: the browser bar (`<meta name="theme-color">`
 * per scheme), the web manifest's `theme_color` and `background_color` (the
 * installed app's title bar and splash) all follow the header's deep green,
 * so the chrome, the header and the native splash read as one band
 * (DECISIONS, "Brand identity: the browser bar follows the header").
 */
const chrome = {
  manifestBackground: light.sidebar,
  manifestTheme: light.sidebar,
  themeColor: { dark: dark.sidebar, light: light.sidebar },
} as const;

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
  chrome,
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
