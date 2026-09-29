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

const PAGE_BACKGROUNDS = [
  "background",
  "surface",
  "surfaceRaised",
  "surfaceSunken",
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
 *   - `foreground` and `foregroundMuted` on every page background, and
 *     `foreground` on each `*Subtle` tint;
 *   - `primaryForeground` on `primary` and `danger` (filled buttons);
 *     `accentForeground` on `accent` (the accent badge);
 *   - `primaryStrong`, `successStrong`, `warningStrong`, `dangerStrong` on
 *     their own `*Subtle` tint (badges, banners, StatusBadge) and on every
 *     page background (inline status text);
 *   - `danger` on every page background and `primarySubtle` (field errors).
 * - Large text and UI (3:1): `primary` on page backgrounds and
 *   `primarySubtle` (links, icons, selected outlines); `success` and
 *   `warning` on page backgrounds (status icons only, never text);
 *   `focusRing` on every background it can sit on.
 *
 * Not allowed: `success`/`warning` as fills under `primaryForeground`
 * (4.38 and 3.64:1 in light); use the `*Subtle` + `*Strong` pair instead.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...on("foreground", [...PAGE_BACKGROUNDS, ...SUBTLE_BACKGROUNDS], AA_BODY),
  ...on("foregroundMuted", PAGE_BACKGROUNDS, AA_BODY),
  ...on("primaryForeground", ["primary", "danger"], AA_BODY),
  ...on("accentForeground", ["accent"], AA_BODY),
  ...on("primaryStrong", [...PAGE_BACKGROUNDS, "primarySubtle"], AA_BODY),
  ...on("successStrong", [...PAGE_BACKGROUNDS, "successSubtle"], AA_BODY),
  ...on("warningStrong", [...PAGE_BACKGROUNDS, "warningSubtle"], AA_BODY),
  ...on("dangerStrong", [...PAGE_BACKGROUNDS, "dangerSubtle"], AA_BODY),
  ...on("danger", [...PAGE_BACKGROUNDS, "primarySubtle"], AA_BODY),
  ...on("primary", [...PAGE_BACKGROUNDS, "primarySubtle"], AA_LARGE),
  ...on("success", PAGE_BACKGROUNDS.slice(0, 3), AA_LARGE),
  ...on("warning", PAGE_BACKGROUNDS.slice(0, 3), AA_LARGE),
  ...on("focusRing", [...PAGE_BACKGROUNDS, "primarySubtle"], AA_LARGE),
];

/**
 * Roles that never carry text or a UI boundary that must meet 3:1: the
 * decorative borders (functional edges use `foregroundMuted`).
 */
export const NON_TEXT_ROLES: readonly ColorRole[] = ["border", "borderSubtle"];
