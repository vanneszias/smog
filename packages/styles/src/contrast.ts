import type { ColorRole } from "./tokens";

/** WCAG AA minimum for body text. */
export const AA_BODY = 4.5;
/** WCAG AA minimum for large text and UI components (1.4.3, 1.4.11). */
export const AA_LARGE = 3;

const HEX = /^#[0-9a-f]{6}$/i;
const LUMA = [0.2126, 0.7152, 0.0722] as const;

function channelLuminance(pair: string): number {
  const srgb = Number.parseInt(pair, 16) / 255;
  return srgb <= 0.040_45 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) {
    throw new Error(`[contrast] Expected a #RRGGBB hex colour, got "${hex}"`);
  }
  return LUMA.reduce((sum, weight, index) => {
    const start = 1 + index * 2;
    return sum + weight * channelLuminance(hex.slice(start, start + 2));
  }, 0);
}

/** WCAG 2.x contrast ratio between two `#RRGGBB` colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export interface ContrastPair {
  background: ColorRole;
  foreground: ColorRole;
  min: typeof AA_BODY | typeof AA_LARGE;
}

/** Every neutral the page, a card or a quiet control is drawn on. */
const PAGE_BACKGROUNDS = [
  "background",
  "surfaceSunken",
  "card",
  "popover",
  "muted",
  "secondary",
] as const satisfies readonly ColorRole[];

/** The page and the two raised surfaces a status icon sits on. */
const STATUS_ICON_BACKGROUNDS = [
  "background",
  "card",
  "popover",
] as const satisfies readonly ColorRole[];

/** Neutral backgrounds plus the quiet green hover/selected tint. */
const TEXT_BACKGROUNDS = [
  ...PAGE_BACKGROUNDS,
  "accent",
] as const satisfies readonly ColorRole[];

const SUBTLE_BACKGROUNDS = [
  "primarySubtle",
  "successSubtle",
  "warningSubtle",
  "dangerSubtle",
] as const satisfies readonly ColorRole[];

function on(
  foreground: ColorRole,
  backgrounds: readonly ColorRole[],
  min: ContrastPair["min"]
): ContrastPair[] {
  return backgrounds.map((background) => ({ background, foreground, min }));
}

/**
 * The foreground/background pairs the kits may use, asserted in both themes
 * by `contrast.test.ts`. Every colour role is in at least one pair, or in
 * `NON_TEXT_ROLES`.
 *
 * - Body text (4.5:1):
 *   - `foreground` and `mutedForeground` on every neutral
 *     background and the `accent` tint; `foreground` on each `*Subtle` tint;
 *   - each `*Foreground` on the fill it belongs to (`cardForeground` on
 *     `card`, `destructiveForeground` on `destructive`, ...);
 *   - **text on green**: `primaryForeground` and `primaryForegroundMuted`
 *     (secondary text) on `primary`; `sidebarForeground` and
 *     `sidebarForegroundMuted` on `sidebar`; `sidebarForeground` on
 *     `sidebarAccent`;
 *   - `primaryStrong`, `successStrong`, `warningStrong`, `dangerStrong` on
 *     their own `*Subtle` tint and on every neutral background (inline status
 *     text; `primaryStrong` is the green for text on warm neutrals);
 *   - `destructive` on the page backgrounds and `primarySubtle` (field errors).
 * - Large text and UI (3:1):
 *   - **green on warm neutral**: `primary` on every neutral background,
 *     `accent` and `primarySubtle` (links, icons, outlines); `success` and
 *     `warning` on the page backgrounds (status icons only, never text);
 *   - `input` (the form-control border) on every neutral background;
 *   - `ring` on every neutral background and the tints;
 *     `sidebarRing` on `sidebar` and `sidebarAccent`, `primaryRing` on `primary`;
 *   - `sidebarPrimary` (the active-item mark) on `sidebar`; `chart1` to
 *     `chart5` on the page backgrounds `background`, `card`, `popover`.
 *
 * Not allowed: `success`/`warning` as fills under white text (4.38 and
 * 3.64:1 in light); use the `*Subtle` + `*Strong` pair instead.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...on("foreground", [...TEXT_BACKGROUNDS, ...SUBTLE_BACKGROUNDS], AA_BODY),
  ...on("mutedForeground", TEXT_BACKGROUNDS, AA_BODY),
  ...on("cardForeground", ["card"], AA_BODY),
  ...on("popoverForeground", ["popover"], AA_BODY),
  ...on("secondaryForeground", ["secondary"], AA_BODY),
  ...on("accentForeground", ["accent"], AA_BODY),
  ...on("highlightForeground", ["highlight"], AA_BODY),
  ...on("destructiveForeground", ["destructive"], AA_BODY),
  ...on("primaryForeground", ["primary", "destructive"], AA_BODY),
  ...on("primaryForegroundMuted", ["primary"], AA_BODY),
  ...on("sidebarForegroundMuted", ["sidebar"], AA_BODY),
  ...on("sidebarForeground", ["sidebar", "sidebarAccent"], AA_BODY),
  ...on("sidebarAccentForeground", ["sidebarAccent"], AA_BODY),
  ...on("sidebarPrimaryForeground", ["sidebarPrimary"], AA_BODY),
  ...on("primaryStrong", [...TEXT_BACKGROUNDS, "primarySubtle"], AA_BODY),
  ...on("successStrong", [...TEXT_BACKGROUNDS, "successSubtle"], AA_BODY),
  ...on("warningStrong", [...TEXT_BACKGROUNDS, "warningSubtle"], AA_BODY),
  ...on("dangerStrong", [...PAGE_BACKGROUNDS, "dangerSubtle"], AA_BODY),
  ...on("destructive", [...PAGE_BACKGROUNDS, "primarySubtle"], AA_BODY),
  ...on("primary", [...TEXT_BACKGROUNDS, "primarySubtle"], AA_LARGE),
  ...on("success", STATUS_ICON_BACKGROUNDS, AA_LARGE),
  ...on("warning", STATUS_ICON_BACKGROUNDS, AA_LARGE),
  ...on("input", PAGE_BACKGROUNDS, AA_LARGE),
  ...on("ring", [...TEXT_BACKGROUNDS, "primarySubtle"], AA_LARGE),
  ...on("sidebarRing", ["sidebar", "sidebarAccent"], AA_LARGE),
  ...on("primaryRing", ["primary"], AA_LARGE),
  ...on("sidebarPrimary", ["sidebar"], AA_LARGE),
  ...on("destructive", [...TEXT_BACKGROUNDS], AA_LARGE),
  ...["chart1", "chart2", "chart3", "chart4", "chart5"].flatMap((chart) =>
    on(chart as ColorRole, ["background", "card", "popover"], AA_LARGE)
  ),
];

/**
 * Roles that never carry text or a UI boundary that must meet 3:1: the
 * decorative borders (functional edges use `input`).
 */
export const NON_TEXT_ROLES: readonly ColorRole[] = [
  "border",
  "borderSubtle",
  "sidebarBorder",
];
